// Component: Opening -- what the session says it is for, before any teaching.
//
// The pandora checkpoint found a session that made sense question by question and
// had no visible destination: "je ne savais pas très bien où le système voulait
// m'emmener, quelle était son intention". A session ended with a statement of
// what you now hold and began with nothing.
//
// Kept deliberately small. The double-check on ADR-022 put signalling at g<0.2
// across 1189 studies, with laconic's own reading being "cue what matters, but
// don't build the skill around it". So: one line of intent, the shape of the
// path, and a way in. Not a syllabus.
import type { GroundedNode } from "../lib/types";

export function Opening({
  intent,
  planned,
  onStart,
}: {
  intent: string;
  planned: GroundedNode[];
  onStart: () => void;
}): React.JSX.Element {
  return (
    <section className="opening" data-testid="opening">
      <h1>What this session is for</h1>
      <p className="intent">{intent}</p>

      <h2>The path</h2>
      <ol data-testid="planned-path">
        {planned.map((n) => (
          <li key={n.id}>{n.question}</li>
        ))}
      </ol>
      <p className="note">
        You decide what you understand, and you can end the session at any point. Anything not
        covered is named at the end rather than quietly dropped.
      </p>

      <button type="button" onClick={onStart}>
        Start
      </button>
    </section>
  );
}
