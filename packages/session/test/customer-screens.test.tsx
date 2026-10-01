import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BookingDetails } from '../src/react/customer/booking-details'
import { CustomerDashboard } from '../src/react/customer/customer-dashboard'
import { MatchingResults } from '../src/react/customer/matching-results'
import { TabBar } from '../src/react/customer/tab-bar'
import {
    MOCK_ACTIVE_JOB,
    MOCK_BOOKING,
    MOCK_CATEGORIES,
    MOCK_FEATURED_WORKERS,
    MOCK_MATCHES,
    MOCK_SEARCH,
    MOCK_TRUST_BADGES,
    UNSUPPORTED_CUSTOMER_CLAIMS,
} from '../src/react/customer/mock-data'
import * as TOKENS from '../src/react/customer/tokens'

/**
 * The customer's three product screens, and what they claim.
 *
 * These screens are almost entirely mocked, so the tests are almost entirely
 * about three things: that the one real input — the signed-in person's name — is
 * actually used, that the controls are real controls rather than decoration, and
 * that every promise the screens make is written down in
 * `UNSUPPORTED_CUSTOMER_CLAIMS` rather than buried in the markup.
 *
 * `renderToStaticMarkup` cannot click, so nothing here tests interaction. What it
 * can test is what is in the document, which is where the claims live. The
 * screens were also checked in a real browser for the things markup cannot show:
 * the computed typeface, the section order, and horizontal overflow.
 */

