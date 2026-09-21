import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readResearchInstruction(path: string): string {
  return readFileSync(path, "utf8");
}

test("a recovered worker lease must continue in the same scheduled execution", () => {
  const prompt = readResearchInstruction("research/automation/CHATGPT_TASK_PROMPT.md");
  const protocol = readResearchInstruction("research/automation/PROTOCOL.md");

  assert.match(prompt, /La recuperación no es una salida terminal/);
  assert.match(prompt, /prohibido responder `RUNNING` después de haber creado o recuperado tu propio lease/);
  assert.match(prompt, /nunca puede terminar dejando únicamente `RUNNING`/);
  assert.match(protocol, /No puede responder `RUNNING` por un lease que ella misma acaba de crear/);
  assert.match(protocol, /resultado completo en `RESULT_READY`/);
  assert.match(protocol, /checkpoint factual con estado global `READY`/);
  assert.match(protocol, /bloqueo real en `PAUSED`/);
});
