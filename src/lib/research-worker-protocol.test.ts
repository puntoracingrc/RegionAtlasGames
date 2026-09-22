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

test("validated source routes are prioritized without becoming exclusive", () => {
  const prompt = readResearchInstruction("research/automation/CHATGPT_TASK_PROMPT.md");
  const protocol = readResearchInstruction("research/automation/PROTOCOL.md");
  const readme = readResearchInstruction("research/README.md");
  const orderTemplate = readResearchInstruction("research/ORDER_TEMPLATE.md");

  assert.match(prompt, /`research\/source-performance\.json`/);
  assert.match(prompt, /rutas \*\*prioritarias, no exclusivas\*\*/);
  assert.match(prompt, /continúa con las demás fuentes, queries y rutas normales/);

  assert.match(protocol, /`VALIDATED_ROUTES_AVAILABLE`/);
  assert.match(protocol, /Las entradas de `recommendations` son rutas prioritarias, no exclusivas/);
  assert.match(protocol, /Agotar las recomendaciones no es una condición de parada/);
  assert.match(protocol, /INSUFFICIENT_CROSS_RESEARCH_EVIDENCE/);

  assert.match(readme, /se consultan primero/);
  assert.match(readme, /Son rutas prioritarias, no exclusivas/);
  assert.match(readme, /continúa con las fuentes, queries y rutas normales/);

  assert.match(orderTemplate, /consulta primero las rutas de `recommendations`/);
  assert.match(orderTemplate, /Estas rutas aprendidas son prioritarias, no exclusivas/);
  assert.match(orderTemplate, /Agotar las recomendaciones no permite detener la investigación/);
});
