/**
 * The typeface the customer's designed screens use.
 *
 * Plus Jakarta Sans, loaded by the end user's `app/layout.tsx` through
 * `next/font/google` and exposed as `--font-jakarta`.
 *
 * ## Why the whole class is a constant, and not just the family name
 *
 * Two things about a Tailwind arbitrary property make this easy to get wrong,
 * and both fail silently.
 *
 * **The brackets are part of the class.** `[font-family:var(…)]` is a class
 * name. The value `var(--font-jakarta,…)` on its own is not — wrapped in
 * brackets it becomes `[var(--font-jakarta,…)]`, which Tailwind reads as an
 * arbitrary *property name*, generates no rule for, and drops without a warning.
 * The build succeeds, the markup carries the class, and the screen renders in
 * the system face. That is what happened to the first version of these three
 * screens, and the only thing that caught it was reading the computed
 * `font-family` in a real browser — the test below came after, not before.
 *
 * **The name needs its platform fallback.** These screens are in a shared
 * package, and three of the four applications never load `--font-jakarta`. A
 * bare `font-jakarta` there would fall back to nothing, so the platform stack
 * is written behind the variable.
 *
 * The design specifies this face, which is the one reason to override the system
 * font — the material guidance asks for exactly that: a stated reason, and this
 * is it.
 *
 * Exported so all three screens agree. A screen that forgot it would not look
 * wrong beside the others on a machine that has the font, and would look wrong
 * only on the one that does not — so the test asserts the class is present in the
 * markup rather than trusting each screen to remember.
 */
export const JAKARTA_FONT_CLASS =
    '[font-family:var(--font-jakarta,system-ui,-apple-system,sans-serif)]'
