// Module: lib/use-glossary -- fetches GET /api/glossary ONCE per session
// (ADR-007 decision 4: "Any glossary term rendered in the UI shows a
// hover/focus card... GET /api/glossary").
//
// A single fetch-at-mount, not a poll -- kb/GLOSSARY.md is repo source, not
// session state: nothing in a live session can change it (P3: backbrief
// never mutates the repo), so there is no live-update case lib/use-presence.ts's
// polling pattern would justify here. Mirrors lib/use-no-kb-mode.ts's own
// one-shot-read shape.
import { useEffect, useState } from "react";
import { fetchGlossary } from "./glossary-api";
import type { ApiConfig } from "./api";
import type { GlossaryTerm } from "@backbrief/shared/browser";

const EMPTY_TERMS: readonly GlossaryTerm[] = [];

/** @returns the repo's glossary terms; `[]` (never undefined/loading-blocking) until the fetch resolves or on any failure -- GlossaryText's own degrade-silently contract starts here. */
export function useGlossary(api: ApiConfig): readonly GlossaryTerm[] {
  const [terms, setTerms] = useState<readonly GlossaryTerm[]>(EMPTY_TERMS);

  useEffect(() => {
    let cancelled = false;
    void fetchGlossary(api).then((fetched) => {
      if (!cancelled) setTerms(fetched);
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return terms;
}
