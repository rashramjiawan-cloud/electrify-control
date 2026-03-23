import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function validateApiKey(req: Request): Promise<boolean> {
  const apiKey =
    req.headers.get("x-api-key") ||
    new URL(req.url).searchParams.get("api_key");

  if (!apiKey) return false;

  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "backup_api_key")
    .maybeSingle();

  return data?.value === apiKey;
}

// All exportable tables
const TABLES = [
  "charge_points",
  "connectors",
  "transactions",
  "meter_values",
  "status_notifications",
  "heartbeats",
  "ocpp_audit_log",
  "authorized_tags",
  "vehicle_whitelist",
  "charging_tariffs",
  "charging_invoices",
  "charging_profiles",
  "charge_point_config",
  "energy_meters",
  "meter_readings",
  "meter_device_health",
  "meter_ai_models",
  "meter_ai_model_history",
  "virtual_grids",
  "virtual_grid_members",
  "load_balance_logs",
  "grid_alerts",
  "grid_alert_thresholds",
  "gtv_exceedances",
  "notification_channels",
  "mqtt_configurations",
  "ocpp_proxy_backends",
  "ocpp_proxy_log",
  "system_settings",
  "customers",
  "profiles",
  "projects",
  "project_tasks",
  "project_notes",
  "project_notifications",
  "reservations",
  "charging_behavior_analyses",
  "firmware_updates",
  "firmware_file_metadata",
  "pending_ocpp_commands",
  "user_module_permissions",
];

async function fetchAllRows(table: string) {
  const rows: unknown[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + pageSize - 1);

    if (error) {
      console.error(`Error fetching ${table}:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate API key
  const authorized = await validateApiKey(req);
  if (!authorized) {
    return new Response(
      JSON.stringify({ error: "Unauthorized. Provide a valid x-api-key header or ?api_key= param." }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const url = new URL(req.url);
  const tablesParam = url.searchParams.get("tables");
  const requestedTables = tablesParam
    ? tablesParam.split(",").filter((t) => TABLES.includes(t))
    : TABLES;

  try {
    const result: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      tables: {},
    };

    for (const table of requestedTables) {
      const rows = await fetchAllRows(table);
      (result.tables as Record<string, unknown>)[table] = {
        count: rows.length,
        rows,
      };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[backup-export] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
