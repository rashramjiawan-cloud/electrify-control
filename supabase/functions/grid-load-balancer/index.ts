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

interface CallerScope {
  isInternal: boolean;
  isAuthenticated: boolean;
  isPrivileged: boolean;
  customerId: string | null;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(Math.max(Math.floor(parsed), 1), 100);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const functionSecret = Deno.env.get("CHARGER_STATUS_INGEST_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const caller = await getCallerScope(req, supabase, supabaseUrl, anonKey, serviceKey, functionSecret);

    // Fail closed for public/browser calls. Only a validated user JWT or the
    // service-role token may return scoped data. Batch/history widgets get an
    // empty 2xx response on missing/expired auth, never cross-tenant data.
    if (!caller.isAuthenticated && !caller.isInternal) {
      const unauthBody = await req.json().catch(() => ({}));
      if (unauthBody?.mode === "logs" || unauthBody?.mode === "history") {
        return json({ mode: "logs", logs: [] });
      }
      if (!unauthBody?.grid_id) {
        return json({ mode: "batch", grids_processed: 0, results: [] });
      }
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const { grid_id, available_power_kw } = body;

    if (body?.mode === "logs" || body?.mode === "history") {
      const logs = await getScopedLoadBalanceLogs(
        supabase,
        caller,
        typeof grid_id === "string" ? grid_id : undefined,
        normalizeLimit(body?.limit),
      );
      return json({ mode: "logs", logs });
    }

    // If no grid_id provided, process ALL enabled grids (batch/cron mode)
    if (!grid_id) {
      let gridsQuery = supabase.from("virtual_grids").select("*").eq("enabled", true);
      // Scope for regular authenticated users. Admin/manager and service-role
      // internal runs remain unscoped; all other users are restricted before
      // any grid is balanced or returned.
      if (caller.isAuthenticated && !caller.isPrivileged) {
        if (!caller.customerId) {
          return json({ mode: "batch", grids_processed: 0, results: [] });
        }
        gridsQuery = gridsQuery.eq("customer_id", caller.customerId);
      }
      const { data: grids, error: gridsErr } = await gridsQuery;
      if (gridsErr) {
        console.error("[auto-balance] grids query error:", gridsErr);
        return json({ mode: "batch", grids_processed: 0, results: [] });
      }

      const results = [];
      for (const grid of grids || []) {
        try {
          const result = await balanceGrid(supabase, grid, undefined);
          results.push(result);
          try { await logResult(supabase, result); } catch (e) { console.error("[log-result]", e); }
          try { await applyChargingProfiles(supabase, result); } catch (e) { console.error("[apply-profiles]", e); }
        } catch (e) {
          console.error(`[auto-balance] grid ${grid?.id} failed:`, e);
        }
      }

      console.log(`[auto-balance] Processed ${results.length} grids (scoped=${caller.isAuthenticated && !caller.isPrivileged})`);

      return json({ mode: "batch", grids_processed: results.length, results });
    }

    // Single grid mode (manual trigger)
    const { data: grid, error: gridErr } = await supabase
      .from("virtual_grids")
      .select("*")
      .eq("id", grid_id)
      .single();

    if (gridErr || !grid) {
      return json({ error: "Grid not found" }, 404);
    }

    // Server-side authorization check for single-grid mode
    if (caller.isAuthenticated && !caller.isPrivileged) {
      if (!caller.customerId || grid.customer_id !== caller.customerId) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    let result;
    try {
      result = await balanceGrid(supabase, grid, available_power_kw);
    } catch (e) {
      console.error(`[grid-load-balancer] balance failed for own grid ${grid.id}:`, e);
      result = emptyGridResult(grid, available_power_kw);
    }
    try { await logResult(supabase, result); } catch (e) { console.error("[log-result]", e); }
    try { await applyChargingProfiles(supabase, result); } catch (e) { console.error("[apply-profiles]", e); }

    return json(result);
  } catch (err) {
    console.error("[grid-load-balancer] fatal:", err);
    return json({ error: String(err), mode: "batch", grids_processed: 0, results: [] }, 500);
  }
});

async function getCallerScope(
  req: Request,
  supabase: any,
  supabaseUrl: string,
  anonKey: string,
  serviceKey: string,
  functionSecret: string,
): Promise<CallerScope> {
  const functionKey = req.headers.get("x-api-key") || new URL(req.url).searchParams.get("api_key") || "";
  if (functionSecret && functionKey === functionSecret) {
    return { isInternal: true, isAuthenticated: false, isPrivileged: true, customerId: null };
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { isInternal: false, isAuthenticated: false, isPrivileged: false, customerId: null };
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (token === serviceKey) {
    return { isInternal: true, isAuthenticated: false, isPrivileged: true, customerId: null };
  }

  // Browser invokes without a user session can send the anon key as bearer.
  // That is not a user JWT and causes auth `/user` "missing sub claim" 403s.
  if (!token || token === anonKey) {
    return { isInternal: false, isAuthenticated: false, isPrivileged: false, customerId: null };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const uid = userData?.user?.id;
  if (userError || !uid) {
    return { isInternal: false, isAuthenticated: false, isPrivileged: false, customerId: null };
  }

  const { data: isPriv } = await supabase.rpc("is_admin_or_manager", { _uid: uid });
  const isPrivileged = !!isPriv;
  if (isPrivileged) {
    return { isInternal: false, isAuthenticated: true, isPrivileged: true, customerId: null };
  }

  const { data: customerId } = await userClient.rpc("get_my_customer_id");

  return {
    isInternal: false,
    isAuthenticated: true,
    isPrivileged: false,
    customerId: customerId ?? null,
  };
}

async function getScopedLoadBalanceLogs(
  supabase: any,
  caller: CallerScope,
  gridId?: string,
  limit = 30,
) {
  let allowedGridIds: string[] | null = null;

  if (caller.isAuthenticated && !caller.isPrivileged) {
    if (!caller.customerId) return [];

    let gridsQuery = supabase
      .from("virtual_grids")
      .select("id")
      .eq("customer_id", caller.customerId);

    if (gridId) gridsQuery = gridsQuery.eq("id", gridId);

    const { data: grids, error: gridsErr } = await gridsQuery;
    if (gridsErr) {
      console.error("[load-balance-logs] scoped grid query failed:", gridsErr);
      return [];
    }

    allowedGridIds = (grids || []).map((g: { id: string }) => g.id);
    if (allowedGridIds.length === 0) return [];
  }

  let logsQuery = supabase
    .from("load_balance_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (allowedGridIds) {
    logsQuery = logsQuery.in("grid_id", allowedGridIds);
  } else if (gridId) {
    logsQuery = logsQuery.eq("grid_id", gridId);
  }

  const { data, error } = await logsQuery;
  if (error) {
    console.error("[load-balance-logs] query failed:", error);
    return [];
  }

  return data || [];
}

function emptyGridResult(grid: any, overridePower?: number) {
  return {
    grid_id: grid.id,
    grid_name: grid.name,
    strategy: grid.balancing_strategy,
    total_available_kw: +(overridePower ?? grid.gtv_limit_kw ?? 0).toFixed(2),
    gtv_limit_kw: grid.gtv_limit_kw,
    allocations: [],
  };
}

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

// Apply charging profiles to charge point members via OCPP command queue
async function applyChargingProfiles(supabase: any, result: any) {
  try {
    const cpAllocations = (result.allocations || []).filter(
      (a: any) => a.member_type === "charge_point"
    );

    if (cpAllocations.length === 0) return;

    for (const alloc of cpAllocations) {
      // Look up the charge point to get the OCPP ID
      let ocppId = alloc.member_id;
      const { data: cp } = await supabase
        .from("charge_points")
        .select("id")
        .eq("id", alloc.member_id)
        .maybeSingle();

      if (cp) {
        ocppId = cp.id;
      }

      const limitWatts = Math.max(1380, Math.round(alloc.allocated_kw * 1000));

      // Delete any existing pending SetChargingProfile commands for this CP
      await supabase
        .from("pending_ocpp_commands")
        .delete()
        .eq("charge_point_id", ocppId)
        .eq("action", "SetChargingProfile")
        .eq("status", "pending");

      // Insert new SetChargingProfile command
      await supabase.from("pending_ocpp_commands").insert({
        charge_point_id: ocppId,
        action: "SetChargingProfile",
        status: "pending",
        source: "grid-load-balancer",
        grid_id: result.grid_id,
        allocated_kw: alloc.allocated_kw,
        payload: {
          connectorId: 0,
          csChargingProfiles: {
            chargingProfileId: 1,
            stackLevel: 0,
            chargingProfilePurpose: "ChargePointMaxProfile",
            chargingProfileKind: "Relative",
            chargingSchedule: {
              chargingRateUnit: "W",
              chargingSchedulePeriod: [
                { startPeriod: 0, limit: limitWatts },
              ],
            },
          },
        },
      });

      console.log(
        `[apply-profiles] ${ocppId}: SetChargingProfile ${limitWatts}W (${alloc.allocated_kw} kW)`
      );
    }
  } catch (e) {
    console.error("[apply-profiles] Failed:", e);
  }
}
