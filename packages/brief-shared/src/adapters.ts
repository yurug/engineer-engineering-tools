// Module: adapters -- default production implementations of ./ports.ts.
//
// Kept separate from ports.ts so that code which only needs the *interface*
// (e.g. a function signature taking `Clock`) never pulls in the `ulid`
// dependency transitively. Test doubles (fixed clocks, sequential id
// generators) live beside the tests that use them, not here -- this file is
// production wiring only.
import { ulid } from "ulid";
import type { Clock, IdGenerator } from "./ports";

export const systemClock: Clock = {
  nowIso: () => new Date().toISOString(),
};

export const ulidGenerator: IdGenerator = {
  next: () => ulid(),
};