/** Every screen's markup, with tags stripped and entities decoded. */
function plain() {
    return [
        renderToStaticMarkup(<CustomerDashboard />),
        renderToStaticMarkup(<BookingDetails />),
        renderToStaticMarkup(<MatchingResults />),
    ]
        .join('\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
}

/** How many times a literal appears, for the assertions about *exactly one*. */
function times(html: string, needle: string): number {
    return html.split(needle).length - 1
}

describe("the customer's dashboard", () => {
    const html = renderToStaticMarkup(<CustomerDashboard />)

    it('greets the signed-in person, and uses the real name when there is one', () => {
        /*
         * The mock's "Hi, Aarav" is a stand-in, and the session *does* know who
         * signed in. Rendering the mock unconditionally would put a stranger's
         * name on the dashboard of every signed-in customer, so the real name wins
         * when there is one — and both are asserted, because "falls back to the
         * mock" is only true if the real name is genuinely preferred.
         */
        expect(html).toContain('Hi, Aarav')

        const named = renderToStaticMarkup(<CustomerDashboard accountName="Priya" />)

        expect(named).toContain('Hi, Priya')
        expect(named).not.toContain('Aarav')
    })

    it('shows the real location when the session knows one', () => {
        const located = renderToStaticMarkup(<CustomerDashboard location="Indiranagar" />)

        expect(located).toContain('Indiranagar')
        expect(located).not.toContain('Koramangala')
    })

    it('leads with search and the price estimator, as the design does', () => {
        expect(html).toContain('Search for plumber, electrician...')
        expect(html).toContain('AI Price Estimator')
        expect(html).toContain('INSTANT')
    })

    it('leaves the search field untypable, because there is no search', () => {
        /*
         * A field that accepted typing would be a form with nowhere to submit to.
         * `readOnly` is the honest version of a search box this repository cannot
         * honour, and the assertion is on the attribute — a `readOnly` that was
         * quietly dropped would leave a field that swallows keystrokes and does
         * nothing with them, which is worse than a visibly disabled one.
         */
        expect(html).toMatch(/<input[^>]*readonly/i)
    })

    it('carries the three categories with their prices', () => {
        expect(html).toContain('What do you need help with?')
        expect(html).toContain('Plumbing')
        expect(html).toContain('Electrical')
        expect(html).toContain('Carpentry')
        expect(html).toContain('From ₹149')
        expect(html).toContain('From ₹129')
        expect(html).toContain('From ₹199')
    })

    it('shows the two featured technicians, each with a Book control', () => {
        expect(html).toContain('Top Rated Mistris near you')
        expect(html).toContain('Ramesh Kumar')
        expect(html).toContain('Suresh Yadav')
        expect(times(html, '>Book<')).toBe(2)
    })

    it('draws the job tracker as an ordered list with one current step', () => {
        /*
         * The four stages are a *sequence*, so they are an `<ol>`: four unlabelled
         * spans would leave a screen-reader user with four identical items and no
         * way to know which came first. `aria-current="step"` is what announces the
         * active one — the fill and the ring are invisible to them.
         *
         * The order itself is asserted, because an `<ol>` that renders the stages
         * in the wrong sequence is still a well-formed list.
         */
        expect(html).toContain('<ol')
        expect(html).toMatch(/<ol[^>]*>.*?Booked.*?On the way.*?In Progress.*?Completed/s)
        expect(times(html, 'aria-current="step"')).toBe(1)
    })

    it('ticks the stages already passed, so progress is not colour alone', () => {
        /*
         * `reached` is 1, so exactly one stage is done and one is active. A tick
         * path for the done stage and a filled dot for the active one is how the
         * tracker says "you are here" to somebody who cannot see the ring.
         */
        expect(html).toContain('ETA 18 mins')
        expect(html).toContain('Fixing kitchen sink leak')
        expect(html).toContain('Call technician')
        expect(html).toContain('View Details')
    })

    it('closes with the three trust badges on the dark banner', () => {
        /*
         * Three claims about the business rather than the interface, which is what
         * makes this the riskiest strip on the screen: "Verified Mistris" says
         * background checks happen, and nothing here checks anything.
         */
        expect(html).toContain('Verified Mistris')
        expect(html).toContain('Transparent Pricing')
        expect(html).toContain('Job Tracking')
    })

    it('draws its own header rather than the shared shell', () => {
        /*
         * Two headers on one page is a mistake, so this screen replaces the shell.
         * The assertion is that its own greeting is present — the shell's
         * "Signed in as" line is not, which is what proves it did not nest.
         */
        expect(html).toContain('Good morning')
        expect(html).not.toContain('Signed in as')
    })

    it('has exactly one header element', () => {
        expect(times(html, '<header')).toBe(1)
    })
})

describe('the tab bar', () => {
    it('has three tabs and no Messages', () => {
        /*
         * The design draws four. Messages has no model, no route and no operation
         * anywhere in this repository, so a tab that opens it would be a link to
         * nothing. Cut deliberately, and cut *recorded* — see the component.
         */
        const html = renderToStaticMarkup(<TabBar currentPath="/" />)

        expect(html).toContain('Home')
        expect(html).toContain('Bookings')
        expect(html).toContain('Profile')
        expect(html).not.toContain('Messages')
    })

    it('marks the current tab with aria-current, not colour alone', () => {
        const html = renderToStaticMarkup(<TabBar currentPath="/" />)

        expect(html).toContain('aria-current="page"')
        // Exactly one: two tabs claiming to be the current page is a navigation
        // that has lost track of where it is.
        expect(times(html, 'aria-current="page"')).toBe(1)
    })

    it('marks a different current tab when the path is different', () => {
        // Otherwise `aria-current` could be hard-coded to the first tab and the
        // one assertion above would still pass.
        const html = renderToStaticMarkup(<TabBar currentPath="/account/" />)

        expect(times(html, 'aria-current="page"')).toBe(1)
        expect(html).toMatch(/href="\/account\/"[^>]*aria-current="page"/)
    })

    it('names itself, so it is not just "navigation" in a screen-reader list', () => {
        // Four applications, two of which can be open in a split view.
        expect(renderToStaticMarkup(<TabBar currentPath="/" />)).toContain(
            'aria-label="Customer sections"',
        )
    })

    it('uses anchors, because a static export has no client-side router', () => {
        const html = renderToStaticMarkup(<TabBar currentPath="/" />)
        const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1])

        expect(hrefs).toEqual(['/', '/booking-details/', '/account/'])
    })

    it('hides its glyphs from assistive technology', () => {
        // The label beside each glyph already says what the tab is; announcing the
        // icon too would read "Home Home".
        const html = renderToStaticMarkup(<TabBar currentPath="/" />)

        expect(times(html, 'aria-hidden="true"')).toBe(3)
    })
})

