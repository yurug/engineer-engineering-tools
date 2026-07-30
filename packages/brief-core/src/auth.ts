// Module: auth -- the two-token scheme that is a brief-core server's ENTIRE
// attribution mechanism.
//
// Extracted verbatim from @backbrief/server (ADR-001) -- no coupling to
// backbrief-domain types, so nothing to parameterize. The token determines
// `actor` -- there is no other attribution mechanism; callers map that to
// their own domain (e.g. a P4-style authorization check).
import { randomBytes } from "node:crypto";
import { AppError } from "@brief/shared";

export interface Tokens {
  agentToken: string;
  humanToken: string;
}

/** 256 bits of randomness, hex-encoded -- unguessable, URL-safe for the browser bootstrap link. */
export function generateTokens(): Tokens {
  return {
    agentToken: randomBytes(32).toString("hex"),
    humanToken: randomBytes(32).toString("hex"),
  };
}

export type TokenActor = "agent" | "human";

/**
 * @param presented the bearer token from `Authorization: Bearer <token>` or `?token=`
 * @returns which actor role that token belongs to
 * @throws {AppError} E_AUTH if `presented` matches neither token
 */
export function identifyActor(presented: string | undefined, tokens: Tokens): TokenActor {
  if (presented === tokens.agentToken) return "agent";
  if (presented === tokens.humanToken) return "human";
  throw new AppError("E_AUTH", "Not authorized — token missing or wrong.");
}
