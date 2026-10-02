import { existsSync, readdirSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
    BookingRow,
    CustomerBookingsScreen,
    hrefFor,
} from '../src/react/customer/booking-list'
import { PILL_OFF, PILL_ON } from '../src/react/customer/tokens'
import { BOOKABLE_BOOKING_ID, BOOKINGS } from './fixtures/bookings'
import { BOOKING_QUOTE } from './fixtures/booking-quote'

/**
 * The bookings list, and the one decision each row in it makes.
 *
 * ## Why this file exists separately from `customer-screens.test.tsx`
 *
 * Because the honest claims record walks the payloads, so this screen's strings
 * have to be in a fixture rather than in a controller — but that record is about
 * *what the screens say*, and this screen's whole reason for being careful is
 * *what its rows do*. A row that is an anchor when it should be a plain `<li>`
 * renders the same text, the same count and the same price; only the tag differs.
 *
 * So the flag-to-affordance pairing is asserted directly, on the exported
 * function and on the markup, rather than inferred from a count.
 */
describe("a row's destination", () => {
    it('comes from `has_quote`, and from nothing else on the booking', () => {
        /*
         * Every other field on the fixture deliberately disagrees with
         * `has_quote` where it could: `BK-1988` is a real booking with a real
         * technician, a real date and a real price, and none of that changes its
         * affordance. Asserted as a table so a screen that started deciding on
         * `status`, or on `id`, or on "is the second row" fails here by name.
         */
        expect(hrefFor(BOOKINGS.bookings[0])).toBe('/booking-details/')
        expect(hrefFor(BOOKINGS.bookings[1])).toBeNull()
    })

    it('is null for a booking the payload has no quote for', () => {
        const quoted = BOOKINGS.bookings[1]

        expect(hrefFor({ ...quoted, has_quote: true })).toBe('/booking-details/')
        expect(hrefFor({ ...quoted, status: 'in_progress' })).toBeNull()
    })
})

describe('a row', () => {
    it('is an anchor exactly where the payload says it can be opened', () => {
        /*
         * The assertion that the count cannot make. Two rows and two anchors is
         * the same "two anchors" as one row and no anchors only if the reader
         * stops at the number — so both rows are rendered on their own here and
         * each is asked the question directly.
         */
        const bookable = renderToStaticMarkup(
            <BookingRow booking={BOOKINGS.bookings[0]} />,
        )
        const closed = renderToStaticMarkup(
            <BookingRow booking={BOOKINGS.bookings[1]} />,
        )

        expect(bookable).toMatch(/^<li[^>]*><a href="\/booking-details\/"/)
        expect(closed).toMatch(/^<li[^>]*>/)
        expect(closed).not.toContain('<a')
    })

    it('prints the status the payload wrote, not the status the code holds', () => {
        /*
         * `status_label` beside `status`, and this is the assertion for the pair.
         * A screen printing `in_progress` fails; a screen printing the label after
         * stripping the underscore fails too, because the fixture's label is
         * "In progress" with a capital and stripping an underscore from
         * `in_progress` cannot produce one.
         */
        const html = renderToStaticMarkup(<BookingRow booking={BOOKINGS.bookings[0]} />)

        expect(html).toContain('In progress')
        expect(html).not.toContain('in_progress')
        expect(html).not.toContain('In Progress')
    })

    it('colours the live pill differently from the finished one', () => {
        /*
         * The tokens are imported rather than written out. This screen's decision
         * is *which* pill a row gets, not what colour a pill is, and a test that
         * asserted `bg-[#0F5B55]` would fail on a design change — telling a reader
         * a re-colour was a regression, which it is not. What has to hold is that
         * the two rows are distinguishable without reading the words.
         *
         * The `PILL_ON`/`PILL_OFF` classes are themselves asserted elsewhere, as
         * literal strings, by whatever test owns the palette.
         */
        const live = renderToStaticMarkup(<BookingRow booking={BOOKINGS.bookings[0]} />)
        const done = renderToStaticMarkup(<BookingRow booking={BOOKINGS.bookings[1]} />)

        expect(live).toContain(PILL_ON)
        expect(live).not.toContain(PILL_OFF)
        expect(done).toContain(PILL_OFF)
        expect(done).not.toContain(PILL_ON)
    })

    it('puts the timestamp in a `time` element with both halves of it', () => {
        /*
         * `<time dateTime>` carries the machine value and its text carries the
         * display one, and the screen shows the back end's choice rather than
         * inventing a date format. Both halves are asserted, because an element
         * carrying only the pretty one is a `date` nothing can read.
         */
        const [active] = BOOKINGS.bookings
        const html = renderToStaticMarkup(<BookingRow booking={active} />)

        expect(html).toContain(`<time dateTime="${active.scheduled_at}">`)
        expect(html).toContain(active.scheduled_on)
    })

    it('prints the price the payload sent, as a formatted figure', () => {
        expect(
            renderToStaticMarkup(<BookingRow booking={BOOKINGS.bookings[0]} />),
        ).toContain('₹450')
        expect(
            renderToStaticMarkup(<BookingRow booking={BOOKINGS.bookings[1]} />),
        ).toContain('₹1,200')
    })
})

