/**
 * The colours the customer's three Figma frames specify, as complete Tailwind
 * class strings.
 *
 * ## Why these are literal hexes and not palette tokens
 *
 * Two reasons, and the second is the one that bites.
 *
 * **The designs do not use a stock palette.** The dashboard's trust banner is
 * `#114B43`, the matching screen's accent text is `#6FFBBE` on `#00332D`, and
 * the inactive sort chip is `#E9EDFF`. These are one design system's private
 * greens. `emerald-800` is not that colour, and substituting it would be a
 * different design wearing the same layout.
 *
 * **Tailwind's scanner reads source text, not evaluated strings.** A class
 * assembled at run time — `` `bg-[${colour}]` `` — is invisible to it, and the
 * class is silently dropped from the build. The build still succeeds and the
 * screen renders unstyled. So every value here is a *whole, literal* class
 * string: ugly to read, and the only form that survives compilation. This is the
 * same trap as the `@source` path in each application's `globals.css`, one layer
 * down.
 *
 * ## Dark mode
 *
 * Each token carries its own `dark:` half. The designs are light-only, so the
 * dark values are not read off a Figma frame — they are the same hue family
 * lifted for a dark ground, chosen to keep the contrast ratios the light values
 * have rather than to match a second design. Every colour pair is exercised by a
 * rendered screen, and the whole set is asserted in the screen test, so a token
 * losing its `dark:` half fails rather than rendering a light chip on a dark
 * card.
 *
 * ## A doc comment ends at the first star-slash
 *
 * Worth writing down because the first draft of this file did it, and the
 * failure was thirty lines of parse errors pointing at innocent class strings.
 * Naming a path in prose with a wildcard in it puts a comment terminator inside
 * the comment, the comment closes there, and everything after it is parsed as
 * TypeScript.
 *
 * The errors name the symptom rather than the cause — something about module
 * declaration names needing quotes, reported on a line that is plainly a string
 * literal. Nothing says the comment ended early, and the first instinct is to
 * distrust the code instead of the prose. So: no wildcard paths in a docblock,
 * and when a file full of string literals suddenly stops parsing, read the
 * comment above it.
 */

/** The frame ground: `#FBFCFC` on the dashboard, `#F9F9FF` on matching results. */
export const GROUND =
    'bg-[#F8FAFC] dark:bg-[#0B1220]'

/** A card surface. The designs use pure white on a near-white ground. */
export const CARD =
    'rounded-2xl bg-white ring-1 ring-[#F1F5F9] dark:bg-[#111A2B] dark:ring-[#243350]'

/** The deep teal the designs use for the active tab, the trust banner, the hero. */
export const DEEP =
    'bg-[#114B43] dark:bg-[#0C332D]'

/** The primary action fill. Distinct from {@link DEEP} by a step. */
export const ACTION =
    'bg-[#0F5B55] text-white dark:bg-[#6FFBBE] dark:text-[#04231F]'

/** The accent green for prices, counts and "live" text. */
export const ACCENT_TEXT =
    'text-[#006C49] dark:text-[#6FFBBE]'

/** Primary body text. */
export const INK = 'text-[#0F172A] dark:text-[#EDF0FF]'

/** Secondary body text — the design's `#64748B` / `#94A3B8` / `#404946` family. */
export const INK_SOFT =
    'text-[#64748B] dark:text-[#94A3B8]'

/**
 * The dark price card on the booking screen (`#111827`).
 *
 * The one genuinely dark surface in a light design, and kept dark in dark mode
 * too — inverted to a *lighter* card would lose the contrast that makes the
 * amber total read as the number that matters.
 */
export const PRICE_CARD =
    'rounded-2xl bg-[#111827] ring-1 ring-black/10 dark:bg-[#0A0F1A] dark:ring-white/10'

/** The amber the design uses for the total and for the rating star. */
export const AMBER_TEXT = 'text-[#F59E0B] dark:text-[#FBBF24]'

/** The unselected sort chip (`#E9EDFF`) and the selected one (`#00332D`). */
export const CHIP_OFF =
    'bg-[#E9EDFF] text-[#141B2B] hover:bg-[#DDE3FB] dark:bg-[#1A2438] dark:text-[#EDF0FF] dark:hover:bg-[#232F49]'

export const CHIP_ON =
    'bg-[#00332D] text-white dark:bg-[#6FFBBE] dark:text-[#04231F]'

/** The pale blue the matching screen's trust footer is drawn on. */
export const TRUST_FOOT =
    'rounded-xl bg-[#E1E8FD] dark:bg-[#16233F]'

/** The mint used on the selected chip and the "AI BEST MATCH" badge. */
export const MINT = 'text-[#6FFBBE]'

/** The `aria-pressed`/selected pill on the booking screen's date and slot rows. */
export const PILL_ON =
    'bg-[#0F5B55] text-white dark:bg-[#6FFBBE] dark:text-[#04231F]'

export const PILL_OFF =
    'bg-white text-[#334155] ring-1 ring-[#E2E8F0] hover:bg-[#F8FAFC] dark:bg-[#111A2B] dark:text-[#CBD5E1] dark:ring-[#243350] dark:hover:bg-[#16213A]'
