// Тестове за изчисляване на разхода от токени + цени. node test/ai-cost.test.mjs
import assert from "node:assert/strict";
import { estimateCost, costLabel, AI_PRICING } from "../app/lib/ai-pricing.js";

let n = 0;
const t = typeof it === "function" ? it : (name, fn) => { fn(); n++; console.log("ok -", name); };

t("estimateCost: gpt-5.6-terra по реални токени", () => {
  // 77637 in × $1.25/1M + 68143 out × $7.5/1M
  const c = estimateCost("gpt-5.6-terra", 77637, 68143);
  const expected = 77637 / 1e6 * 1.25 + 68143 / 1e6 * 7.5;
  assert.ok(Math.abs(c - expected) < 1e-9);
  assert.ok(c > 0.6 && c < 0.62);
});

t("estimateCost: nano е много евтин", () => {
  const c = estimateCost("gpt-5.4-nano", 1000000, 1000000);
  assert.ok(Math.abs(c - (0.10 + 0.625)) < 1e-9);
});

t("estimateCost: непознат модел → null", () => {
  assert.equal(estimateCost("claude-opus-4-8", 100, 100), null);
});

t("estimateCost: нула токени → 0", () => {
  assert.equal(estimateCost("gpt-5.6-terra", 0, 0), 0);
});

t("costLabel формати", () => {
  assert.equal(costLabel(null), null);
  assert.equal(costLabel(0), "$0");
  assert.equal(costLabel(0.004), "<$0.01");
  assert.match(costLabel(0.6083), /^\$0\.60/);
  assert.match(costLabel(12.5), /^\$12\.50$/);
});

t("всички модели имат in/out цени", () => {
  for (const [id, p] of Object.entries(AI_PRICING)) {
    assert.ok(typeof p.in === "number" && p.in >= 0, id);
    assert.ok(typeof p.out === "number" && p.out >= 0, id);
  }
});

console.log(`\n${n} passed (ai-cost)`);
