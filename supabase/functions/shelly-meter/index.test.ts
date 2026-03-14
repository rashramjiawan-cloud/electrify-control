import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const invoke = async (body: Record<string, unknown>) => {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/shelly-meter`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  return { status: resp.status, body: JSON.parse(text) };
};

Deno.test("shelly-meter: unknown action returns 400", async () => {
  const { status, body } = await invoke({ action: "nonexistent" });
  assertEquals(status, 400);
  assertEquals(body.success, false);
});

Deno.test("shelly-meter: poll without host returns 400", async () => {
  const { status, body } = await invoke({ action: "poll" });
  assertEquals(status, 400);
  assertEquals(body.success, false);
});

Deno.test("shelly-meter: test without host returns 400", async () => {
  const { status, body } = await invoke({ action: "test" });
  assertEquals(status, 400);
  assertEquals(body.success, false);
});

Deno.test("shelly-meter: cloud-test without device_id returns 400", async () => {
  const { status, body } = await invoke({ action: "cloud-test" });
  assertEquals(status, 400);
  assertEquals(body.success, false);
});

Deno.test("shelly-meter: poll-all deploys and responds (syntax check)", async () => {
  // poll-all takes 60s normally, but if the function boots and starts executing
  // without a parse error, the syntax is valid. We use AbortSignal to cut short.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/shelly-meter`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ action: "poll-all" }),
      signal: controller.signal,
    });
    // If we get here without abort, it completed fast (no meters)
    const text = await resp.text();
    assertNotEquals(resp.status, 500, "poll-all should not return 500 parse error");
  } catch (e) {
    // AbortError means the function started executing (no syntax error) but was slow
    if (e instanceof DOMException && e.name === "AbortError") {
      // This is expected — function is running, syntax is valid
    } else {
      throw e;
    }
  } finally {
    clearTimeout(timeout);
  }
});
