// Module: lib/use-open-path -- loads whatever the Code activity's file
// tree selects, routing `.md` paths through the KB viewer first (falling
// back to the plain code viewer on a 404) -- BrowsePane.tsx's own kb-vs-
// code routing logic (kept alive here, its ORIGINAL comment explains the
// exact reasoning, quoted verbatim below), now the Code activity's.
//
// "KB-vs-code routing: a `.md` path tries `GET /api/kb` first (server-side
// truth: it 404s if the path isn't under `config.kbDir`), falling back to
// `GET /api/file` on that 404 -- a NON-.md path never pays that extra round
// trip, since KB files are always markdown by this project's own
// convention. This avoids the client needing to know `config.kbDir` at
// all." `noKbMode` (C1, session-startup config) skips the KB attempt
// entirely when no KB is configured -- there is nothing to 404 against.
import { useEffect, useState } from "react";
import { fetchFile, fetchKb, type FileContent, type KbFile } from "./browse-api";
import { useNavigationEvents } from "./use-navigation-events";
import type { ApiConfig } from "./api";

export interface OpenPathResult {
  file: FileContent | null;
  kb: KbFile | null;
  error: unknown;
}

async function loadPath(
  api: ApiConfig,
  path: string,
  noKbMode: boolean,
): Promise<{ file: FileContent | null; kb: KbFile | null }> {
  if (!noKbMode && path.endsWith(".md")) {
    try {
      return { file: null, kb: await fetchKb(api, path) };
    } catch {
      // Not under config.kbDir (server's 404) -- fall through to the plain file viewer.
    }
  }
  return { file: await fetchFile(api, path), kb: null };
}

export function useOpenPath(
  api: ApiConfig,
  path: string | null,
  noKbMode: boolean,
): OpenPathResult {
  const [file, setFile] = useState<FileContent | null>(null);
  const [kb, setKb] = useState<KbFile | null>(null);
  const [error, setError] = useState<unknown>(null);
  const nav = useNavigationEvents(api);

  useEffect(() => {
    if (!path) return;
    nav.reportOpened(path);
    setFile(null);
    setKb(null);
    setError(null);
    let cancelled = false;
    loadPath(api, path, noKbMode)
      .then((result) => {
        if (cancelled) return;
        setFile(result.file);
        setKb(result.kb);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
    };
    // `nav` deliberately excluded -- BrowsePane.tsx's own retired precedent:
    // a stable callback bag whose identity changes every render but whose
    // behavior doesn't depend on anything this effect needs to re-run for.
  }, [api, path, noKbMode]);

  return { file, kb, error };
}
