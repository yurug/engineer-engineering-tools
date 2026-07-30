// Module: lib/submit-on-ctrl-enter -- one shared keydown handler for every
// compose box in the app (SessionComposer, ActivitiesSidebar's "Ask
// backbrief", SelectionContextMenu's annotate/ask/contest boxes,
// AnnotateForm, ImpressionForm, AskQuestionCard's answer box,
// CanvasBlocks.tsx's follow-up box): Ctrl+Enter, or Cmd+Enter on macOS,
// submits -- same as clicking the button. Plain Enter is left untouched so a
// multi-line <textarea> keeps inserting a newline (dogfood UX gap,
// 2026-07-13: users expect the chat/terminal convention, not "Enter submits
// a whole page form").
//
// Deliberately generic over "how submission happens" rather than one
// per-component copy (that's the whole point of a SHARED helper -- every
// call site was hand-rolling its own onKeyDown before this): most compose
// boxes here live inside a real `<form onSubmit>`, so the default path
// calls the native `HTMLElement.form.requestSubmit()` -- this re-runs the
// EXACT SAME validation/submit handler a click on the submit button would
// (respects `disabled`, the "blank text is a no-op" guard, etc.) without
// duplicating that logic here. CanvasBlocks.tsx's FollowUpBox has no <form>
// (a deliberately compact inline layout: textarea + button, not a full
// form element), so it passes an explicit `onSubmit` callback instead.
import type { KeyboardEvent } from "react";

/**
 * @param onSubmit optional explicit submit callback -- when omitted, the
 *   returned handler calls `requestSubmit()` on the field's owning `<form>`
 *   (a no-op if the field isn't inside one, matching the native DOM
 *   contract -- never throws).
 * @returns an onKeyDown handler for a `<textarea>` or `<input>`: Ctrl+Enter
 *   or Cmd+Enter submits; every other key, including plain Enter, is left
 *   completely alone.
 * @invariant never submits on plain Enter alone -- multi-line composers
 *   need Enter for newlines, so ONLY the modifier+Enter combo may trigger a
 *   submit (this is the entire reason this helper exists).
 * @example
 *   <textarea onKeyDown={submitOnCtrlEnter()} />               // inside a <form onSubmit>
 *   <textarea onKeyDown={submitOnCtrlEnter(() => void send())} /> // no <form>
 */
export function submitOnCtrlEnter(
  onSubmit?: () => void,
): (event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => void {
  return (event) => {
    const isSubmitCombo = event.key === "Enter" && (event.ctrlKey || event.metaKey);
    if (!isSubmitCombo) return;
    event.preventDefault(); // never let the combo also insert a newline/fall through to form's default Enter handling
    if (onSubmit) onSubmit();
    else event.currentTarget.form?.requestSubmit();
  };
}
