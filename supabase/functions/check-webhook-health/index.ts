import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Read configurable thresholds from system_settings
    const { data: settingsData } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['webhook_stale_threshold_min', 'webhook_alert_cooldown_min']);

    const staleThresholdMin = parseInt(
      settingsData?.find((s: any) => s.key === 'webhook_stale_threshold_min')?.value || '5', 10
    );
    const cooldownMin = parseInt(
      settingsData?.find((s: any) => s.key === 'webhook_alert_cooldown_min')?.value || '15', 10
    );

    // Find all enabled webhook meters
    const { data: meters, error } = await supabase
      .from('energy_meters')
      .select('id, name, shelly_device_id, last_poll_at, meter_type')
      .eq('connection_type', 'webhook')
      .eq('enabled', true);

    if (error) throw error;
    if (!meters?.length) {
      return jsonRes({ success: true, checked: 0, stale: 0 });
    }

    const now = Date.now();
    const staleThresholdMs = staleThresholdMin * 60 * 1000;
    const cooldownMs = cooldownMin * 60 * 1000;
    const staleMeters: any[] = [];

    for (const meter of meters) {
      if (!meter.last_poll_at) {
        // Never received data — skip unless it was created >5 min ago
        continue;
      }

      const lastSeen = new Date(meter.last_poll_at).getTime();
      const ageSec = Math.round((now - lastSeen) / 1000);

      if (now - lastSeen > staleThresholdMs) {
        // Check cooldown: don't re-alert if we already alerted recently
        const cooldownAgo = new Date(now - cooldownMs).toISOString();
        const { data: recentAlerts } = await supabase
          .from('grid_alerts')
          .select('id')
          .eq('meter_id', meter.id)
          .eq('metric', 'webhook_offline')
          .gte('created_at', cooldownAgo)
          .limit(1);

        if (recentAlerts && recentAlerts.length > 0) {
          continue; // Already alerted recently
        }

        staleMeters.push({ ...meter, ageSec });

        // Persist alert to grid_alerts
        await supabase.from('grid_alerts').insert({
          meter_id: meter.id,
          channel: 0,
          metric: 'webhook_offline',
          value: ageSec,
          threshold_min: 0,
          threshold_max: staleThresholdMin * 60,
          direction: 'high',
          unit: 's',
        });

        // Send notification via existing channels
        const ageLabel = ageSec > 3600
          ? `${Math.floor(ageSec / 3600)}u ${Math.floor((ageSec % 3600) / 60)}m`
          : `${Math.floor(ageSec / 60)}m`;

        try {
          await fetch(`${supabaseUrl}/functions/v1/send-alert-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              metric: 'webhook_offline',
              label: `Webhook Offline: ${meter.name}`,
              value: ageSec,
              unit: 's',
              direction: 'high',
              channel: 0,
              meter_id: meter.id,
              threshold_min: 0,
              threshold_max: staleThresholdMin * 60,
            }),
            signal: AbortSignal.timeout(10000),
          });
        } catch (notifErr) {
          console.error(`Failed to send webhook offline notification for ${meter.name}:`, notifErr);
        }
      }
    }

    return jsonRes({
      success: true,
      checked: meters.length,
      stale: staleMeters.length,
      stale_meters: staleMeters.map(m => ({
        id: m.id,
        name: m.name,
        age_sec: m.ageSec,
      })),
    });
  } catch (error) {
    console.error('Webhook health check error:', error);
    return jsonRes({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});

function jsonRes(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
