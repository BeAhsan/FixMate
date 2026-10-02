import { describe, expect, it } from 'vitest'
import {
    currencySymbol,
    formatCount,
    formatDistance,
    formatMoney,
    formatMoneyFrom,
    formatMoneyRange,
    formatRating,
} from '../src/react/customer/money'

/**
 * The seven formatters behind every figure a customer reads.
 *
 * ## Why this file exists rather than being folded into a screen's tests
 *
 * `UNSUPPORTED_CUSTOMER_CLAIMS` is a list of composed strings — `From ₹149`,
 * `₹350 – ₹500`, `1.2 km`, `120 jobs` — and none of them is stored anywhere. Each
 * is assembled at render time by one of these seven functions from an integer and
 * a currency code. That makes the claims record **unverifiable at its own level**:
 * the record says `₹350 – ₹500` is on a screen, and whether it is depends on
 * `formatMoneyRange` doing the right thing with `350` and `500`.
 *
 * So these assertions are the floor under every figure in that record. A
 * `formatMoney` that stopped grouping, or one that reached for the machine's
 * default locale, would leave the record entirely green while every price on
 * every screen printed in the wrong groups.
 *
 * ## What has actually been broken here
 *
 * Five mutations, each applied and each reverted:
 *
 * - `toLocaleString('en-IN')` → `toLocaleString()` — two failures. This is the
 *   change that matters and the one every reviewer waves through, because
 *   dropping an argument reads as removing a default. **It is also
 *   locale-dependent**: it fails on a machine that groups as `en-US` and passes
 *   silently on one set to a region that groups the way India does. That is why
 *   the assertions below use a lakh rather than the four-figure numbers the mocked
 *   roster carries — every real price here is under one, so a dropped locale
 *   argument would be invisible to every other test in the package.
 * - `` `${currency} ` `` → `` `${currency}` `` — three failures, and the only way
 *   to see any of them is this file: every payload says `INR`, so no screen ever
 *   takes the unknown-currency branch.
 * - `toFixed(1)` dropped from `formatDistance` — two.
 * - Both ends of a range collapsed to one — two.
 * - `toFixed(1)` dropped from `formatRating` — one.
 */
describe('the currency symbol', () => {
    it('prints the rupee sign for INR', () => {
        expect(currencySymbol('INR')).toBe('₹')
    })

    it('prints an unknown code with a space, so the figure is not a bare number', () => {
        /*
         * **The trailing space is the assertion, and it is invisible in the other
         * direction.** `USD450` reads as a number with a typo in front of it;
         * `USD 450` reads as a price in the wrong currency, which is a reportable
         * bug. Deleting the space fails this, and nothing else in the package would
         * notice — every mocked payload says `INR`, so the unknown branch is never
         * taken by any screen test.
         */
        expect(currencySymbol('USD')).toBe('USD ')
        expect(currencySymbol('GBP')).toBe('GBP ')
    })

    it('prefers the table over the fallback for a code that has a symbol', () => {
        // `SYMBOLS` is keyed on the exact code, so this is really an assertion
        // that the lookup is not a prefix match — a `code.startsWith` bug would
        // turn `INR` into something and `IN` into nothing.
        expect(currencySymbol('IN')).toBe('IN ')
        expect(currencySymbol('INR')).not.toBe('IN ')
    })
})

describe('one amount', () => {
    it('prints the symbol and the figure', () => {
        expect(formatMoney(149, 'INR')).toBe('₹149')
        expect(formatMoney(450, 'INR')).toBe('₹450')
        expect(formatMoney(0, 'INR')).toBe('₹0')
    })

    it('groups the way India does, which is not the way the default does', () => {
        /*
         * Four numbers, chosen because they are the ones where the two locales
         * actually differ. `1000` and `12000` agree, so asserting only those
         * would let a dropped locale argument pass — the difference first appears
         * at a lakh, and every price on these screens is under one.
         */
        expect(formatMoney(100000, 'INR')).toBe('₹1,00,000')
        expect(formatMoney(120000, 'INR')).toBe('₹1,20,000')
        expect(formatMoney(1200000, 'INR')).toBe('₹12,00,000')

        // And what the wrong locale produces, written out so the difference is
        // legible in a failure message rather than something to compute.
        expect(formatMoney(120000, 'INR')).not.toBe('₹120,000')
    })

    it('carries the code through rather than assuming rupees', () => {
        // The `From ₹` and `₹` claims in the record are only true while every
        // payload says INR. A payload that said otherwise has to show its own
        // symbol, or the claim record is silently wrong about the screen.
        expect(formatMoney(450, 'USD')).toBe('USD 450')
    })
})

