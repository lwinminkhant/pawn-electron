import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateInterestAmountByDays,
  calculateInterestAmountForPeriod,
  calculateRedeemInterest,
  getElapsedMonthsAndDays,
} from "./calculations.js";

test("calculateInterestAmountByDays prorates monthly interest by day", () => {
  assert.equal(calculateInterestAmountByDays(300_000, 3, 30), 9_000);
  assert.equal(calculateInterestAmountByDays(300_000, 3, 15), 4_500);
  assert.equal(calculateInterestAmountByDays(300_000, 3, 0), 0);
});

test("getElapsedMonthsAndDays splits a period into full months plus remaining days", () => {
  const from = new Date("2026-03-10T00:00:00.000Z");
  const to = new Date("2026-05-15T00:00:00.000Z");
  assert.deepEqual(getElapsedMonthsAndDays(from, to), { months: 2, days: 5 });
});

test("calculateInterestAmountForPeriod charges full months plus remaining days", () => {
  const from = new Date("2026-03-10T00:00:00.000Z");
  const to = new Date("2026-05-15T00:00:00.000Z");
  assert.equal(calculateInterestAmountForPeriod(100_000, 3, from, to), 6_500);
});

test("calculateRedeemInterest charges one full month for same-day redemption", () => {
  const createdAt = new Date("2026-04-01T00:00:00.000Z");
  const now = new Date("2026-04-01T00:00:00.000Z");
  assert.equal(calculateRedeemInterest(200_000, 5, null, createdAt, now), 10_000);
});

test("calculateRedeemInterest charges a full first month when redeeming within month one and no interest was paid yet", () => {
  const createdAt = new Date("2026-04-01T00:00:00.000Z");
  const now = new Date("2026-04-20T00:00:00.000Z");
  assert.equal(calculateRedeemInterest(200_000, 5, null, createdAt, now), 10_000);
});

test("calculateRedeemInterest uses month plus day instead of rounding partial months up", () => {
  const lastPaymentDate = new Date("2026-02-15T00:00:00.000Z");
  const now = new Date("2026-04-01T00:00:00.000Z");
  assert.equal(calculateRedeemInterest(100_000, 3, lastPaymentDate, null, now), 4_700);
});

test("calculateRedeemInterest keeps prorating partial months after an interest payment exists", () => {
  const lastPaymentDate = new Date("2026-04-01T00:00:00.000Z");
  const now = new Date("2026-04-20T00:00:00.000Z");
  assert.equal(calculateRedeemInterest(200_000, 5, lastPaymentDate, null, now, true), 6_333);
});

test("calculateRedeemInterest charges the full first month when lastPaymentDate is only the opening date", () => {
  const createdAt = new Date("2026-04-01T00:00:00.000Z");
  const lastPaymentDate = new Date("2026-04-01T00:00:00.000Z");
  const now = new Date("2026-04-20T00:00:00.000Z");
  assert.equal(calculateRedeemInterest(200_000, 5, lastPaymentDate, createdAt, now, false), 10_000);
});
