import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { resetMemoryRateLimitsForTests } from "@/lib/request-security";
import { GET, POST } from "./route";

const originalFetch = global.fetch;
const originalKey = process.env.OPENAI_API_KEY;

function speechRequest(body: Record<string, unknown>, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/rctimes/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, Host: "localhost:3000" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetMemoryRateLimitsForTests();
  process.env.OPENAI_API_KEY = "test-openai-key";
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
});

test("reports whether RCTimes speech is configured", async () => {
  const response = await GET();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.available, true);
  assert.equal(data.model, "gpt-4o-mini-tts");
  assert.ok(data.voices.includes("marin"));
});

test("keeps the OpenAI key server-side and streams the speech response", async () => {
  let upstreamAuthorization = "";
  let upstreamBody: Record<string, unknown> = {};
  global.fetch = (async (_input, init) => {
    upstreamAuthorization = String((init?.headers as Record<string, string>).Authorization);
    upstreamBody = JSON.parse(String(init?.body));
    return new Response(new Uint8Array([73, 68, 51]), { headers: { "Content-Type": "audio/mpeg" } });
  }) as typeof fetch;

  const response = await POST(speechRequest({ text: "Marc entra en su ventana de repostaje.", voice: "marin", mode: "broadcast", eventType: "strategy" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "audio/mpeg");
  assert.equal(upstreamAuthorization, "Bearer test-openai-key");
  assert.equal(upstreamBody.model, "gpt-4o-mini-tts");
  assert.equal(upstreamBody.input, "Marc entra en su ventana de repostaje.");
  assert.match(String(upstreamBody.instructions), /tono analítico y cercano/);
  assert.match(String(upstreamBody.instructions), /evita la cadencia de locutor publicitario/);
  assert.equal(await response.text(), "ID3");
});

test("prepares timing notation for natural Spanish speech", async () => {
  let upstreamBody: Record<string, unknown> = {};
  global.fetch = (async (_input, init) => {
    upstreamBody = JSON.parse(String(init?.body));
    return new Response(new Uint8Array([73, 68, 51]), { headers: { "Content-Type": "audio/mpeg" } });
  }) as typeof fetch;

  const response = await POST(speechRequest({
    text: "GT8: vuelta rápida en 17.842, a 43 km/h y con el 75% de combustible.",
    voice: "marin",
    mode: "broadcast",
    eventType: "fastest",
  }));

  assert.equal(response.status, 200);
  assert.equal(
    upstreamBody.input,
    "GT ocho: vuelta rápida en 17 coma 842, a 43 kilómetros por hora y con el 75 por ciento de combustible.",
  );
  assert.match(String(upstreamBody.instructions), /Eleva brevemente la energía/);
});

test("speaks battle gaps in seconds and tenths", async () => {
  let upstreamBody: Record<string, unknown> = {};
  global.fetch = (async (_input, init) => {
    upstreamBody = JSON.parse(String(init?.body));
    return new Response(new Uint8Array([73, 68, 51]), { headers: { "Content-Type": "audio/mpeg" } });
  }) as typeof fetch;

  const response = await POST(speechRequest({
    text: "Toni Méndez y Sergio Oriola, separados por 1,872 segundos.",
    eventType: "battle",
  }));

  assert.equal(response.status, 200);
  assert.equal(upstreamBody.input, "Toni Méndez y Sergio Oriola, separados por 1 segundo y 8 décimas.");
});

test("rounds ordinary lap pace to tenths for speech", async () => {
  let upstreamBody: Record<string, unknown> = {};
  global.fetch = (async (_input, init) => {
    upstreamBody = JSON.parse(String(init?.body));
    return new Response(new Uint8Array([73, 68, 51]), { headers: { "Content-Type": "audio/mpeg" } });
  }) as typeof fetch;

  const response = await POST(speechRequest({ text: "Marc está rodando en 17.807.", eventType: "pilot" }));

  assert.equal(response.status, 200);
  assert.equal(upstreamBody.input, "Marc está rodando en 17 coma 8.");
});

test("expands FCO in driver names for speech", async () => {
  let upstreamBody: Record<string, unknown> = {};
  global.fetch = (async (_input, init) => {
    upstreamBody = JSON.parse(String(init?.body));
    return new Response(new Uint8Array([73, 68, 51]), { headers: { "Content-Type": "audio/mpeg" } });
  }) as typeof fetch;

  const response = await POST(speechRequest({ text: "FCO. Javier Ruiz ocupa la cuarta posición.", eventType: "pilot" }));

  assert.equal(response.status, 200);
  assert.equal(upstreamBody.input, "Francisco Javier Ruiz ocupa la cuarta posición.");
});

test("rejects cross-origin and oversized narration requests", async () => {
  const crossOrigin = await POST(speechRequest({ text: "Prueba" }, "https://example.com"));
  assert.equal(crossOrigin.status, 403);
  const oversized = await POST(speechRequest({ text: "a".repeat(601) }));
  assert.equal(oversized.status, 400);
});

test("does not call OpenAI when the server key is missing", async () => {
  delete process.env.OPENAI_API_KEY;
  let called = false;
  global.fetch = (async () => {
    called = true;
    return new Response();
  }) as typeof fetch;
  const response = await POST(speechRequest({ text: "Prueba" }));
  assert.equal(response.status, 503);
  assert.equal(called, false);
});
