// Component: SearchBox -- ripgrep-backed search box.
//
// kb/plan.md step 2: "search box." Debounced (300ms) so every keystroke
// doesn't spawn an `rg` process (server/src/search.ts); results are
// click-to-open (BrowsePane owns what "open" means for a match's path).
import { useEffect, useState } from "react";
import { fetchSearch, type SearchMatch } from "../lib/browse-api";
import type { ApiConfig } from "../lib/api";

const DEBOUNCE_MS = 300;

export function SearchBox({
  api,
  onOpenMatch,
}: {
  api: ApiConfig;
  onOpenMatch: (match: SearchMatch) => void;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPending(true);
    const timer = window.setTimeout(() => {
      void fetchSearch(api, query).then((result) => {
        if (cancelled) return; // a newer keystroke already superseded this request
        setMatches(result.matches);
        setTruncated(result.truncated);
        setPending(false);
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [api, query]);

  return (
    <div className="search-box">
      <input
        type="search"
        placeholder="Search code and KB…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search"
      />
      {pending && query.trim() !== "" && <p className="search-status">searching…</p>}
      <ul className="search-results">
        {matches.map((match, index) => (
          // A match has no stable id of its own -- index is safe (this list is replaced wholesale each search, never patched in place).
          <li key={index}>
            <button type="button" onClick={() => onOpenMatch(match)}>
              <span className="search-result-path">
                {match.path}:{match.line}
              </span>
              <span className="search-result-text">{match.text.trim()}</span>
            </button>
          </li>
        ))}
      </ul>
      {truncated && <p className="search-status">more results exist — refine your query</p>}
    </div>
  );
}