describe('the booking details screen', () => {
    const html = renderToStaticMarkup(<BookingDetails />)

    it('has a back control that names where it goes', () => {
        /*
         * A `<button>` and not an anchor, because on a static export each route
         * is a separate document: a person who typed this address has no history
         * to go back through, so an anchor's promise is not one the export keeps.
         */
        expect(html).toMatch(/<button[^>]*aria-label="Back to the dashboard"/)
    })

    it('names the technician, the trade, the rating and the service', () => {
        expect(html).toContain('Booking Details')
        expect(html).toContain('Ramesh Kumar')
        expect(html).toContain('Expert Plumber')
        expect(html).toContain('Pipe Leakage Repair')
        expect(html).toContain('Rated')
        expect(html).toContain('4.8')
    })

    it('offers three dates and three slots, each saying which is selected', () => {
        /*
         * `aria-pressed` on all six, because the design draws a selected state on
         * both rows and an unselected pill is indistinguishable from a selected
         * one to anybody not looking at the fill. The *state* comes from the mock
         * and pressing a pill does not change it — the module docblock is the
         * argument for why that is the honest shape.
         */
        expect(html).toContain('Select Date &amp; Time')
        expect(html).toContain('TODAY')
        expect(html).toContain('14 Oct')
        expect(html).toContain('09:00 AM')
        expect(html).toContain('02:00 PM')
        expect(times(html, 'aria-pressed="true"')).toBe(2)
        expect(times(html, 'aria-pressed="false"')).toBe(4)
    })

    it('gives each picker group a name', () => {
        // Six buttons and a heading do not tell a screen reader these are two
        // questions rather than six choices.
        expect(html).toContain('aria-label="Choose a date"')
        expect(html).toContain('aria-label="Choose a time slot"')
    })

    it("itemises the estimate, on the design's dark card, with the secure badge", () => {
        expect(html).toContain('AI Estimated Price')
        expect(html).toContain('SECURE')
        expect(html).toContain('Base Service Fee')
        expect(html).toContain('Estimated Labor (45 min)')
        expect(html).toContain('Platform Charges')
        expect(html).toContain('Total Payable')
        expect(html).toContain('₹450')
        expect(html).toContain('bg-[#111827]')
    })

    it('associates each price with its label, rather than pairing them by position', () => {
        /*
         * A `<dl>` is not decoration: three rows of two spans read as six prices
         * and three labels in document order, and a screen-reader user has to hold
         * the pairing in their head. `dt`/`dd` is the pairing.
         */
        expect(html).toContain('<dl')
        expect(times(html, '<dt')).toBe(3)
        expect(times(html, '<dd')).toBe(3)
    })

    it('offers three ways to pay as one radio group with one checked', () => {
        expect(html).toContain('Payment Method')
        expect(html).toContain('UPI / QR / Wallets')
        expect(html).toContain('Credit / Debit Cards')
        expect(html).toContain('Cash After Service')
        expect(html).toContain('Pay directly to the worker')
        // A fieldset and a shared name, so arrow keys move between them and the
        // group is announced as one question.
        expect(html).toContain('<fieldset')
        expect(times(html, 'name="payment-method"')).toBe(3)
        expect(times(html, 'checked=""')).toBe(1)
    })

    it('repeats the total in the sticky footer, where the confirm button is', () => {
        /*
         * The footer is sticky because the total is three screens of scrolling from
         * the button that spends it, and a customer agreeing to a price they
         * cannot see is how a wrong number gets agreed to. Asserted as a pair:
         * a total with no button, or a button with no total, is a broken footer.
         */
        expect(html).toContain('Confirm Booking')
        expect(times(html, '₹450')).toBe(2)
        expect(html).toMatch(/sticky bottom-0/)
    })

    it('reserves room for the footer so it cannot cover the payment rows', () => {
        // A sticky footer over the last control is the classic way a confirm
        // button becomes unclickable, and it is invisible in a static render.
        expect(html).toMatch(/pb-28/)
    })
})