describe('the list', () => {
    it('says so when there is nothing on it', () => {
        /*
         * Reachable rather than theoretical: the endpoint promises an array and
         * never a null, so "no bookings" is a `200` the screen has to render as
         * an answer. An empty `<ul>` under a heading reads as a broken page, so the
         * assertion is on the sentence rather than on the absence of `<li>`.
         */
        const html = renderToStaticMarkup(
            <CustomerBookingsScreen bookings={{ status: 'ready', data: { bookings: [] } }} />,
        )

        expect(html).toContain('No bookings yet')
        expect(html).not.toContain('<li')
    })

    it('names the count it was given, and not one it invented', () => {
        const html = renderToStaticMarkup(
            <CustomerBookingsScreen bookings={{ status: 'ready', data: BOOKINGS }} />,
        )

        expect(html).toContain('2 Bookings')
        expect(html.match(/<li/g)).toHaveLength(2)
    })

    it('does not print a count it does not have', () => {
        /*
         * The loading half, and it is the same rule the matching screen's query
         * heading follows. A placeholder reading "2" would be a screen claiming it
         * had found two bookings before it asked, and the number is the one thing
         * in the header that cannot be known from the design.
         */
        const html = renderToStaticMarkup(
            <CustomerBookingsScreen
                bookings={{ status: 'loading', data: null, refreshing: false }}
            />,
        )

        expect(html).toContain('>Bookings<')
        expect(html).not.toContain('Bookings</h1>2')
        expect(html).not.toMatch(/\d+ Bookings/)
    })
})

describe('the page this list links to', () => {
    it('is the page the booking-details screen was built for', () => {
        /*
         * ## The two copies of `BK-2041`, and why this test is the only thing
         * holding them together
         *
         * `apps/user/app/booking-details/page.tsx` names the booking to fetch and
         * `hrefFor` names where to go. They cannot be one constant: the page is in
         * an application and this is a component, and `FrontEndApplicationsTest`
         * fails a component reaching into `apps/` because that is the direction a
         * copied screen travels.
         *
         * So the agreement is asserted instead of shared. **A static export has no
         * per-booking route**, which is the constraint that created the second
         * copy; if somebody ever adds `app/booking-details/[id]/`, this assertion
         * is the one that has to change, and it should be the one that notices —
         * not a person noticing a link that opens the wrong visit.
         *
         * Asserted against the quote fixture rather than the controller, so the
         * pair is checked where both halves are visible: the row that links is
         * `BK-2041`, and the quote that page would fetch is for `BK-2041`.
         */
        const bookable = BOOKINGS.bookings.find(
            (booking) => booking.id === BOOKABLE_BOOKING_ID,
        )

        expect(bookable).toBeDefined()
        expect(bookable?.has_quote).toBe(true)
        expect(BOOKING_QUOTE.booking_id).toBe(bookable?.id)
    })

    it('is a page that exists in the export', () => {
        /*
         * The other half: `/booking-details/` is one of the four literal booking
         * paths, and a link to a route nobody built is the failure mode of a
         * generated navigation. Asserted by reading the application's own route
         * tree, so deleting the page fails here rather than in a browser.
         */
        /*
         * The trailing slash is load-bearing. A `URL` without one is a *file*, so
         * `new URL('bookings/page.tsx', app)` resolves beside it — at
         * `apps/user/bookings/page.tsx`, which does not exist — rather than
         * inside it. The failure is a plain `false` with no explanation, which is
         * why it is written out here rather than left to be rediscovered.
         */
        const app = new URL('../../../apps/user/app/', import.meta.url)

        expect(existsSync(new URL('booking-details/page.tsx', app))).toBe(true)
        expect(existsSync(new URL('bookings/page.tsx', app))).toBe(true)

        /*
         * Both pages are named as directories rather than imported. A page is a
         * `'use client'` module with a JSX body and a default export, so importing
         * one would pull React and the application's own loader into this
         * package's module graph — and `readdirSync` is here for the other half
         * anyway: the question is whether a route exists, not what it renders.
         */
        expect(readdirSync(app).sort()).toContain('bookings')
    })
})

