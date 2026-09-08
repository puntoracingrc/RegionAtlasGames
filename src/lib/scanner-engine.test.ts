import assert from "node:assert/strict";
import test from "node:test";
import { scanGamePhotos, ScannerError } from "./scanner-engine";
import { SCANNER_MODELS, scannerModelsForAccess, scannerPerceptionMode } from "./scanner-models";

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
    assert.deepEqual(result.interpretation, { status: "completed", reason: null });
    assert.equal(result.perceptionMode, "per_photo");
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
    assert.deepEqual(result.interpretation, { status: "skipped", reason: "platform_mismatch" });
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

test("GT64 six-view regression reaches interpretation for every configured model without upgrading pairing", async () => {
  const key = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test-key";
  try {
    // Synthetic per-photo identities: the original exports did not retain these fields.
    const readings = [
      { title: "GT64 Championship Edition", component: "box", texts: ["GT64", "CHAMPIONSHIP EDITION", "NINTENDO 64", "PAL VERSION"] },
      { title: null, component: "box", texts: ["NINTENDO 64", "Distribuido por", "INFOGRAMES IBERICA"] },
      { title: "GT64", component: "game", texts: ["GT64", "Nintendo 64"] },
      { title: null, component: "game", texts: ["NINTENDO 64 GAME PAK", "NUS-EUR-1"] },
      { title: "GT 64", component: "game", texts: ["GT64", "Nintendo 64"] },
      { title: "GT 64: Championship Edition", component: "manual", texts: ["GT64", "CHAMPIONSHIP EDITION", "NUS-NGCP-EUR"] },
    ];
    for (const model of SCANNER_MODELS) {
      const joint = scannerPerceptionMode(model.id) === "joint";
      let photoIndex = 0; let interpretationCalls = 0;
      const phases: string[] = [];
      const result = await scanGamePhotos({ ...input, platformSlug: "n64", allowedPlatforms: ["n64", "gameboy"], model: model.id,
        photoUrls: readings.map((_, i) => `data:image/jpeg;base64,SYNTHETIC-${i}`) }, {
        knowledge: async (platform, perception) => {
          assert.equal(platform, "n64"); assert.equal(perception.platformSlug, "n64");
          assert.equal(perception.identityConflict, false); assert.equal(perception.photoReadings?.length, joint ? undefined : 6);
          assert.deepEqual(perception.observations.map((o) => o.photo), [1, 2, 3, 4, 5, 6]);
          return knowledge();
        },
        journal: async (_id, _user, phase) => { phases.push(phase); },
        fetch: async (_url, options) => {
          const body = JSON.parse(String(options?.body));
          const images = body.input[1].content.filter((c: { type: string }) => c.type === "input_image");
          assert.equal(body.model, model.id);
          if (images.length) {
            assert.ok(!String(options?.body).includes(input.hint));
            assert.equal(images.length, joint ? 6 : 1);
            if (joint) {
              photoIndex += images.length;
              return response({ title: "GT 64: Championship Edition", platformSlug: "n64", identityConfidence: 0.95,
                multipleGames: false, multiplePlatforms: false,
                observations: readings.map((r, i) => ({ photo: i + 1, component: r.component, texts: r.texts })) });
            }
            const r = readings[photoIndex++];
            return response({ title: r.title, platformSlug: "n64", identityConfidence: r.title ? 0.95 : 0, multipleGames: false,
              observations: [{ photo: 1, component: r.component, texts: r.texts, codes: [], languages: [], distributors: [] }] });
          }
          interpretationCalls++;
          const payload = JSON.parse(body.input[1].content[0].text);
          assert.equal(payload.observations.platformSlug, "n64");
          assert.equal(payload.observations.title, "GT 64: Championship Edition");
          assert.equal(payload.observations.photoReadings?.[3].title, joint ? undefined : null);
          return response({ region: { value: "PAL España", observationIds: ["o2"] },
            composition: { status: "compatible", observationIds: ["o1", "o3", "o6"], sourceIds: [], variantId: "invented" } });
        },
      });
      assert.equal(photoIndex, 6); assert.equal(interpretationCalls, 1); assert.equal(result.usage.requests, joint ? 2 : 7);
      assert.equal(result.perceptionMode, joint ? "joint" : "per_photo");
      assert.equal(phases[0], joint ? "perception-joint" : "perception-1");
      assert.equal(phases.filter((p) => p === "interpretation").length, 1);
      assert.equal(result.perception.platformSlug, "n64"); assert.equal(result.platformMatches, true);
      assert.equal(result.region.value, "PAL España"); assert.equal(result.composition.status, "unknown");
      assert.equal(result.knowledge.platformGuidance, false);
      assert.deepEqual(result.interpretation, { status: "completed", reason: null });
    }
  } finally { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});

test("joint perception retains global photo references even when observations are out of order", async () => {
  const key = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test-key";
  try {
    let calls = 0;
    const result = await scanGamePhotos({ ...input, model: "gpt-6-astra", photoUrls: [input.photoUrls[0], input.photoUrls[0]] }, {
      knowledge, journal: async () => {}, fetch: async () => response(++calls === 1
        ? { ...observation, observations: [{ ...observation.observations[0], photo: 2 }, { ...observation.observations[0], photo: 1 }] }
        : { region: { value: "PAL España", observationIds: ["o1"] } }),
    });
    assert.equal(calls, 2);
    assert.deepEqual(result.perception.observations.map((o) => [o.id, o.photo]), [["o1", 2], ["o2", 1]]);
    assert.deepEqual(result.region.observationIds, ["o1"]);
  } finally { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});

test("joint input never silently omits a photo or accepts out-of-range photo references", async () => {
  const key = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test-key";
  try {
    for (const photo of [1, 3]) {
      let calls = 0;
      await assert.rejects(scanGamePhotos({ ...input, model: "gpt-6-astra", photoUrls: [input.photoUrls[0], input.photoUrls[0]] }, {
        knowledge, journal: async () => {}, fetch: async () => {
          calls++; return response({ ...observation, observations: [observation.observations[0], { ...observation.observations[0], photo }] });
        },
      }), (e: unknown) => e instanceof ScannerError && e.code === "incomplete_photos");
      assert.equal(calls, 1);
    }
  } finally { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});

test("joint detection of multiple games or platforms blocks global region assignment", async () => {
  const key = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test-key";
  try {
    for (const field of ["multipleGames", "multiplePlatforms"] as const) {
      let calls = 0;
      const result = await scanGamePhotos({ ...input, model: "gpt-6-astra" }, {
        knowledge, journal: async () => {}, fetch: async () => { calls++; return response({ ...observation, [field]: true }); },
      });
      assert.equal(calls, 1); assert.equal(result.perception.title, null); assert.equal(result.region.value, null);
      assert.deepEqual(result.interpretation, { status: "skipped", reason: field === "multipleGames" ? "identity_conflict" : "platform_conflict" });
    }
  } finally { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});

test("a different game on the same platform skips global interpretation without erasing the platform", async () => {
  const key = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test-key";
  try {
    let calls = 0;
    const result = await scanGamePhotos({ ...input, photoUrls: [input.photoUrls[0], input.photoUrls[0]] }, {
      knowledge, journal: async () => {}, fetch: async () => response({ ...observation, title: ++calls === 1 ? "Tetris" : "Tetris 2" }),
    });
    assert.equal(calls, 2); assert.equal(result.perception.platformSlug, "gameboy");
    assert.equal(result.perception.title, null); assert.equal(result.region.value, null);
    assert.deepEqual(result.interpretation, { status: "skipped", reason: "identity_conflict" });
  } finally { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});

test("multiple games in one photo cannot bypass the identity conflict gate", async () => {
  const key = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test-key";
  try {
    let calls = 0;
    const result = await scanGamePhotos(input, { knowledge, journal: async () => {}, fetch: async () => {
      calls++; return response({ ...observation, title: null, multipleGames: true });
    } });
    assert.equal(calls, 1); assert.equal(result.region.value, null);
    assert.deepEqual(result.interpretation, { status: "skipped", reason: "identity_conflict" });
  } finally { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});

test("unknown platform cannot be supplied by the user's selection or hint", async () => {
  const key = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test-key";
  try {
    let calls = 0;
    const result = await scanGamePhotos(input, { knowledge, journal: async () => {}, fetch: async () => {
      calls++; return response({ ...observation, platformSlug: null });
    } });
    assert.equal(calls, 1); assert.equal(result.perception.title, "Tetris");
    assert.equal(result.region.value, null);
    assert.deepEqual(result.interpretation, { status: "skipped", reason: "platform_unknown" });
  } finally { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});
