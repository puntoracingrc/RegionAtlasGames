import assert from "node:assert/strict";
import test from "node:test";
import { serializeJsonLd } from "./safe-json-ld";

test("escapes script-breaking characters without changing JSON data", () => {
  const source = { name: "A & B </script><script>alert(1)</script>", line: "one\u2028two" };
  const serialized = serializeJsonLd(source);

  assert.equal(serialized.includes("</script>"), false);
  assert.equal(serialized.includes("<script>"), false);
  assert.deepEqual(JSON.parse(serialized), source);
});