describe('a lower bound', () => {
    it('says that it is a floor, in words the payload does not contain', () => {
        /*
         * "From" is the claim. `price_from` is a number and the screen turns it
         * into a promise about a floor — which is why `'From ₹149'` and `'₹149'`
         * are two entries in `UNSUPPORTED_CUSTOMER_CLAIMS` rather than one. The
         * word has to come from here, because the payload deliberately carries no
         * pre-formatted strings.
         */
        expect(formatMoneyFrom(149, 'INR')).toBe('From ₹149')
        expect(formatMoneyFrom(149, 'INR')).toContain('From ')
    })
})

describe('a range', () => {
    it('prints both ends with a symbol each', () => {
        expect(
            formatMoneyRange({ min: 350, max: 500, currency: 'INR' }),
        ).toBe('₹350 – ₹500')
    })

    it('prints both ends even when they are the same', () => {
        /*
         * The docblock argues for this, so the assertion is here rather than in
         * the module. A collapse to `₹350` would read as a price and lose the
         * fact that the payload described a range — and, worse, would be the
         * kind of special case that starts disagreeing with the range above it
         * the moment somebody edits either one.
         *
         * Note the en dash with spaces, not a hyphen: `₹350-₹500` is what a
         * careless edit produces, and it is one character from correct.
         */
        expect(
            formatMoneyRange({ min: 350, max: 350, currency: 'INR' }),
        ).toBe('₹350 – ₹350')
        expect(formatMoneyRange({ min: 350, max: 500, currency: 'INR' })).toContain(
            ' – ',
        )
        expect(formatMoneyRange({ min: 350, max: 500, currency: 'INR' })).not.toContain(
            '-',
        )
    })
})

describe('a distance', () => {
    it('holds one decimal place, so figures in a column line up', () => {
        /*
         * `2` → `2.0 km` is the assertion that carries the `toFixed(1)`. A whole
         * number printing as `2 km` next to `1.2 km` is a column of differing
         * widths, and the design puts these three on the same card.
         */
        expect(formatDistance(1.2)).toBe('1.2 km')
        expect(formatDistance(2.8)).toBe('2.8 km')
        expect(formatDistance(2)).toBe('2.0 km')
        expect(formatDistance(0)).toBe('0.0 km')
    })

    it('rounds rather than truncating, and does not carry extra precision', () => {
        // A payload sending `1.25` is not something the controller does, and this
        // is here to say what would happen if it did — `toFixed` rounds, so the
        // screen never prints a digit the payload did not intend to be meaningful.
        expect(formatDistance(1.25)).toBe('1.3 km')
        expect(formatDistance(1.234)).toBe('1.2 km')
    })

    it('says kilometres in words, because the unit is the screen choice', () => {
        // `distance_km` is the field name. The screen chose to print `km`, and
        // that choice is why the claims record holds `'1.2 km'` rather than `'1.2'`.
        expect(formatDistance(1.2)).toContain('km')
    })
})

describe('a rating', () => {
    it('holds one decimal place, including for a whole number', () => {
        /*
         * `5` → `'5.0'` for the same reason as the distance, and it is also a
         * claim: the design shows one decimal, so a payload of `4` must not print
         * differently from a payload of `4.0`. Two strings for one number is what
         * the `toFixed` exists to prevent.
         */
        expect(formatRating(4.8)).toBe('4.8')
        expect(formatRating(4.6)).toBe('4.6')
        expect(formatRating(4)).toBe('4.0')
        expect(formatRating(5)).toBe('5.0')
        expect(formatRating(0)).toBe('0.0')
    })

    it('keeps the trailing zero a whole number was written with', () => {
        // `4.0` and `4` are the same figure and must print the same string. This
        // is the assertion a `Number(rating.toFixed(1))` cleanup would break.
        expect(formatRating(4.0)).toBe(formatRating(4))
    })
})

describe('a count', () => {
    it('groups the way India does', () => {
        /*
         * `completed_jobs` on a technician, printed as `120 jobs` beside a rating.
         * The three figures the mocked roster actually sends are all under a
         * thousand, where the two locales agree — so the interesting numbers here
         * are ones no current payload carries, and that is the point: the
         * grouping rule has to hold for the technician with four figures, and a
         * suite that only ever asserted `120` would not notice it had been
         * dropped.
         */
        expect(formatCount(120)).toBe('120')
        expect(formatCount(240)).toBe('240')
        expect(formatCount(1200)).toBe('1,200')
        expect(formatCount(120000)).toBe('1,20,000')
        expect(formatCount(120000)).not.toBe('120,000')
    })

    it('prints no currency and no unit, because the screen adds those', () => {
        // The unit `jobs` is the screen's, beside a rating and a separator. A
        // formatter that appended it would make the two figures on that line read
        // as one value.
        expect(formatCount(120)).toBe('120')
    })
})