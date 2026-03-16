import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// OCPP 1.6J Message Types
const CALL = 2;
const CALLRESULT = 3;
const CALLERROR = 4;

// Internal HTTP handler URL
const OCPP_HTTP_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ocpp-handler`;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─── Proxy: connected charge point sockets (for bidirectional commands) ───
const chargePointSockets = new Map<string, WebSocket>();

// ─── Proxy: active WebSocket connections to external OCPP backends ───
const backendWsSockets = new Map<string, WebSocket>();
// ─── Pending command responses (CSMS → CP, waiting for CALLRESULT) ───
const pendingResponses = new Map<string, { resolve: (value: unknown) => void; timer: ReturnType<typeof setTimeout> }>();

// ─── Track pending command polling intervals per charge point ───
const commandPollers = new Map<string, ReturnType<typeof setInterval>>();

interface ProxyBackend {
  id: string;
  name: string;
  backend_type: string;
  url: string;
  enabled: boolean;
  ocpp_subprotocol: string | null;
  auth_header: string | null;
  allow_commands: boolean;
  charge_point_filter: string[];
}

// Load proxy backends from DB
async function loadBackends(): Promise<ProxyBackend[]> {
  const { data, error } = await supabase
    .from("ocpp_proxy_backends")
    .select("*")
    .eq("enabled", true);
  if (error) {
    console.error("[OCPP-PROXY] Failed to load backends:", error);
    return [];
  }
  return data || [];
}

// Check if backend should receive messages for this charge point
function matchesChargePoint(backend: ProxyBackend, chargePointId: string): boolean {
  if (!backend.charge_point_filter || backend.charge_point_filter.length === 0) return true;
  return backend.charge_point_filter.includes(chargePointId);
}

// Log proxy event to audit table (fire-and-forget)
function logProxyEvent(params: {
  backend_id: string;
  backend_name: string;
  charge_point_id: string;
  direction: string;
  action?: string;
  message_type?: string;
  status: string;
  error_message?: string;
  latency_ms?: number;
}) {
  supabase
    .from("ocpp_proxy_log")
    .insert(params)
    .then(({ error }) => {
      if (error) console.error("[OCPP-PROXY] Failed to log:", error.message);
    });
}

// Fan-out: forward message to all matching backends
async function fanOutMessage(chargePointId: string, rawMessage: string, parsedMessage: unknown[]) {
  const backends = await loadBackends();

  const msgTypeId = parsedMessage[0];
  const msgType = msgTypeId === CALL ? "CALL" : msgTypeId === CALLRESULT ? "CALLRESULT" : msgTypeId === CALLERROR ? "CALLERROR" : "UNKNOWN";
  const action = msgTypeId === CALL ? String(parsedMessage[2] || "") : undefined;

  for (const backend of backends) {
    if (!matchesChargePoint(backend, chargePointId)) continue;

    const startTime = Date.now();
    try {
      if (backend.backend_type === "http_webhook") {
        await forwardToWebhook(backend, chargePointId, rawMessage, parsedMessage);
      } else if (backend.backend_type === "ocpp_ws") {
        await forwardToOcppWs(backend, chargePointId, rawMessage);
      }
      logProxyEvent({
        backend_id: backend.id,
        backend_name: backend.name,
        charge_point_id: chargePointId,
        direction: "upstream",
        action,
        message_type: msgType,
        status: "success",
        latency_ms: Date.now() - startTime,
      });
    } catch (err) {
      const errorMsg = (err as Error).message;
      console.error(`[OCPP-PROXY] Error forwarding to ${backend.name}:`, err);
      logProxyEvent({
        backend_id: backend.id,
        backend_name: backend.name,
        charge_point_id: chargePointId,
        direction: "upstream",
        action,
        message_type: msgType,
        status: "error",
        error_message: errorMsg,
        latency_ms: Date.now() - startTime,
      });
      supabase
        .from("ocpp_proxy_backends")
        .update({ last_error: errorMsg, connection_status: "error" })
        .eq("id", backend.id)
        .then(() => {});
    }
  }
}

// Forward to HTTP webhook backend
async function forwardToWebhook(
  backend: ProxyBackend,
  chargePointId: string,
  _rawMessage: string,
  parsedMessage: unknown[]
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (backend.auth_header) {
    headers["Authorization"] = backend.auth_header;
  }

  const messageTypeId = parsedMessage[0];
  const body: Record<string, unknown> = {
    chargePointId,
    messageTypeId,
    timestamp: new Date().toISOString(),
  };

  if (messageTypeId === CALL) {
    body.uniqueId = parsedMessage[1];
    body.action = parsedMessage[2];
    body.payload = parsedMessage[3] || {};
  } else if (messageTypeId === CALLRESULT) {
    body.uniqueId = parsedMessage[1];
    body.payload = parsedMessage[2] || {};
  } else if (messageTypeId === CALLERROR) {
    body.uniqueId = parsedMessage[1];
    body.errorCode = parsedMessage[2];
    body.errorDescription = parsedMessage[3];
    body.errorDetails = parsedMessage[4] || {};
  }

  const res = await fetch(backend.url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  console.log(`[OCPP-PROXY] → ${backend.name} (webhook): OK`);
}

// Forward to external OCPP WebSocket backend
async function forwardToOcppWs(backend: ProxyBackend, chargePointId: string, rawMessage: string) {
  const wsKey = `${backend.id}:${chargePointId}`;
  let ws = backendWsSockets.get(wsKey);

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    const wsUrl = backend.url.endsWith("/")
      ? `${backend.url}${chargePointId}`
      : `${backend.url}/${chargePointId}`;

    const wsHeaders: Record<string, string> = {};
    if (backend.auth_header) {
      wsHeaders["Authorization"] = backend.auth_header;
    }

    if (backend.auth_header) {
      const upgradeResp = await fetch(wsUrl, {
        headers: {
          "Upgrade": "websocket",
          "Connection": "Upgrade",
          "Sec-WebSocket-Protocol": backend.ocpp_subprotocol || "ocpp1.6",
          "Authorization": backend.auth_header,
        },
      });
      // @ts-ignore - Deno supports webSocket on upgrade responses
      ws = upgradeResp.webSocket;
      if (!ws) {
        throw new Error("Failed to establish WebSocket with auth headers");
      }
      ws.accept();
    } else {
      ws = new WebSocket(wsUrl, backend.ocpp_subprotocol || "ocpp1.6");
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("WS connect timeout")), 10000);
      ws!.onopen = () => {
        clearTimeout(timeout);
        console.log(`[OCPP-PROXY] Connected to ${backend.name} for ${chargePointId}`);
        supabase
          .from("ocpp_proxy_backends")
          .update({
            connection_status: "connected",
            last_connected_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", backend.id)
          .then(() => {});
        resolve();
      };
      ws!.onerror = (e) => {
        clearTimeout(timeout);
        reject(e);
      };
    });

    ws.onmessage = (event) => {
      console.log(`[OCPP-PROXY] ← ${backend.name} for ${chargePointId}:`, event.data);

      if (!backend.allow_commands) {
        console.log(`[OCPP-PROXY] Commands not allowed from ${backend.name}, ignoring`);
        logProxyEvent({
          backend_id: backend.id,
          backend_name: backend.name,
          charge_point_id: chargePointId,
          direction: "downstream",
          status: "error",
          error_message: "Commands not allowed for this backend",
        });
        return;
      }

      const cpSocket = chargePointSockets.get(chargePointId);
      if (cpSocket && cpSocket.readyState === WebSocket.OPEN) {
        cpSocket.send(event.data);
        console.log(`[OCPP-PROXY] Forwarded command from ${backend.name} → ${chargePointId}`);
        logProxyEvent({
          backend_id: backend.id,
          backend_name: backend.name,
          charge_point_id: chargePointId,
          direction: "downstream",
          status: "success",
        });
      } else {
        console.warn(`[OCPP-PROXY] Charge point ${chargePointId} not connected, can't forward command`);
        logProxyEvent({
          backend_id: backend.id,
          backend_name: backend.name,
          charge_point_id: chargePointId,
          direction: "downstream",
          status: "error",
          error_message: "Charge point not connected",
        });
      }
    };

    ws.onclose = () => {
      console.log(`[OCPP-PROXY] Disconnected from ${backend.name} for ${chargePointId}`);
      backendWsSockets.delete(wsKey);
    };

    backendWsSockets.set(wsKey, ws);
  }

  ws.send(rawMessage);
  console.log(`[OCPP-PROXY] → ${backend.name} (ws): forwarded`);
}

