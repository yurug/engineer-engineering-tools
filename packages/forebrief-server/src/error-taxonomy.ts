// Module: error-taxonomy -- forebrief's error-code -> HTTP-status table.
//
// Implements kb/spec/error-taxonomy.md. Wired into @brief/core's
// generic `makeErrorResponder` (ADR-001: the mapping MECHANISM is core's;
// each consumer supplies its own table, since forebrief's codes are mostly
// disjoint from backbrief's).
import type { HttpStatus } from "@brief/core";

/** kb/spec/error-taxonomy.md's table, pinned to transport status. */
export const FOREBRIEF_ERROR_STATUS: Record<string, HttpStatus> = {
  E_AUTH: 401,
  E_ALREADY_RUNNING: 409,
  E_STALE_STATE: 409,
  E_NO_REPO: 400,
  E_PORT_IN_USE: 409,
  E_NO_SESSION: 409,
  E_ROUND_OPEN: 409,
  E_SCHEMA: 400,
  E_CONFIG: 500,
  E_SEQ_CONFLICT: 409,
  E_FS_BOUNDARY: 500,
  // Step 4 addition (kb/spec/error-taxonomy.md): `forebrief fold` naming an
  // unknown round/card id, or `--card` on a card whose `kind` isn't "adr".
  E_FOLD_TARGET: 400,
  E_INTERNAL: 500,
};
