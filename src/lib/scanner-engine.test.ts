import assert from "node:assert/strict";
import test from "node:test";
import { scanGamePhotos, ScannerError } from "./scanner-engine";
import { SCANNER_MODELS, scannerModelsForAccess } from "./scanner-models";
import { scannerDocumentaryKnowledge } from "./scanner-knowledge";

const input = { userId: "test-user", platformSlug: "gameboy", hint: "PROPIETARIO_DICE_ESP", photoUrls: ["data:image/jpeg;base64,TEST"], allowedPlatforms: ["gameboy", "snes"] };
const knowledge = async () => ({ sources: [], entries: [], knownVariantIds: [], examples: [], knowledge: { platformGuidance: false, exactGameMatches: 0, learningAvailable: false } });
const observation = { title: "Tetris", platformSlug: "gameboy", identityConfidence: 0.9, observations: [{ photo: 1, component: "game", description: "Cartucho", codes: ["DMG-TR-ESP"], texts: [], languages: [], distributors: [] }] };
function response(value: unknown, status = "completed") {
  return Response.json({ id: "response-test", model: "test-vision-model", status, usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
    output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }] });
}

test("two-phase engine isolates photos from hint/reference knowledge and records both calls", async () => {
  const key = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test-key";
  try {
    const bodies: string[] = [];
    const usage: string[] = [];
    const result = await scanGamePhotos(input, { knowledge, journal: async (_id, _user, phase) => { usage.push(phase); },
      fetch: async (_url, options) => { bodies.push(String(options?.body)); return response(bodies.length === 1 ? observation : { region: { value: "PAL España", observationIds: ["o1"] } }); } });
    assert.equal(bodies.length, 2);
    assert.ok(!bodies[0].includes(input.hint));
    assert.ok(bodies[1].includes(input.hint));
    assert.ok(!bodies[1].includes("data:image"));
    assert.equal(JSON.parse(bodies[0]).store, false);
    assert.deepEqual(usage, ["perception-1", "interpretation"]);
    assert.equal(result.region.value, "PAL España");
    assert.equal(result.model, "test-vision-model");
  } finally { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});

test("quota errors stop immediately; no text-only fallback is performed", async () => {
  const key = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test-key";
  try {
    let calls = 0;
    await assert.rejects(scanGamePhotos(input, { knowledge, journal: async () => {}, fetch: async () => { calls++; return Response.json({ error: { code: "insufficient_quota" } }, { status: 429 }); } }),
      (error: unknown) => error instanceof ScannerError && error.code === "balance_exhausted");
    assert.equal(calls, 1);
  } finally { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});

test("PS2 packaging guidance reaches interpretation only; perception does not borrow specimen details", async () => {
  const key = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test-key";
  try {
    const bodies: string[] = [];
    await scanGamePhotos({ ...input, platformSlug: "ps2", allowedPlatforms: ["ps2"] }, {
      knowledge: async () => ({ ...scannerDocumentaryKnowledge("ps2", ["ps2-kingdom-hearts-2"]),
        examples: [], knowledge: { platformGuidance: true, exactGameMatches: 1, learningAvailable: false } }),
      journal: async () => {},
      fetch: async (_url, options) => {
        bodies.push(String(options?.body));
        return response(bodies.length === 1 ? { ...observation, title: "Kingdom Hearts 2", platformSlug: "ps2" } : {});
      },
    });
    assert.equal(bodies.length, 2);
    assert.ok(bodies[0].includes("carcasa de plastico"));
    assert.ok(bodies[0].includes("solo si el interior se ve"));
    assert.ok(!bodies[0].includes("BVG"));
    assert.ok(bodies[1].includes("BVG"));
    assert.ok(!bodies[1].includes("spinecard-com-s3"));
    assert.ok(!bodies[1].includes("data:image"));
  } finally { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});

test("incomplete responses are not presented as successful scans", async () => {
  const key = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test-key";
  try {
    await assert.rejects(scanGamePhotos(input, { knowledge, journal: async () => {}, fetch: async () => response(observation, "incomplete") }),
      (error: unknown) => error instanceof ScannerError && error.code === "incomplete");
  } finally { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});

test("platform mismatch skips interpretation and cannot assign a region", async () => {
  const key = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test-key";
  try {
    let calls = 0;
    const result = await scanGamePhotos(input, { knowledge, journal: async () => {}, fetch: async () => { calls++; return response({ ...observation, platformSlug: "snes" }); } });
    assert.equal(calls, 1);
    assert.equal(result.platformMatches, false);
    assert.equal(result.region.value, null);
  } finally { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});

test("timeouts record unknown usage and do not return fabricated recognition", async () => {
  const key = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test-key";
  try {
    const outcomes: string[] = [];
    await assert.rejects(scanGamePhotos(input, { knowledge, journal: async (_id, _user, _phase, outcome) => { outcomes.push(outcome); }, fetch: async () => { throw new Error("timeout"); } }));
    assert.deepEqual(outcomes, ["usage_unknown"]);
  } finally { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});

test("six high-detail photos are isolated, bounded to two concurrent calls and then interpreted together", async () => {
  const key = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test-key";
  try {
    let active = 0; let maximum = 0; let calls = 0;
    const phases: string[] = [];
    const result = await scanGamePhotos({ ...input, photoUrls: Array(6).fill(input.photoUrls[0]) }, {
      knowledge, journal: async (_id, _user, phase) => { phases.push(phase); },
      fetch: async (_url, options) => {
        const body = JSON.parse(String(options?.body));
        const images = body.input[1].content.filter((c: { type: string }) => c.type === "input_image");
        calls++; active++; maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        if (images.length) { assert.equal(images.length, 1); return response(observation); }
        return response({});
      },
    });
    assert.equal(calls, 7); assert.equal(maximum, 2);
    assert.deepEqual(result.perception.observations.map((o) => o.photo), [1, 2, 3, 4, 5, 6]);
    assert.equal(phases.length, 7);
  } finally { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});

test("every allowed model is used for both phases with explicit budgets, without changing input identity", async () => {
  const key = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test-key";
  try {
    const fingerprints = new Set<string>();
    for (const model of SCANNER_MODELS) {
      let calls = 0;
      const result = await scanGamePhotos({ ...input, model: model.id }, { knowledge, journal: async (_id, _user, _phase, _outcome, _data, requested) => { assert.equal(requested, model.id); },
        fetch: async (_url, options) => {
          const body = JSON.parse(String(options?.body));
          assert.equal(body.model, model.id); assert.equal(body.service_tier, "default");
          assert.equal(body.max_output_tokens, model.maxOutputTokens);
          assert.equal(body.reasoning?.effort ?? null, model.reasoning);
          return response(++calls === 1 ? observation : {});
        } });
      assert.equal(calls, 2); assert.equal(result.requestedModel, model.id);
      assert.equal(result.usage.requests, 2); assert.equal(result.usage.inputTokens, 200);
      assert.equal(result.usage.outputTokens, 20); assert.equal(result.usage.totalTokens, 220);
      assert.equal(result.usage.cachedInputTokens, null);
      fingerprints.add(result.inputFingerprint);
    }
    assert.equal(fingerprints.size, 1);
    const changed = await scanGamePhotos({ ...input, hint: "different" }, { knowledge, journal: async () => {}, fetch: async () => response({ ...observation, platformSlug: "snes" }) });
    assert.ok(!fingerprints.has(changed.inputFingerprint));
  } finally { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});

test("capability menu has a closed order and public access retains the worker reference only", () => {
  assert.deepEqual(SCANNER_MODELS.map((m) => m.id), ["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-4o-mini"]);
  assert.deepEqual(scannerModelsForAccess(false).map((m) => m.id), ["gpt-4o-mini"]);
  assert.equal(scannerModelsForAccess(true).length, 5);
});

test("an unavailable selected model does not silently switch providers or models", async () => {
  const key = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test-key";
  try {
    let calls = 0;
    await assert.rejects(scanGamePhotos({ ...input, model: "gpt-6-astra" }, { knowledge, journal: async () => {}, fetch: async () => { calls++; return Response.json({ error: { code: "model_not_found" } }, { status: 404 }); } }),
      (e: unknown) => e instanceof ScannerError && e.code === "provider_unavailable");
    assert.equal(calls, 1);
  } finally { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});