// ─── Fan-out response from this CSMS back to backends ───
async function fanOutResponse(chargePointId: string, responseRaw: string) {
  const backends = await loadBackends();

  for (const backend of backends) {
    if (!matchesChargePoint(backend, chargePointId)) continue;
    if (backend.backend_type !== "http_webhook") continue;

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (backend.auth_header) headers["Authorization"] = backend.auth_header;

      await fetch(backend.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          chargePointId,
          type: "csms_response",
          message: JSON.parse(responseRaw),
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (err) {
      console.error(`[OCPP-PROXY] Error sending response to ${backend.name}:`, err);
    }
  }
}

// ─── Send OCPP command to charger and wait for response ───
async function sendCommandToCharger(chargePointId: string, action: string, payload: unknown): Promise<unknown> {
  const cpSocket = chargePointSockets.get(chargePointId);
  if (!cpSocket || cpSocket.readyState !== WebSocket.OPEN) {
    return { error: "Charge point not connected" };
  }

  const uniqueId = crypto.randomUUID().slice(0, 8);
  const callMessage = [CALL, uniqueId, action, payload || {}];
  const raw = JSON.stringify(callMessage);

  console.log(`[OCPP-WS] Command → ${chargePointId}: ${raw}`);

  const responsePromise = new Promise<unknown>((resolve) => {
    const pendingKey = `${chargePointId}:${uniqueId}`;
    const timer = setTimeout(() => {
      pendingResponses.delete(pendingKey);
      resolve({ error: "Timeout waiting for charger response (10s)" });
    }, 10000);
    pendingResponses.set(pendingKey, { resolve, timer });
  });

  cpSocket.send(raw);
  return await responsePromise;
}

// ─── Save GetConfiguration response to charge_point_config ───
async function saveConfigToDb(chargePointId: string, configKeys: Array<{ key: string; value: string | null; readonly: boolean }>) {
  if (!configKeys || configKeys.length === 0) return;

  for (const item of configKeys) {
    await supabase
      .from("charge_point_config")
      .upsert(
        {
          charge_point_id: chargePointId,
          key: item.key,
          value: item.value,
          readonly: item.readonly,
        },
        { onConflict: "charge_point_id,key" }
      );
  }
  console.log(`[OCPP-WS] Saved ${configKeys.length} config keys for ${chargePointId}`);
}

// ─── Poll pending commands from DB for connected charge points ───
function startCommandPoller(chargePointId: string) {
  // Poll every 2 seconds for pending commands
  const interval = setInterval(async () => {
    const cpSocket = chargePointSockets.get(chargePointId);
    if (!cpSocket || cpSocket.readyState !== WebSocket.OPEN) {
      clearInterval(interval);
      commandPollers.delete(chargePointId);
      return;
    }

    try {
      const { data: commands, error } = await supabase
        .from("pending_ocpp_commands")
        .select("*")
        .eq("charge_point_id", chargePointId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1);

      if (error || !commands || commands.length === 0) return;

      const cmd = commands[0];

      // Mark as processing
      await supabase
        .from("pending_ocpp_commands")
        .update({ status: "processing" })
        .eq("id", cmd.id);

      console.log(`[OCPP-WS] Processing pending command: ${cmd.action} for ${chargePointId}`);

      const result = await sendCommandToCharger(chargePointId, cmd.action, cmd.payload);

      // If it's a GetConfiguration response, save to charge_point_config
      if (cmd.action === "GetConfiguration" && Array.isArray(result) && result[0] === CALLRESULT) {
        const responsePayload = result[2];
        if (responsePayload?.configurationKey) {
          await saveConfigToDb(chargePointId, responsePayload.configurationKey);
        }
      }

      // Update command with response
      await supabase
        .from("pending_ocpp_commands")
        .update({
          status: "completed",
          response: result,
          processed_at: new Date().toISOString(),
        })
        .eq("id", cmd.id);

    } catch (err) {
      console.error(`[OCPP-WS] Command poller error:`, err);
    }
  }, 2000);

  commandPollers.set(chargePointId, interval);
  console.log(`[OCPP-WS] Started command poller for ${chargePointId}`);
}

function stopCommandPoller(chargePointId: string) {
  const interval = commandPollers.get(chargePointId);
  if (interval) {
    clearInterval(interval);
    commandPollers.delete(chargePointId);
    console.log(`[OCPP-WS] Stopped command poller for ${chargePointId}`);
  }
}

// ─── Auto-send GetConfiguration after BootNotification ───
async function autoGetConfiguration(chargePointId: string) {
  // Wait a moment for the charger to be ready
  await new Promise(r => setTimeout(r, 1000));

  console.log(`[OCPP-WS] Auto-sending GetConfiguration to ${chargePointId}`);
  const result = await sendCommandToCharger(chargePointId, "GetConfiguration", {});

  if (Array.isArray(result) && result[0] === CALLRESULT) {
    const payload = result[2];
    if (payload?.configurationKey) {
      await saveConfigToDb(chargePointId, payload.configurationKey);
    }
    console.log(`[OCPP-WS] Auto-GetConfiguration completed for ${chargePointId}`);
  } else {
    console.error(`[OCPP-WS] Auto-GetConfiguration failed for ${chargePointId}:`, result);
  }
}

Deno.serve(async (req: Request) => {
  const upgrade = (req.headers.get("upgrade") || "").toLowerCase();

  if (upgrade !== "websocket") {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
    }

    // For POST requests: return info about connected charge points
    if (req.method === "POST") {
      return new Response(
        JSON.stringify({
          connected_charge_points: Array.from(chargePointSockets.keys()),
          status: "online",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        protocol: "OCPP 1.6J",
        transport: "WebSocket",
        status: "online",
        proxy: "fan-out enabled",
        commands: "Insert into pending_ocpp_commands table",
        usage: "Connect your charge point to: wss://<host>/functions/v1/ocpp-ws/<ChargePointId>",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  // Extract charge point ID from URL path
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const chargePointId = pathParts[pathParts.length - 1];

  if (!chargePointId || chargePointId === "ocpp-ws") {
    return new Response(
      JSON.stringify({ error: "Charge Point ID is required in the URL path: /ocpp-ws/<ChargePointId>" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  console.log(`[OCPP-WS] New connection from charge point: ${chargePointId}`);

  const protocols = req.headers.get("sec-websocket-protocol");
  const requestedProtocols = protocols ? protocols.split(",").map(p => p.trim()) : [];
  const ocppProtocol = requestedProtocols.find(p => p === "ocpp1.6") || requestedProtocols[0];

  const { socket, response } = Deno.upgradeWebSocket(req, {
    protocol: ocppProtocol || "ocpp1.6",
  });

  socket.onopen = () => {
    console.log(`[OCPP-WS] ${chargePointId}: WebSocket opened`);
    chargePointSockets.set(chargePointId, socket);
    // Start polling for pending commands from the UI
    startCommandPoller(chargePointId);
  };

  socket.onmessage = async (event) => {
    const raw = event.data;
    console.log(`[OCPP-WS] ${chargePointId} →`, raw);

    try {
      const message = JSON.parse(raw);

      if (!Array.isArray(message) || message.length < 3) {
        const errResp = [CALLERROR, "0", "FormationViolation", "Invalid OCPP message format", {}];
        socket.send(JSON.stringify(errResp));
        return;
      }

      // ─── Fan-out: broadcast to all proxy backends ───
      fanOutMessage(chargePointId, raw, message).catch(err => {
        console.error(`[OCPP-PROXY] Fan-out error:`, err);
      });

      const messageTypeId = message[0];

      if (messageTypeId === CALL) {
        const [, uniqueId, action, payload] = message;

        // Forward to internal HTTP handler (this CSMS)
        const httpResponse = await fetch(OCPP_HTTP_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
            "apikey": SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({
            chargePointId,
            messageTypeId: CALL,
            uniqueId,
            action,
            payload: payload || {},
          }),
        });

        const result = await httpResponse.json();
        const wsResponse = JSON.stringify(result);
        console.log(`[OCPP-WS] ${chargePointId} ←`, wsResponse);
        socket.send(wsResponse);

        // Fan-out our response to webhook backends
        fanOutResponse(chargePointId, wsResponse).catch(err => {
          console.error(`[OCPP-PROXY] Response fan-out error:`, err);
        });

        // Auto-send GetConfiguration after BootNotification
        if (action === "BootNotification") {
          autoGetConfiguration(chargePointId).catch(err => {
            console.error(`[OCPP-WS] Auto-GetConfiguration error:`, err);
          });
        }

      } else if (messageTypeId === CALLRESULT) {
        console.log(`[OCPP-WS] ${chargePointId}: Received CALLRESULT:`, raw);
        const uniqueId = String(message[1]);
        const pendingKey = `${chargePointId}:${uniqueId}`;
        const pending = pendingResponses.get(pendingKey);
        if (pending) {
          clearTimeout(pending.timer);
          pendingResponses.delete(pendingKey);
          pending.resolve(message);
        }
      } else if (messageTypeId === CALLERROR) {
        console.log(`[OCPP-WS] ${chargePointId}: Received CALLERROR:`, raw);
        const uniqueId = String(message[1]);
        const pendingKey = `${chargePointId}:${uniqueId}`;
        const pending = pendingResponses.get(pendingKey);
        if (pending) {
          clearTimeout(pending.timer);
          pendingResponses.delete(pendingKey);
          pending.resolve(message);
        }
      } else {
        const errResp = [CALLERROR, message[1] || "0", "FormationViolation", `Unknown messageTypeId: ${messageTypeId}`, {}];
        socket.send(JSON.stringify(errResp));
      }

    } catch (err) {
      console.error(`[OCPP-WS] ${chargePointId}: Parse error:`, err);
      const errResp = [CALLERROR, "0", "InternalError", (err as Error).message, {}];
      socket.send(JSON.stringify(errResp));
    }
  };

  socket.onerror = (e) => {
    console.error(`[OCPP-WS] ${chargePointId}: Error:`, e);
  };

  socket.onclose = () => {
    console.log(`[OCPP-WS] ${chargePointId}: Connection closed`);
    chargePointSockets.delete(chargePointId);
    stopCommandPoller(chargePointId);

    // Close any backend WS connections for this charge point
    for (const [key, ws] of backendWsSockets) {
      if (key.endsWith(`:${chargePointId}`)) {
        ws.close();
        backendWsSockets.delete(key);
      }
    }

    // Mark charge point as unavailable
    supabase
      .from("charge_points")
      .update({ status: "Unavailable" })
      .eq("id", chargePointId)
      .then(({ error }) => {
        if (error) console.error(`[OCPP-WS] Failed to update status for ${chargePointId}:`, error);
      });
  };

  return response;
});