/**
 * Which payload fields the screen actually uses.
 *
 * Three fields were added to this payload at the same time as this screen —
 * `status_label`, `scheduled_on` and `has_quote` — and each one exists so that a
 * decision the back end is better placed to make is not made here. The test below
 * is the half of that which a type checker cannot do: **a field added to the
 * payload that no screen reads is drift in the other direction**, and it type-checks
 * perfectly.
 *
 * The schema's own refusal of a booking missing a field is asserted in
 * `packages/api-client/test/operations.test.ts`, where `listBookings` runs against
 * a stubbed response. That belongs there because it needs the HTTP layer; this is
 * about which fields reach the markup.
 */
describe('every field the payload carries', () => {
    it('reaches the markup, or is named below as one that cannot', () => {
        /*
         * Distinctive values rather than the fixture's own, so "this field is
         * printed" cannot be satisfied by some *other* field happening to contain
         * the text — which is the failure a fixture-based assertion has: strip the
         * date out of a row and `scheduled_on` still appears, because
         * `scheduled_at` carries a substring of it.
         */
        const html = renderToStaticMarkup(
            <BookingRow
                booking={{
                    id: 'BK-SENTINEL',
                    service: 'Sentinel Service',
                    status: 'sentinel_status',
                    status_label: 'Sentinel Label',
                    worker_name: 'Sentinel Worker',
                    scheduled_at: '2999-01-01T00:00:00+00:00',
                    scheduled_on: 'Sentinel Day',
                    price: 4321,
                    currency: 'INR',
                    has_quote: true,
                }}
            />,
        )

        // Printed as text.
        expect(html).toContain('Sentinel Service')
        expect(html).toContain('Sentinel Label')
        expect(html).toContain('Sentinel Worker')
        expect(html).toContain('Sentinel Day')

        // Present but not printed: the machine timestamp in the `datetime`
        // attribute, and the price through `formatMoney`, which is where
        // `currency` is finally used — the symbol is derived from it, so an
        // unknown code would render a different glyph rather than a missing one.
        //
        // **`dateTime` in camel case**, because React emits the attribute under
        // the name JSX spells it and lowercases nothing here; HTML would be
        // case-insensitive, but `renderToStaticMarkup` is not.
        expect(html).toContain('<time dateTime="2999-01-01T00:00:00+00:00">')
        expect(html).toContain('₹4,321')

        /*
         * The three that cannot be found in the text, each for a stated reason.
         *
         * `id` is the React key and the anchor's business, and it must **not**
         * print: a booking identifier on screen is an internal value the person
         * has no use for, and `MockedCustomerEndpointsTest` asserts the screens
         * leave identifiers out.
         *
         * `status` never prints — `status_label` does, which is the whole reason
         * both are in the payload. It is asserted by effect instead: an unknown
         * status renders the off-pill class, which the sentinel proves by *not*
         * rendering the on-pill one.
         *
         * `has_quote` decides the tag, and that is asserted by
         * `is an anchor exactly where the payload says it can be opened`, which
         * is a stronger statement than counting anchors.
         */
        expect(html).not.toContain('BK-SENTINEL')
        expect(html).not.toContain('sentinel_status')

        // And the effect that matters for it: an unknown status is *not* treated
        // as a live one. A screen defaulting the pill to "live" would render every
        // status the back end has not thought about as in progress.
        expect(html).not.toContain(PILL_ON)
    })

    it('carries exactly the fields the screen was written against', () => {
        /*
         * The drift alarm, and it is deliberately a hand-written list rather than
         * a snapshot of `Object.keys`. A snapshot records whatever is there today,
         * so it cannot fail; this list states what the row *needs*, and a payload
         * that grows a field nobody reads fails here and gets a decision rather
         * than sitting in the contract forever.
         */
        const keys = Object.keys(BOOKINGS.bookings[0]).sort()

        expect(keys).toEqual([
            'currency',
            'has_quote',
            'id',
            'price',
            'scheduled_at',
            'scheduled_on',
            'service',
            'status',
            'status_label',
            'worker_name',
        ])
    })
})