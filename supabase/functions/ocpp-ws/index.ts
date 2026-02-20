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

Deno.serve((req: Request) => {
  const upgrade = (req.headers.get("upgrade") || "").toLowerCase();

  if (upgrade !== "websocket") {
    // Return connection info for non-WS requests
    return new Response(
      JSON.stringify({
        protocol: "OCPP 1.6J",
        transport: "WebSocket",
        status: "online",
        usage: "Connect your charge point to: wss://<host>/functions/v1/ocpp-ws/<ChargePointId>",
        supportedActions: [
          "BootNotification", "Heartbeat", "StatusNotification",
          "StartTransaction", "StopTransaction", "MeterValues",
          "Authorize",
        ],
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
  // URL pattern: /functions/v1/ocpp-ws/CHARGE_POINT_ID
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Last segment is the charge point ID
  const chargePointId = pathParts[pathParts.length - 1];

  if (!chargePointId || chargePointId === "ocpp-ws") {
    return new Response(
      JSON.stringify({ error: "Charge Point ID is required in the URL path: /ocpp-ws/<ChargePointId>" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  console.log(`[OCPP-WS] New connection from charge point: ${chargePointId}`);

  // Upgrade to WebSocket with OCPP 1.6 subprotocol
  const protocols = req.headers.get("sec-websocket-protocol");
  const requestedProtocols = protocols ? protocols.split(",").map(p => p.trim()) : [];
  const ocppProtocol = requestedProtocols.find(p => p === "ocpp1.6") || requestedProtocols[0];

  const { socket, response } = Deno.upgradeWebSocket(req, {
    protocol: ocppProtocol || "ocpp1.6",
  });

  socket.onopen = () => {
    console.log(`[OCPP-WS] ${chargePointId}: WebSocket opened`);
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

      const messageTypeId = message[0];

      if (messageTypeId === CALL) {
        // CALL: [2, uniqueId, action, payload]
        const [, uniqueId, action, payload] = message;

        // Forward to HTTP handler
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
        // result is [3, uniqueId, responsePayload]
        const wsResponse = JSON.stringify(result);
        console.log(`[OCPP-WS] ${chargePointId} ←`, wsResponse);
        socket.send(wsResponse);

      } else if (messageTypeId === CALLRESULT) {
        // CALLRESULT from charge point (response to our command)
        console.log(`[OCPP-WS] ${chargePointId}: Received CALLRESULT:`, raw);
        // Could store pending commands and match by uniqueId in the future

      } else if (messageTypeId === CALLERROR) {
        console.log(`[OCPP-WS] ${chargePointId}: Received CALLERROR:`, raw);

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
