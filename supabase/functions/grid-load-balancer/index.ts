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

    const { grid_id, available_power_kw } = await req.json();

    if (!grid_id) {
      return new Response(JSON.stringify({ error: "grid_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch grid config
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

    // Fetch enabled members
    const { data: members, error: memErr } = await supabase
      .from("virtual_grid_members")
      .select("*")
      .eq("grid_id", grid_id)
      .eq("enabled", true)
      .order("priority", { ascending: true });

    if (memErr) throw memErr;

    const enabledMembers = (members || []) as GridMember[];
    const totalAvailable = available_power_kw ?? grid.gtv_limit_kw ?? 0;

    let allocations: BalanceResult[];

    switch (grid.balancing_strategy) {
      case "priority":
        allocations = balancePriority(enabledMembers, totalAvailable);
        break;
      case "round_robin":
        allocations = balanceRoundRobin(enabledMembers, totalAvailable);
        break;
      case "soc_based":
        // SoC-based falls back to proportional for now (needs real SoC data)
        allocations = balanceProportional(enabledMembers, totalAvailable);
        break;
      case "proportional":
      default:
        allocations = balanceProportional(enabledMembers, totalAvailable);
        break;
    }

    return new Response(
      JSON.stringify({
        grid_id: grid.id,
        grid_name: grid.name,
        strategy: grid.balancing_strategy,
        total_available_kw: totalAvailable,
        gtv_limit_kw: grid.gtv_limit_kw,
        allocations,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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
