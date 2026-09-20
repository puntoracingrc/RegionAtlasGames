import assert from "node:assert/strict";
import test from "node:test";
import { get } from "@vercel/blob";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { blobReadPathname } from "./blob-read-pathname";

test("literal Blob keys round-trip through URL transport without decoding IDs", () => {
  for (const id of ["ps4-plain", "ps4-let%27s-sing-abba", "ps4-game&#43;", "ps4-100%", "ps4-question?edition=1", "ps4-colección #1", "ps4-literal%2Fslash"]) {
    const key = `region-atlas/catalog/overlay/games/${id}.json`;
    const url = new URL(`https://example.private.blob.vercel-storage.com/${blobReadPathname(key)}`);
    assert.equal(decodeURIComponent(url.pathname.slice(1)), key);
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
  }
  assert.equal(blobReadPathname("region-atlas/catalog/overlay/index.json"), "region-atlas/catalog/overlay/index.json");
});

test("installed Blob SDK requests the exact literal key, not its decoded or truncated alias", async () => {
  const original = getGlobalDispatcher();
  const mock = new MockAgent();
  mock.disableNetConnect();
  setGlobalDispatcher(mock);
  try {
    const origin = "https://teststore.private.blob.vercel-storage.com";
    const pool = mock.get(origin);
    for (const id of ["ps4-let%27s-sing-abba", "ps4-the-binding-of-isaac-afterbirth&#43;", "ps4-plain"]) {
      const key = `region-atlas/catalog/overlay/games/${id}.json`;
      const body = JSON.stringify({ id, estimatedPriceSealed: 25.68 });
      pool.intercept({ path: `/${blobReadPathname(key)}?cache=0`, method: "GET" })
        .reply(200, body, { headers: { etag: '"v1"', "content-type": "application/json" } });
      const result = await get(blobReadPathname(key), {
        access: "private", useCache: false, token: "vercel_blob_rw_teststore_synthetic-test-only",
      });
      assert.equal(result?.statusCode, 200);
      assert.equal(result?.blob.etag, '"v1"');
      assert.deepEqual(JSON.parse(await new Response(result!.stream).text()), JSON.parse(body));
    }
    mock.assertNoPendingInterceptors();
  } finally {
    setGlobalDispatcher(original);
    await mock.close();
  }
});
