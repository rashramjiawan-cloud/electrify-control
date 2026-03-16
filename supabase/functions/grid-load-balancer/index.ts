import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GridMember {
  id: string;
  member_type: string;
  member_id: string;
  member_name: string;
  priority: number;
  max_power_kw: number;
  enabled: boolean;
}

interface BalanceResult {
  member_id: string;
  member_name: string;
  member_type: string;
  allocated_kw: number;
  max_kw: number;
  percentage: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const { grid_id, available_power_kw } = body;

    // If no grid_id provided, process ALL enabled grids (batch/cron mode)
    if (!grid_id) {
      const { data: grids, error: gridsErr } = await supabase
        .from("virtual_grids")
        .select("*")
        .eq("enabled", true);

      if (gridsErr) throw gridsErr;

    const results = [];
      for (const grid of grids || []) {
        const result = await balanceGrid(supabase, grid, undefined);
        results.push(result);
        await logResult(supabase, result);
        await applyChargingProfiles(supabase, result);
      }

      console.log(`[auto-balance] Processed ${results.length} grids`);

      return new Response(JSON.stringify({ mode: "batch", grids_processed: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Single grid mode (manual trigger)
    const { data: grid, error: gridErr } = await supabase
      .from("virtual_grids")
      .select("*")
      .eq("id", grid_id)
      .single();

    if (gridErr || !grid) {
      return new Response(JSON.stringify({ error: "Grid not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await balanceGrid(supabase, grid, available_power_kw);
    await logResult(supabase, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function balanceGrid(supabase: any, grid: any, overridePower?: number) {
  // Fetch enabled members
  const { data: members, error: memErr } = await supabase
    .from("virtual_grid_members")
    .select("*")
    .eq("grid_id", grid.id)
    .eq("enabled", true)
    .order("priority", { ascending: true });

  if (memErr) throw memErr;

  const enabledMembers = (members || []) as GridMember[];

  // In batch mode, try to get actual meter power for the grid
  let totalAvailable = overridePower ?? grid.gtv_limit_kw ?? 0;

  // Look for energy_meter members to get real-time power
  const meterMembers = enabledMembers.filter((m) => m.member_type === "energy_meter");
  if (meterMembers.length > 0 && overridePower === undefined) {
    const meterIds = meterMembers.map((m) => m.member_id);
    const { data: meters } = await supabase
      .from("energy_meters")
      .select("id, last_reading")
      .in("id", meterIds);

    if (meters && meters.length > 0) {
      let totalMeterPower = 0;
      for (const meter of meters) {
        const reading = meter.last_reading as any;
        if (reading?.active_power !== undefined) {
          totalMeterPower += Math.abs(Number(reading.active_power) || 0);
        }
      }
      // Available = GTV limit minus current meter usage
      if (totalMeterPower > 0) {
        totalAvailable = Math.max(0, (grid.gtv_limit_kw ?? 0) - totalMeterPower / 1000);
      }
    }
  }

  let allocations: BalanceResult[];

  switch (grid.balancing_strategy) {
    case "priority":
      allocations = balancePriority(enabledMembers, totalAvailable);
      break;
    case "round_robin":
      allocations = balanceRoundRobin(enabledMembers, totalAvailable);
      break;
    case "soc_based":
      allocations = balanceProportional(enabledMembers, totalAvailable);
      break;
    case "proportional":
    default:
      allocations = balanceProportional(enabledMembers, totalAvailable);
      break;
  }

  return {
    grid_id: grid.id,
    grid_name: grid.name,
    strategy: grid.balancing_strategy,
    total_available_kw: +totalAvailable.toFixed(2),
    gtv_limit_kw: grid.gtv_limit_kw,
    allocations,
  };
}

// Log result to load_balance_logs table
async function logResult(supabase: any, result: any) {
  try {
    const totalAllocated = (result.allocations || []).reduce(
      (s: number, a: any) => s + (a.allocated_kw || 0), 0
    );
    await supabase.from("load_balance_logs").insert({
      grid_id: result.grid_id,
      grid_name: result.grid_name,
      strategy: result.strategy,
      total_available_kw: result.total_available_kw,
      gtv_limit_kw: result.gtv_limit_kw,
      total_allocated_kw: +totalAllocated.toFixed(2),
      allocations: result.allocations,
    });
  } catch (e) {
    console.error("[log-result] Failed to log balance result:", e);
  }
}

// Proportional: distribute based on max_power_kw ratio
function balanceProportional(members: GridMember[], totalKw: number): BalanceResult[] {
  const totalMax = members.reduce((s, m) => s + m.max_power_kw, 0);
  if (totalMax === 0) return members.map(m => ({
    member_id: m.member_id,
    member_name: m.member_name,
    member_type: m.member_type,
    allocated_kw: 0,
    max_kw: m.max_power_kw,
    percentage: 0,
  }));

  return members.map(m => {
    const ratio = m.max_power_kw / totalMax;
    const allocated = Math.min(ratio * totalKw, m.max_power_kw);
    return {
      member_id: m.member_id,
      member_name: m.member_name,
      member_type: m.member_type,
      allocated_kw: +allocated.toFixed(2),
      max_kw: m.max_power_kw,
      percentage: +(ratio * 100).toFixed(1),
    };
  });
}

// Priority: fill highest priority first
function balancePriority(members: GridMember[], totalKw: number): BalanceResult[] {
  let remaining = totalKw;
  return members.map(m => {
    const allocated = Math.min(remaining, m.max_power_kw);
    remaining -= allocated;
    return {
      member_id: m.member_id,
      member_name: m.member_name,
      member_type: m.member_type,
      allocated_kw: +allocated.toFixed(2),
      max_kw: m.max_power_kw,
      percentage: m.max_power_kw > 0 ? +((allocated / m.max_power_kw) * 100).toFixed(1) : 0,
    };
  });
}

// Round Robin: equal split capped at max
function balanceRoundRobin(members: GridMember[], totalKw: number): BalanceResult[] {
  if (members.length === 0) return [];
  const equalShare = totalKw / members.length;
  return members.map(m => {
    const allocated = Math.min(equalShare, m.max_power_kw);
    return {
      member_id: m.member_id,
      member_name: m.member_name,
      member_type: m.member_type,
      allocated_kw: +allocated.toFixed(2),
      max_kw: m.max_power_kw,
      percentage: m.max_power_kw > 0 ? +((allocated / m.max_power_kw) * 100).toFixed(1) : 0,
    };
  });
}