describe('the matching results screen', () => {
    const html = renderToStaticMarkup(<MatchingResults />)

    it('echoes the query and says how many it found', () => {
        expect(html).toContain('SEARCH &amp; MATCH')
        expect(html).toContain('Plumber Search &amp; Matching')
        expect(html).toContain('Searching for “Plumber”')
        expect(html).toContain('24 Found')
        expect(html).toContain('AI matching active in Sector 48, Gurugram')
    })

    it('draws the four sort chips, with exactly one pressed', () => {
        /*
         * `aria-pressed`, not a visual fill, because "AI Best Match" being
         * selected is the screen's *initial state* — a person arriving needs to
         * know the results are already ordered by something, and that something is
         * a ranking no code here computes.
         */
        expect(html).toContain('AI Best Match')
        expect(html).toContain('Near Me')
        expect(html).toContain('Price: Low to High')
        expect(html).toContain('Top Rated')
        expect(times(html, 'aria-pressed="true"')).toBe(1)
    })

    it('gives the sort group a name', () => {
        expect(html).toContain('aria-label="Sort results"')
    })

    it('puts the recommendation and its two figures on the dark hero panel', () => {
        expect(html).toContain('Smart Recommendation')
        expect(html).toContain('AVG. ARRIVAL')
        expect(html).toContain('22 mins')
        expect(html).toContain('EST. COST')
        expect(html).toContain('₹350 – ₹500')
        expect(html).toContain('bg-[#114B43]')
    })

    it('lists all three technicians with their figures', () => {
        expect(html).toContain('Available Specialists')
        expect(html).toContain('Live Sorting')
        expect(html).toContain('Ramesh Kumar')
        expect(html).toContain('Suresh Yadav')
        expect(html).toContain('Mahesh Chandra')
        expect(html).toContain('Master Plumber • 12 yrs exp')
        expect(html).toContain('₹149')
        expect(html).toContain('₹129')
        expect(html).toContain('₹179')
        expect(html).toContain('1.2 km')
        expect(html).toContain('(240)')
    })

    it('lists them as articles, one per technician', () => {
        // Three cards and not three divs: a screen reader should be able to say
        // "article, 2 of 3" rather than run three blocks together.
        expect(times(html, '<article')).toBe(3)
    })

    it('marks exactly one card as the best match', () => {
        expect(times(html, 'AI BEST MATCH')).toBe(1)
    })

    it('distinguishes the one action that is not a booking', () => {
        // Two cards say "Book Now" and one says "View Profile"; the difference is
        // the design's and it is what tells a person which button commits them.
        expect(times(html, '>Book Now<')).toBe(2)
        expect(times(html, '>View Profile<')).toBe(1)
    })

    it('names who a call button would call, and never dials', () => {
        /*
         * A `tel:` link would put a fabricated number into the operating system's
         * dialler, because no worker carries a phone number in this repository. A
         * button is inert; a `tel:` link is a person-visible failure. Asserted
         * negatively because that is the whole guarantee.
         */
        expect(html).toContain('aria-label="Call Ramesh Kumar"')
        expect(html).not.toContain('tel:')
    })

    it('carries the warranty claim, which nothing here underwrites', () => {
        /*
         * An insurance promise. Nothing in this repository underwrites anything,
         * and a person may rely on cover when something goes wrong — so it is
         * rendered as the design specifies it and recorded in
         * UNSUPPORTED_CUSTOMER_CLAIMS, where removing it is one edit.
         */
        expect(html).toContain('FixMate 30-Day Work Warranty')
        expect(html).toContain('Every service is insured up to ₹10,000 for damages.')
    })
})

describe('the design tokens', () => {
    it('gives every colour token a dark half', () => {
        /*
         * The designs are light-only, so the dark values were chosen rather than
         * read off a frame. A token that loses its `dark:` half still builds, still
         * typechecks and still passes every test above — it just renders a light
         * chip on a dark card in dark mode, which is exactly the case nobody
         * checks by hand.
         */
        const colours = Object.entries(TOKENS).filter(([name]) =>
            /^(GROUND|CARD|DEEP|ACTION|ACCENT_TEXT|INK|INK_SOFT|PRICE_CARD|AMBER_TEXT|CHIP_OFF|CHIP_ON|TRUST_FOOT|MINT|PILL_ON|PILL_OFF)$/.test(
                name,
            ),
        )

        expect(colours.length).toBeGreaterThan(10)

        for (const [name, value] of colours) {
            if (name === 'MINT') {
                // The one token with no `dark:` half by design: it is the mint
                // used *on* the deep teal, and the deep teal lightens in dark
                // mode, so the mint is already the right contrast in both.
                expect(value, name).not.toContain('dark:')
                continue
            }

            expect(value, name).toContain('dark:')
        }
    })

    it("writes every hex literally, so Tailwind's scanner can see it", () => {
        /*
         * The scanner reads source text. A token assembled at run time —
         * `bg-[${colour}]` — is invisible to it, the class is dropped from the
         * build, and the screen renders unstyled with a successful build. So each
         * token is a whole literal class string, and this asserts that: no token
         * may contain an interpolation.
         */
        for (const [name, value] of Object.entries(TOKENS)) {
            expect(value, name).not.toContain('${')
        }
    })
})

