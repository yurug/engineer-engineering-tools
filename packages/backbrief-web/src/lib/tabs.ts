// Module: lib/tabs -- the TabId type shared by App.tsx and TabBar.tsx.
//
// Split into its own file (rather than living in either component) so
// App.tsx can import the type without importing TabBar's JSX, and vice
// versa -- a one-line module, but it's the kind of shared vocabulary
// kb/conventions/code-style.md's "one exported concept per file" is about.
export type TabId = "session" | "map" | "code";
