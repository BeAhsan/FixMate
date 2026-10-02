import type { MoneyRange } from '@fixmate/api-client'

/**
 * Every rupee the customer's screens print, formatted in one place.
 *
 * ## Why this exists
 *
 * Four designed screens draw prices and three of them are now endpoint-driven, so
 * four renderers would each have had a symbol and a separator in them. Three
 * numbers in one payload would then be formatted three ways, and the first screen
 * that got it wrong would look like a deliberate price rather than a typo.
 *
 * **The payloads carry no symbol and no separators.** `price_from` is `149`,
 * `estimated_cost.min` is `350`, an estimate line's `amount` is `250`, and
 * `currency` is `INR` beside them. That is the back end's decision and it is the
 * right one: a pre-formatted string in a payload cannot be formatted again, and
 * a server that chose the grouping for four front ends would choose it for the
 * wrong three.
 *
 * ## `en-IN` is not decoration
 *
 * Indian digit grouping is `1,20,000` rather than `120,000`, because the third
 * digit from the right is not the thousands digit. `toLocaleString('en-IN')` is
 * the only call here that knows this, and it is why the locale is passed
 * explicitly rather than left to the machine's default — a screen built in a
 * region that groups differently would otherwise print Indian prices in the
 * wrong groups, which is the kind of error nobody reports and everybody notices.
 */

/** Currency codes the mocked responses send, as the symbol a screen prints. */
const SYMBOLS: Record<string, string> = {
    INR: '₹',
}

/**
 * The symbol for a currency code.
 *
 * **An unknown code prints itself followed by a space** rather than nothing: a
 * price with no symbol reads as a bare number, which is indistinguishable from a
 * count, and a price showing `USD 450` is reportable in a way a price showing
 * `450` is not. The screen does not have to decide which of those two failures
 * it would rather have.
 */
export function currencySymbol(currency: string): string {
    return SYMBOLS[currency] ?? `${currency} `
}

/** One amount: `₹149`, `₹1,20,000`. */
export function formatMoney(amount: number, currency: string): string {
    return `${currencySymbol(currency)}${amount.toLocaleString('en-IN')}`
}

/** A lower bound, as the category cards print it: `From ₹149`. */
export function formatMoneyFrom(amount: number, currency: string): string {
    return `From ${formatMoney(amount, currency)}`
}

/**
 * A range, as the diagnosis and matching screens print it: `₹350 – ₹500`.
 *
 * **Both ends are printed, even when they are equal.** A range whose ends match
 * collapses to `₹350 – ₹350` here, and the screen does not try to be clever about
 * it: a caller receiving `min === max` is told the range is a point rather than
 * being shown a different string from the one that produced it, and the collapse
 * is the kind of special case that disagrees with its own formatting the moment
 * somebody edits it.
 */
export function formatMoneyRange({ min, max, currency }: MoneyRange): string {
    return `${formatMoney(min, currency)} – ${formatMoney(max, currency)}`
}

/**
 * A distance, as the matching screen prints it: `1.2 km`.
 *
 * `toFixed(1)` rather than a bare number so a half-kilometre and a whole one do
 * not print differently in width, which matters in a three-card stack where the
 * figures sit in a column. The precision is this screen's business and not the
 * payload's: the back end sends a number and deliberately no decimal places,
 * because how precisely a distance is worth showing is a rendering decision four
 * front ends should each make for themselves.
 */
export function formatDistance(kilometres: number): string {
    return `${kilometres.toFixed(1)} km`
}

/**
 * A rating, as `4.8`.
 *
 * `toFixed(1)` for the same reason as the distance, and for one more: the design
 * prints one decimal place, so a payload of `4` printing as `4` would be a
 * different string from the one a screen with `4.0` in it produces.
 */
export function formatRating(rating: number): string {
    return rating.toFixed(1)
}

/** A count, as `1,20,000`. */
export function formatCount(count: number): string {
    return count.toLocaleString('en-IN')
}