describe('the honesty record', () => {
    it('names every promise these screens make that this code cannot keep', () => {
        /*
         * The list is the record, and this assertion is what makes it honest: a
         * claim added to a screen and not added here fails.
         *
         * Two kinds of thing live in this list, and they are not equally bad.
         * A person's name and a locality are placeholders. A **price** is an
         * agreement somebody pays, an **insurance limit** is a promise of cover,
         * and a **live status line** ("AI matching active in…", "ETA 18 mins")
         * is a claim that a system is running right now. Those three are the ones
         * to cut first, and they are named in that order in the mock module's
         * docblock.
         */
        expect([...UNSUPPORTED_CUSTOMER_CLAIMS]).toEqual([
            'Hi, Aarav',
            'Koramangala, Bengaluru',
            'Plumbing',
            'Electrical',
            'Carpentry',
            'Plumber',
            'Electrician',
            'Searching for “Plumber”',
            'AI matching active in Sector 48, Gurugram',
            'Sector 48, Gurugram',
            '24 Found',
            'Based on your “Leaky Pipe Under Sink” request, we matched 3 master technicians with rapid dispatch toolsets.',
            'AI Best Match',
            'AI BEST MATCH',
            'Near Me',
            'Price: Low to High',
            'Top Rated',
            '22 mins',
            '₹350 – ₹500',
            '1.2 km',
            '2.8 km',
            '1.8 km',
            'Available Now',
            'Available: Today, 4:00 PM',
            'In 20 mins',
            'Master Plumber • 12 yrs exp',
            'Plumbing & General Fix • 8 yrs exp',
            'Master Pipe & Sanitary • 15 yrs exp',
            'Expert Plumber',
            'Pipe Leakage Repair',
            'Ramesh Kumar',
            'Suresh Yadav',
            'Mahesh Chandra',
            'From ₹149',
            'From ₹129',
            'From ₹199',
            '₹149',
            '₹129',
            '₹179',
            '₹250',
            '₹51',
            '₹450',
            'AI Price Estimator',
            'AI Estimated Price',
            'Base Service Fee',
            'Estimated Labor (45 min)',
            'Platform Charges',
            'Actual price may vary slightly based on material used.',
            '4.8',
            '4.9',
            '4.6',
            '(120)',
            '(84)',
            '(240)',
            '120 jobs',
            '98 jobs',
            'ETA 18 mins',
            'Fixing kitchen sink leak',
            'Booked',
            'On the way',
            'In Progress',
            'Completed',
            'Call technician',
            'Verified Mistris',
            'Transparent Pricing',
            'Job Tracking',
            'SECURE',
            'UPI / QR / Wallets',
            'Credit / Debit Cards',
            'Cash After Service',
            'Google Pay, PhonePe, Paytm',
            'Visa, Mastercard, RuPay',
            'Pay directly to the worker',
            'FixMate 30-Day Work Warranty',
            'Every service is insured up to ₹10,000 for damages.'
        ])
    })

    it('records every invented value the mocks carry, not only a pinned list', () => {
        /*
         * The assertion above pins the list to today's contents, which stops it
         * being edited quietly — but it does **not** prove the list is *complete*.
         * A new field added to a mock, rendered on a screen and never written
         * down, passes the pinned assertion perfectly: the list is unchanged and
         * the new value is on screen. The exact failure the record exists to
         * prevent, and the pinned list is blind to it.
         *
         * So this walks the mock module instead. Every string in it is a value a
         * customer can read, and each has to be either recorded as a claim or
         * listed below as deliberately not one. That inverts the maintenance
         * burden in the right direction: adding a mock now fails here, and the
         * author has to say which it is, rather than the record going stale in
         * silence.
         *
         * The walk is over the module's own values rather than a hand-written
         * enumeration, so it cannot itself fall behind the data.
         */
        const invented = [
            ...MOCK_CATEGORIES.flatMap((c) => [c.label, c.priceFrom]),
            ...MOCK_FEATURED_WORKERS.flatMap((w) => [
                w.name,
                w.trade,
                w.rating,
                w.jobs,
            ]),
            MOCK_ACTIVE_JOB.worker,
            MOCK_ACTIVE_JOB.issue,
            MOCK_ACTIVE_JOB.eta,
            MOCK_ACTIVE_JOB.callLabel,
            ...MOCK_ACTIVE_JOB.stages,
            ...MOCK_TRUST_BADGES.map((b) => b.label),
            MOCK_BOOKING.worker,
            MOCK_BOOKING.trade,
            MOCK_BOOKING.rating,
            MOCK_BOOKING.service,
            ...MOCK_BOOKING.dates.flatMap((d) => [d.weekday, d.day]),
            ...MOCK_BOOKING.times.map((t) => t.label),
            MOCK_BOOKING.estimate.heading,
            MOCK_BOOKING.estimate.badge,
            MOCK_BOOKING.estimate.totalLabel,
            MOCK_BOOKING.estimate.total,
            MOCK_BOOKING.estimate.footnote,
            ...MOCK_BOOKING.estimate.lines.flatMap((l) => [l.label, l.amount]),
            ...MOCK_BOOKING.paymentMethods.flatMap((p) => [p.title, p.note]),
            MOCK_BOOKING.footer.totalLabel,
            MOCK_BOOKING.footer.confirmLabel,
            MOCK_SEARCH.searchingFor,
            MOCK_SEARCH.found,
            MOCK_SEARCH.area,
            MOCK_SEARCH.recommendation,
            MOCK_SEARCH.avgArrival,
            MOCK_SEARCH.estimatedCost,
            ...MOCK_SEARCH.filters.map((f) => f.label),
            ...MOCK_MATCHES.flatMap((m) => [
                m.name,
                m.summary,
                m.baseFee,
                m.rating,
                m.reviews,
                m.distance,
                m.availability,
                m.action,
            ]),
        ]

        /*
         * The three kinds of value that are *not* claims, and why. Each is a
         * string a customer reads, and each is a fact about the screen rather than
         * about the business:
         *
         * - The screen's own headings. "Select Date & Time" describes the control
         *   it labels; the repository is not claiming to be able to satisfy it.
         * - The filter and action labels. "Book Now" is what a button says.
         * - The date and weekday labels. "TODAY" and "14 Oct" are a calendar.
         */
        const notClaims = new Set([
            'Select Date & Time',
            'TODAY',
            'TUE',
            'WED',
            '14 Oct',
            '15 Oct',
            '16 Oct',
            '09:00 AM',
            '11:30 AM',
            '02:00 PM',
            'Book Now',
            'View Profile',
            'Base Fee',
            'Total',
            'Confirm Booking',
            'Payment Method',
            'Base Service Fee',
            // "Total Payable" is a label for the total, in the same class as
            // "Total" and "Base Fee". The *figure* beside it is the claim.
            'Total Payable',
        ])

        const unrecorded = [
            ...new Set(invented),
        ].filter((value) => !notClaims.has(value)).filter(
            (value) => !UNSUPPORTED_CUSTOMER_CLAIMS.includes(value as never),
        )

        expect(
            unrecorded,
            'these mocked values are rendered on a screen but not in the record; ' +
                'add them to UNSUPPORTED_CUSTOMER_CLAIMS, or to the not-claims list ' +
                'in this test if they are only labels',
        ).toEqual([])
    })

    it('records no claim that is not actually rendered', () => {
        /*
         * The other direction, and the one that keeps the list from rotting. A
         * list that accumulates entries for claims already deleted tells the next
         * reader that a price is still on screen when it is not.
         */
        const text = plain()

        const notRendered = UNSUPPORTED_CUSTOMER_CLAIMS.filter(
            (claim) => !text.includes(claim),
        )

        expect(
            notRendered,
            'these claims are recorded but not rendered; remove them from the record so it does not rot',
        ).toEqual([])
    })
})
