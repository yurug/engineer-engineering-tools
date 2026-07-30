// Component: Closing -- the steerability statement, which is how a session ends.
//
// P7: it names what was covered AND what remains unknown, and a session that
// covered nothing says so. The unknown list is rendered with the same weight as
// the covered list on purpose. Making it smaller, or collapsing it behind a
// toggle, would be the polite version of hiding it, and hiding it is the exact
// defect the property exists to prevent.
//
// The skipped list is here for a related reason. Subtraction is what makes a
// second session short (P2), and a subtraction nobody can see is
// indistinguishable from a session that simply taught less.
import type { SteerabilityStatement } from "../lib/types";

export function Closing({ statement }: { statement: SteerabilityStatement }): React.JSX.Element {
  return (
    <section className="closing" data-testid="closing">
      <h1>Where you stand</h1>
      <p className="summary">{statement.summary}</p>

      <h2>You can now explain</h2>
      {statement.covered.length === 0 ? (
        <p className="empty">Nothing yet.</p>
      ) : (
        <ul data-testid="covered">
          {statement.covered.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      )}

      {statement.alreadyHeld.length > 0 && (
        <>
          <h2>Skipped, because you already knew it</h2>
          <ul data-testid="already-held">
            {statement.alreadyHeld.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </>
      )}

      {statement.disputed.length > 0 && (
        <section>
          <h3>You disagreed with these</h3>
          <p className="note">
            Reported apart from what you did not grasp, because these are claims about the map
            rather than gaps in you (ADR-030). Each one is owed a correction or a defence.
          </p>
          <ul data-testid="disputed">
            {statement.disputed.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </section>
      )}

      {statement.questions.length > 0 && (
        <section>
          <h3>You asked, and nobody has answered</h3>
          <ul data-testid="open-questions">
            {statement.questions.map((q) => (
              <li key={q.seq}>{q.text}</li>
            ))}
          </ul>
        </section>
      )}

      {statement.findings.length > 0 && (
        <>
          <h2>Worth acting on</h2>
          {/* Not documentation, and not something the engineer needs to
              understand: things noticed while teaching that someone should fix
              (ADR-025). Placed before the unknowns because they are the most
              actionable thing a session produces. */}
          <ul data-testid="findings">
            {statement.findings.map((f) => (
              <li key={f.text}>{f.text}</li>
            ))}
          </ul>
        </>
      )}

      <h2>Still open</h2>
      {statement.unknown.length === 0 ? (
        <p className="empty">Nothing left in this map.</p>
      ) : (
        <ul data-testid="unknown">
          {statement.unknown.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      )}
      {statement.mapWarnings.length > 0 && (
        <>
          <h2>What this session could not do well</h2>
          {/* P6 says a weaker map says so. Placed LAST and not hidden: the
              engineer has just been told what they now hold, and this is the
              caveat on that claim rather than a preamble to it. */}
          <ul data-testid="map-warnings">
            {statement.mapWarnings.map((w) => (
              <li key={w.code}>{w.detail}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
