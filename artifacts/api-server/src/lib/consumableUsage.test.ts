import assert from "node:assert/strict";
import test from "node:test";
import { consumableUsage as calculate, parseConsumableUsage } from "./consumableUsage";
const consumableUsage = (item: Parameters<typeof calculate>[0]) => calculate({ unitType: "prints", ...item });

test("legacy rolls, packs and unspecified units never become print-capacity estimates", () => {
  for (const unitType of [undefined, "rolls", "packs", "units", "sheets"]) {
    assert.deepEqual(calculate({ currentQuantity: 5000, unitType, averagePrintsPerEvent: 250, averageEventsPerMonth: "8" }), { monthlyConsumption: null, eventsRemaining: null, monthsRemaining: null });
  }
});

test("event estimates use print quantities: 250 prints times 8 events equals 2000 monthly", () => {
  assert.deepEqual(consumableUsage({ currentQuantity: 5000, averagePrintsPerEvent: 250, averageEventsPerMonth: "8.00" }), { monthlyConsumption: 2000, eventsRemaining: 20, monthsRemaining: 2.5 });
  assert.deepEqual(consumableUsage({ currentQuantity: 0, averagePrintsPerEvent: 250, averageEventsPerMonth: "8" }), { monthlyConsumption: 2000, eventsRemaining: 0, monthsRemaining: 0 });
  assert.deepEqual(consumableUsage({ currentQuantity: 5000, averagePrintsPerEvent: 0, averageEventsPerMonth: "8" }), { monthlyConsumption: 0, eventsRemaining: null, monthsRemaining: null });
  assert.deepEqual(consumableUsage({ currentQuantity: 5000, averagePrintsPerEvent: 250, averageEventsPerMonth: "0" }), { monthlyConsumption: 0, eventsRemaining: 20, monthsRemaining: null });
  assert.deepEqual(consumableUsage({ currentQuantity: 5000, averagePrintsPerEvent: 250, averageEventsPerMonth: null }), { monthlyConsumption: null, eventsRemaining: 20, monthsRemaining: null });
  assert.deepEqual(consumableUsage({ currentQuantity: 5000 }), { monthlyConsumption: null, eventsRemaining: null, monthsRemaining: null });
  assert.equal(consumableUsage({ currentQuantity: 100, averagePrintsPerEvent: 100, averageEventsPerMonth: "2.5" }).monthlyConsumption, 250);
});

test("event input bounds preserve null and zero without coercing legacy strings", () => {
  assert.deepEqual(parseConsumableUsage({ averagePrintsPerEvent: 0, averageEventsPerMonth: 0 }), { averagePrintsPerEvent: 0, averageEventsPerMonth: "0" });
  assert.deepEqual(parseConsumableUsage({ averagePrintsPerEvent: null, averageEventsPerMonth: null }), { averagePrintsPerEvent: null, averageEventsPerMonth: null });
  assert.deepEqual(parseConsumableUsage({ estimatedDailyUsage: "100" }), {});
  assert.deepEqual(parseConsumableUsage({ averageEventsPerMonth: 0.29 }), { averageEventsPerMonth: "0.29" });
  for (const value of [-1, 1.5, 1000001, "250", Infinity, NaN, false]) assert.throws(() => parseConsumableUsage({ averagePrintsPerEvent: value }));
  for (const value of [-1, 1.001, 1000000, "8", Infinity, NaN, false]) assert.throws(() => parseConsumableUsage({ averageEventsPerMonth: value }));
});
