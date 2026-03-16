import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const ENOVATES_API_KEY = Deno.env.get("ENOVATES_API_KEY");
  if (!ENOVATES_API_KEY) {
    return new Response(JSON.stringify({ error: "ENOVATES_API_KEY is not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ENOVATES_BASE_URL = Deno.env.get("ENOVATES_BASE_URL");
  if (!ENOVATES_BASE_URL) {
    return new Response(JSON.stringify({ error: "ENOVATES_BASE_URL is not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { action, path, method, body } = await req.json();

    // Build the target URL
    const targetUrl = `${ENOVATES_BASE_URL.replace(/\/$/, "")}/${(path || "").replace(/^\//, "")}`;

    // Forward request to Enovates API
    const fetchOptions: RequestInit = {
      method: method || "GET",
      headers: {
        "Authorization": `Bearer ${ENOVATES_API_KEY}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const contentType = response.headers.get("content-type") || "";

    let data: unknown;
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // Log to audit table
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceRoleKey);

    await sb.from("ocpp_audit_log").insert({
      action: `enovates:${action || path || "unknown"}`,
      charge_point_id: "ENOVATES-API",
      status: response.ok ? "success" : "error",
      payload: { path, method: method || "GET", body: body || null },
      result: typeof data === "object" ? data : { raw: data },
    });

    if (!response.ok) {
      return new Response(JSON.stringify({
        error: `Enovates API error [${response.status}]`,
        details: data,
      }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Enovates proxy error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
