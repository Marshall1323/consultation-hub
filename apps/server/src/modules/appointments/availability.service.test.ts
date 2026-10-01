import assert from "node:assert/strict";
import test from "node:test";
import { generateSlots, intervalsOverlap } from "./availability.service.js";

const at = (hour: number, minute = 0) => new Date(Date.UTC(2030, 0, 10, hour, minute));

test("half-open adjacent intervals do not overlap", () => {
  assert.equal(
    intervalsOverlap({ start: at(9), end: at(10) }, { start: at(10), end: at(11) }),
    false,
  );
});

test("generates only slots fitting fully inside a work interval", () => {
  const slots = generateSlots({
    windows: [{ start: at(9), end: at(11) }],
    blocked: [],
    durationMinutes: 60,
    stepMinutes: 30,
    notBefore: at(8),
  });
  assert.deepEqual(slots.map((slot) => slot.start.toISOString()), [at(9), at(9, 30), at(10)].map((date) => date.toISOString()));
});

test("removes slots crossing a break or an appointment", () => {
  const slots = generateSlots({
    windows: [{ start: at(9), end: at(13) }],
    blocked: [{ start: at(10), end: at(11) }, { start: at(12), end: at(13) }],
    durationMinutes: 60,
    stepMinutes: 30,
    notBefore: at(8),
  });
  assert.deepEqual(slots.map((slot) => slot.start.toISOString()), [at(9), at(11)].map((date) => date.toISOString()));
});

test("filters slots earlier than the configured lead time", () => {
  const slots = generateSlots({
    windows: [{ start: at(9), end: at(12) }],
    blocked: [],
    durationMinutes: 60,
    stepMinutes: 30,
    notBefore: at(10, 30),
  });
  assert.deepEqual(slots.map((slot) => slot.start.toISOString()), [at(10, 30), at(11)].map((date) => date.toISOString()));
});
