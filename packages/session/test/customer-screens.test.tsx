import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BookingDetailsScreen, weekdayLabel } from '../src/react/customer/booking-details'
import { CustomerBookingsScreen } from '../src/react/customer/booking-list'
import { CustomerDashboard, CustomerDashboardScreen, reachedStage } from '../src/react/customer/customer-dashboard'
import { MatchingResultsScreen, actionFor } from '../src/react/customer/matching-results'
import { TabBar } from '../src/react/customer/tab-bar'
import {
    MOCK_TRUST_BADGES,
    UNSUPPORTED_CUSTOMER_CLAIMS,
} from '../src/react/customer/mock-data'
import { BOOKING_QUOTE } from './fixtures/booking-quote'
import { BOOKINGS } from './fixtures/bookings'
import { DISCOVERY } from './fixtures/discovery'
import { MATCHING } from './fixtures/matching'
import { TRACKING } from './fixtures/tracking'
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

/**
 * Every screen's markup, with tags stripped and entities decoded.
 *
 * **Rendered from the presentational halves, given resolved payloads, and that
 * is not a convenience.** Each screen reads an endpoint, so the component a
 * person actually sees is in its *loading* state until an effect runs — and an
 * effect never runs under `renderToStaticMarkup`. Rendering `CustomerDashboard` or
 * `MatchingResults` directly would hand back a screen with none of its data on
 * it, which is how the honesty record below came to pass while covering nothing:
 * every claim on every screen lives behind a loader.
 *
 * So the three states are supplied rather than waited for, and the record walks
 * the fixtures the screens are given — which is only possible because the
 * payloads are copied into TypeScript. They used to be unreachable from here:
 * they lived in PHP, and a walk that could not see them was a walk that quietly
 * stopped covering the screen it was written for.
 */
function plain() {
    return [
        renderToStaticMarkup(
            <CustomerDashboardScreen
                pathname="/"
                tracking={{ status: 'ready', data: TRACKING, refreshing: false }}
                discovery={{ status: 'ready', data: DISCOVERY }}
            />,
        ),
        renderToStaticMarkup(
            <BookingDetailsScreen
                quote={{ status: 'ready', data: BOOKING_QUOTE }}
            />,
        ),
        renderToStaticMarkup(
            <MatchingResultsScreen
                matching={{ status: 'ready', data: MATCHING }}
            />,
        ),
        /*
         * The bookings list, and the fourth half here for the same reason as the
         * other three. **It was added last, and the walk failed while it was
         * missing** — its five strings were in the record and nowhere on a
         * rendered screen, so the other end of the walk reported claims that were
         * never drawn. That is the direction of the failure this file is least
         * protected against, and it took adding a screen to find.
         *
         * `plain()` is the single list of which screens the record covers, so
         * adding a fourth mocked screen means adding it here. The notice inventory
         * in `mocked-customer-screens.test.tsx` covers the other seven screens,
         * which carry no invented values of their own.
         */
        renderToStaticMarkup(
            <CustomerBookingsScreen bookings={{ status: 'ready', data: BOOKINGS }} />,
        ),
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

    /**
     * The same screen, given both of the responses it reads.
     *
     * **Two endpoints and therefore two independent waits**, and this dashboard
     * needs both: the job card reads `GET /users/tracking` and the categories and
     * the carousel read `GET /users/discovery`. Each is a loading state until it
     * arrives, and an effect never runs under `renderToStaticMarkup` — so
     * asserting any of the three sections from the screen would assert the
     * loading state and nothing else. That is why the presentational half takes
     * both states as props, and it is also the reason `html` above is now the test
     * for the *empty* screen rather than the populated one.
     *
     * It is called `readyHtml` rather than `trackingHtml` because that is what it
     * is: naming it after one endpoint was already misleading once there were two,
     * and the first assertion to be written against the job card would have been
     * the one to read `readyHtml.tracking` and wonder why.
     */
    const readyHtml = renderToStaticMarkup(
        <CustomerDashboardScreen
            pathname="/"
            tracking={{ status: 'ready', data: TRACKING, refreshing: false }}
            discovery={{ status: 'ready', data: DISCOVERY }}
        />,
    )

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
        /*
         * Asserted from the ready screen, because the categories read
         * `GET /users/discovery` and `html` is a dashboard whose loaders were never
         * supplied. That is not a pedantic choice about which string to grep: on
         * the unfed screen the heading renders and nothing under it does, so
         * asserting the heading here and the labels there would leave the test
         * passing with two of the three categories deleted.
         *
         * `From ₹` rather than `₹` because the prefix is what makes it a claim.
         * A bare "149" is a number on a card; "from ₹149" says the platform knows
         * its floor price, which is the thing no pricing table here supports.
         */
        expect(readyHtml).toContain('What do you need help with?')
        expect(readyHtml).toContain('Plumbing')
        expect(readyHtml).toContain('Electrical')
        expect(readyHtml).toContain('Carpentry')
        expect(readyHtml).toContain('From ₹149')
        expect(readyHtml).toContain('From ₹129')
        expect(readyHtml).toContain('From ₹199')
    })

    it('shows the two featured technicians, each with a Book control', () => {
        expect(readyHtml).toContain('Top Rated Mistris near you')
        expect(readyHtml).toContain('Ramesh Kumar')
        expect(readyHtml).toContain('Mahesh Chandra')
        expect(times(readyHtml, '>Book<')).toBe(2)
    })

    it('draws nothing in either section while discovery has not arrived', () => {
        /*
         * The inverse of the two above, and the one that catches a `ResourceBlock`
         * quietly rendering its children with `data` still null. Two sections, two
         * loading sentences, and none of the content either would have shown.
         *
         * `html` is the screen *without* loaders, which is the same shape as a
         * dashboard mid-flight — the loaders reject, and `renderToStaticMarkup`
         * never runs the effect that would turn the rejection into a failure
         * message. So this is genuinely the loading state rather than a stand-in
         * for it.
         */
        expect(html).toContain('What do you need help with?')
        expect(html).not.toContain('Plumbing')
        expect(html).not.toContain('>Book<')
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
         *
         * Rendered from the endpoint's state rather than from the screen, because
         * the screen's card is a loading state until an effect runs and effects do
         * not run here. The stage names are the ones `LiveTrackingController`
         * writes, so this is also the assertion that the card draws what arrived
         * rather than what it used to have hard-coded beside it.
         */
        expect(readyHtml).toContain('<ol')
        expect(
            readyHtml,
            'the tracker must draw the stages in the order the response gave them',
        ).toMatch(/<ol[^>]*>.*?Accepted.*?On the way.*?Arriving now.*?Work completed/s)
        expect(times(readyHtml, 'aria-current="step"')).toBe(1)
    })

    it('ticks the stages already passed, so progress is not colour alone', () => {
        /*
         * Two stages are completed in the fixture, so exactly two are ticked and
         * one is active. The tick path for a done stage and a filled dot for the
         * active one is how the tracker says "you are here" to somebody who cannot
         * see the ring — and it is the only carrier of the position that does not
         * rely on colour.
         */
        expect(times(readyHtml, 'M20 6L9 17l-5-5')).toBe(2)
        expect(readyHtml).toContain('aria-current="step"')
    })

    it('draws the job card from the response rather than from a local constant', () => {
        /*
         * Every one of these values is a literal in `LiveTrackingController`. The
         * point of the assertion is that none of them is a literal in this
         * package any more — so if somebody re-adds a mock beside the endpoint,
         * these four strings stop being the ones on screen and this fails.
         */
        expect(readyHtml).toContain('Imran Qureshi')
        expect(readyHtml).toContain('Kitchen sink leak')
        expect(readyHtml).toContain('ETA 5 min')
        expect(readyHtml).toContain('on the way')

        // And the technician's own name reaches the call button's accessible name,
        // so a screen reader is told whose number this would be. The button has no
        // number, and that is deliberate — see `CallTechnician`.
        expect(readyHtml).toContain('aria-label="Call Imran Qureshi"')
    })

    it('says the job card is still loading rather than drawing an empty one', () => {
        /*
         * The screen with no tracking state is a screen waiting. It must not look
         * like a card for a job that does not exist: no technician, no ETA and no
         * four completed stages standing in for absent data.
         */
        expect(html).toContain('Loading your active job…')
        expect(html).not.toContain('View Details')
        expect(html).not.toContain('<ol')
    })

    it('shows a failed job card in place, with the reason, rather than hiding it', () => {
        /*
         * **A card that disappears is a card nobody notices is missing.** The
         * request really did fail, and the failure sits in the middle of a screen
         * whose every other section rendered — so a silent removal would look
         * exactly like a dashboard for an account with no active job.
         *
         * Which is the dangerous direction here: "you have no active job" and "we
         * could not ask" are very different sentences, and only one of them is
         * true.
         */
        const failedHtml = renderToStaticMarkup(
            <CustomerDashboardScreen
                pathname="/"
                tracking={{
                    status: 'failed',
                    data: null,
                    message: 'The service is unreachable.',
                    refreshing: false,
                }}
                discovery={{ status: 'ready', data: DISCOVERY }}
            />,
        )

        expect(failedHtml).toContain('The service is unreachable.')

        // Still occupying its place on the screen, and still not pretending there
        // is a job behind it.
        expect(failedHtml).toContain('aria-label="Active job"')
        expect(failedHtml).not.toContain('View Details')
        expect(failedHtml).not.toContain('<ol')
        expect(failedHtml).not.toContain('Loading your active job…')
    })

    it('tells the three states apart in their markup', () => {
        /*
         * Loading, failed and ready are three different answers and two of them —
         * absent data and failed data — look identical if the markup is the same.
         * Asserted as a set so any two becoming indistinguishable fails.
         */
        const states = [
            renderToStaticMarkup(
                <CustomerDashboardScreen
                    pathname="/"
                    tracking={{ status: 'loading', data: null, refreshing: false }}
                    discovery={{ status: 'ready', data: DISCOVERY }}
                />,
            ),
            renderToStaticMarkup(
                <CustomerDashboardScreen
                    pathname="/"
                    tracking={{
                        status: 'failed',
                        data: null,
                        message: 'The service is unreachable.',
                        refreshing: false,
                    }}
                    discovery={{ status: 'ready', data: DISCOVERY }}
                />,
            ),
            readyHtml,
        ]

        for (const [index, state] of states.entries()) {
            for (const other of states.filter((_, i) => i !== index)) {
                expect(state).not.toBe(other)
            }
        }
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

describe('which stage the tracker is drawn at', () => {
    /*
     * `reachedStage` used to be `MOCK_ACTIVE_JOB.reached`: a number typed in
     * beside the four stage names it described. The two could disagree and nothing
     * would have noticed — moving it to 2 would draw the third marker active while
     * the comment above it still said the design draws step 2.
     *
     * Deriving it fixes that, and puts the two edge cases in reach: a job where
     * every stage is done, and a job where none is. Neither is reachable by
     * rendering one fixture, which is the whole reason this is a pure function
     * rather than an index computed inline above the markers.
     */
    const stage = (name: string, completed: boolean) => ({
        name,
        completed,
        timestamp: completed ? '2026-10-02T09:00:00+00:00' : null,
    })

    it('is the first stage the response has not completed', () => {
        expect(
            reachedStage([
                stage('Booked', true),
                stage('On the way', true),
                stage('In progress', false),
                stage('Completed', false),
            ]),
        ).toBe(2)
    })

    it('is the first stage when nothing has happened yet', () => {
        // 0, not -1. Returning -1 would index the array from the end and mark the
        // *last* stage active, which is the opposite of what an unstarted job means.
        expect(reachedStage([stage('Booked', false), stage('Completed', false)])).toBe(0)
    })

    it('is the end when every stage is complete, so a finished job reads finished', () => {
        // Without this the `findIndex` returns -1 and the last stage is drawn as
        // still approaching on a job that is already done — the most misleading
        // single-pixel error available on this screen.
        const stages = [stage('Booked', true), stage('On the way', true), stage('Completed', true)]

        expect(reachedStage(stages)).toBe(stages.length)
    })

    it('is zero for an empty timeline rather than throwing', () => {
        // A payload with no stages is not a crash: the list renders empty and the
        // marker arithmetic has nothing to do.
        expect(reachedStage([])).toBe(0)
    })

    it('ignores the timestamps, because the completion flags are the authority', () => {
        // The controller guarantees a completed stage always has a timestamp and
        // an incomplete one never does, so a payload that disagrees is not this
        // function's problem to resolve. Reading the flags means the drawn position
        // agrees with the one flag the screen also draws.
        const stages = [
            { ...stage('Booked', true), timestamp: null as string | null },
            stage('On the way', false),
        ]

        expect(reachedStage(stages)).toBe(1)
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

        /*
         * `/bookings/` and not `/booking-details/`. The middle tab has always
         * read **Bookings** — a plural — and it pointed at one booking for as long
         * as there was no list to point at. Asserting the exact array is what makes
         * that a checked fact rather than a remembered one: a tab that drifts back
         * to the detail page fails here by name.
         *
         * `/booking-details/` is absent because it was never a section. It is a
         * destination the list links to, and giving it a tab as well would put one
         * screen in two places in the navigation.
         */
        expect(hrefs).toEqual(['/', '/bookings/', '/account/'])
    })

    it('sends the Bookings tab to a list, not to one booking', () => {
        /*
         * The same failure as above, asserted on the *pairing* rather than on the
         * array, because an href can be right by accident: `/booking-details/` was
         * the middle tab's destination for as long as there was no list, and the
         * link was not broken — only the label was a lie. So each anchor is asked
         * which label it carries.
         *
         * Split on `<a ` rather than matched with one regex, because the label
         * sits behind the glyph inside the anchor and a regex spanning the tag
         * boundary would have to skip an unknown amount of SVG.
         */
        const html = renderToStaticMarkup(<TabBar currentPath="/" />)
        const anchors = html.split('<a ').slice(1)
        const labelOf = (label: string) =>
            anchors.find((anchor) => anchor.includes(`>${label}<`))?.match(/href="([^"]*)"/)?.[1]

        expect(labelOf('Home')).toBe('/')
        expect(labelOf('Bookings')).toBe('/bookings/')
        expect(labelOf('Profile')).toBe('/account/')
    })

    it('hides its glyphs from assistive technology', () => {
        // The label beside each glyph already says what the tab is; announcing the
        // icon too would read "Home Home".
        const html = renderToStaticMarkup(<TabBar currentPath="/" />)

        expect(times(html, 'aria-hidden="true"')).toBe(3)
    })
})

describe('the booking details screen', () => {
    /*
     * The screen, given a quote.
     *
     * `BookingDetailsScreen` and not `BookingDetails`, and the reason is the same
     * one as the dashboard's: this screen reads `GET /users/bookings/{booking}/quote`
     * through an effect, and an effect never runs under `renderToStaticMarkup`, so
     * the fetching half would render a header and a loading sentence with none of
     * the ten assertions below able to see anything.
     */
    const html = renderToStaticMarkup(
        <BookingDetailsScreen quote={{ status: 'ready', data: BOOKING_QUOTE }} />,
    )

    it('has a back control that names where it goes', () => {
        /*
         * A `<button>` and not an anchor, because on a static export each route
         * is a separate document: a person who typed this address has no history
         * to go back through, so an anchor's promise is not one the export keeps.
         */
        expect(html).toMatch(/<button[^>]*aria-label="Back to the dashboard"/)
    })

    it('names the technician, the trade, the rating and the service', () => {
        /*
         * `Imran Qureshi` and not one of the three browsable technicians, and that
         * is the payload being faithful rather than a fixture being tidy: `WK-118`
         * is the person on the booking and is deliberately absent from
         * `GET /users/matching`, because a customer should not be able to book
         * somebody who is already in a van on the way to them. The rating is
         * asserted because the roster gives two different people a 4.8, so its
         * absence would be invisible here and visible on the tracking screen.
         */
        expect(html).toContain('Booking Details')
        expect(html).toContain('Imran Qureshi')
        expect(html).toContain('Expert Plumber')
        expect(html).toContain('Pipe Leakage Repair')
        expect(html).toContain('Rated')
        expect(html).toContain('4.8')
    })

    it('says which of the three days is today, and only one', () => {
        /*
         * **"TODAY" is the word and `is_today` is the flag, and this is the test
         * that keeps them from being swapped.** The fixture's first day is
         * `2026-11-14` flagged `is_today`, and the other two are the following
         * days unflagged — so a screen printing `weekday` everywhere would render
         * "Sat", "Sun", "Mon" and this fails. A screen printing "TODAY" on the
         * *selected* day would pass today and lie on the other two.
         *
         * The design's frame said "TODAY / 14 Oct" and cannot be right on both
         * counts at once; `BookingQuoteController` resolves that with arithmetic
         * and sends the flag beside the weekday it computed. Asserted as a set so
         * a screen that printed the word on all three, or none, fails.
         */
        expect(weekdayLabel(BOOKING_QUOTE.dates[0])).toBe('TODAY')
        expect(weekdayLabel(BOOKING_QUOTE.dates[1])).toBe('Sun')
        expect(weekdayLabel(BOOKING_QUOTE.dates[2])).toBe('Mon')

        expect(times(html, '>TODAY<')).toBe(1)
        expect(html).not.toContain('>Sat<')
    })

    it('says nothing about a day it cannot vouch for', () => {
        /*
         * The flag is the only source, so an unflagged day whose *date* happens to
         * be today renders its weekday. The fixture's days are all in November and
         * this test runs whenever, which is the point: the screen cannot know what
         * today is, and must not pretend to.
         */
        const allFalse = renderToStaticMarkup(
            <BookingDetailsScreen
                quote={{
                    status: 'ready',
                    data: {
                        ...BOOKING_QUOTE,
                        dates: BOOKING_QUOTE.dates.map((day) => ({
                            ...day,
                            is_today: false,
                        })),
                    },
                }}
            />,
        )

        expect(allFalse).not.toContain('TODAY')
        expect(allFalse).toContain('>Sat<')
    })

    it('offers three dates and three slots, each saying which is selected', () => {
        /*
         * `aria-pressed` on all six, because the design draws a selected state on
         * both rows and an unselected pill is indistinguishable from a selected
         * one to anybody not looking at the fill.
         *
         * **Two pressed rather than one, and that is a change.** The state used to
         * come out of a mock beside the labels and pressing a pill snapped it back;
         * it is now local state, so each row has a default and pressing a pill
         * moves it. A row with nothing selected asks a person a question the
         * screen then answers by guessing, and `Confirm Booking` below it would be
         * confirming a date nobody picked. See the screen's docblock for why the
         * slots and the payment methods were treated the same way.
         *
         * The dates and times are the fixture's, not the design's — the controller
         * computes them from `now()`, so "14 Oct" is a literal no screen can rely
         * on and the pinned fixture is what makes this test stable.
         */
        expect(html).toContain('Select Date &amp; Time')
        expect(html).toContain('TODAY')
        expect(html).toContain('14 Nov')
        expect(html).toContain('9:00 AM')
        expect(html).toContain('2:00 PM')
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

    it('checks the method the response put first, not one named in the markup', () => {
        /*
         * The selected state is seeded from `payment_methods[0].id` rather than
         * from the string `"upi"`. A screen that hard-coded the identifier would
         * render identically today and leave nothing selected the day a method
         * were renamed — with the first row still carrying the ring and the
         * highlight that says "this is the default", so the failure looks like a
         * design rather than a bug. The fixture renames every method to prove the
         * seed follows the payload.
         */
        const renamed = renderToStaticMarkup(
            <BookingDetailsScreen
                quote={{
                    status: 'ready',
                    data: {
                        ...BOOKING_QUOTE,
                        payment_methods: BOOKING_QUOTE.payment_methods.map(
                            (method) => ({
                                ...method,
                                id: `${method.id}-renamed`,
                            }),
                        ),
                    },
                }}
            />,
        )

        expect(renamed).toContain('checked=""')
        expect(renamed).not.toContain('value="upi"')
        expect(renamed).toContain('value="upi-renamed"')
    })

    it('renders nothing checked when the response offers no way to pay', () => {
        /*
         * The empty case, and it is a truthful rendering rather than an error: "no
         * method available" is something the screen can say by having nothing
         * checked, and it is the shape a real endpoint returns when a booking
         * cannot be paid for online. The alternative — keeping a hard-coded
         * default — would put a selectable radio on a screen that has nothing to
         * select.
         */
        const empty = renderToStaticMarkup(
            <BookingDetailsScreen
                quote={{
                    status: 'ready',
                    data: { ...BOOKING_QUOTE, payment_methods: [] },
                }}
            />,
        )

        expect(empty).toContain('Payment Method')
        expect(empty).not.toContain('checked=""')
        expect(empty).not.toContain('UPI / QR / Wallets')
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

    it('prints the total the response sent, rather than adding the lines up', () => {
        /*
         * **The one assertion in this file that proves the screen does no
         * arithmetic of its own**, and it needs a fixture that lies to do it: the
         * lines below sum to 500 and the response says the total is 450, so a
         * screen that recomputed would print 500 and this would fail.
         *
         * The sum is deliberately not 450. A fixture whose lines add up is a
         * fixture that cannot tell the two implementations apart — and the whole
         * point of showing the server's figure is that a disagreement between
         * client and server is a *reportable* bug rather than a rounding
         * difference nobody notices. If the controller ever starts computing a
         * different total from its own lines, the front end follows it and the
         * server's test suite is where that gets caught.
         *
         * Everything else in this suite is faithful to the controller. This is the
         * one place that departs from it, and it departs on purpose.
         */
        const lines = { ...BOOKING_QUOTE, estimate: { ...BOOKING_QUOTE.estimate } }
        lines.estimate.lines = [
            { label: 'Base Service Fee', amount: 200 },
            { label: 'Estimated Labor (45 min)', amount: 200 },
            { label: 'Platform Charges', amount: 100 },
        ]

        const mismatched = renderToStaticMarkup(
            <BookingDetailsScreen
                quote={{ status: 'ready', data: lines }}
            />,
        )

        expect(mismatched).toContain('₹450')
        expect(mismatched).toContain('₹200')
        expect(mismatched).not.toContain('₹500')
    })

    it('reserves room for the footer so it cannot cover the payment rows', () => {
        // A sticky footer over the last control is the classic way a confirm
        // button becomes unclickable, and it is invisible in a static render.
        expect(html).toMatch(/pb-28/)
    })
})

describe('the matching results screen', () => {
    /*
     * The screen, given a matching response.
     *
     * `MatchingResultsScreen` and not `MatchingResults`, for the same reason as
     * every other one of these: the fetch is an effect, effects do not run under
     * `renderToStaticMarkup`, and a screen still waiting would answer none of the
     * nine assertions below.
     */
    const html = renderToStaticMarkup(
        <MatchingResultsScreen matching={{ status: 'ready', data: MATCHING }} />,
    )

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
        /*
         * **One "Book Now" and two "View Profile", where the design drew two and
         * one — and the endpoint is what changed it.** `availability.available_now`
         * is now the only thing that picks the button, and the roster says one
         * technician is free and two are not. A screen that kept the design's
         * counts would be drawing a button the payload contradicts, which is the
         * failure this whole migration exists to prevent.
         *
         * Asserted as a pair because a screen that printed "Book Now" everywhere
         * would fail this too, and for a worse reason: it would offer to book
         * somebody who is not free.
         */
        expect(times(html, '>Book Now<')).toBe(1)
        expect(times(html, '>View Profile<')).toBe(2)
    })

    it('pairs each button with the availability line it was chosen from', () => {
        /*
         * The pairing itself, asserted where a change to it would be visible. Each
         * card's availability sentence and its button come from one technician, and
         * the only card that says the person is free is the one offering a
         * booking. `actionFor` is exported as a pure function for exactly this,
         * and the assertions are in the roster's order — so a screen that sorted
         * by `best_match` and put the badge wherever it liked would still pass a
         * count-based version of this test.
         */
        const cards = MATCHING.technicians.map((technician) => ({
            availability: technician.availability.label,
            action: actionFor(technician),
        }))

        expect(cards).toEqual([
            { availability: 'Available Now', action: 'Book Now' },
            {
                availability: 'Available: Today, 4:00 PM',
                action: 'View Profile',
            },
            { availability: 'In 20 mins', action: 'View Profile' },
        ])

        // And on the screen itself, each sentence sits on the same card as its own
        // button — asserted by proximity, because a count cannot tell which button
        // went with which person.
        expect(html).toMatch(/Available Now.*?Book Now/s)
        expect(html).toMatch(/In 20 mins.*?View Profile/s)
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
         * and a **live status line** ("AI matching active in…") is a claim that a
         * system is running right now. Those three are the ones to cut first, and
         * they are named in that order in the mock module's docblock.
         *
         * **The dashboard's job tracker is absent, and that is a change rather than
         * an omission.** Its ETA, its job description and its four stage names were
         * claims of exactly the third kind — a live status line — and they are
         * still rendered. But they come from `GET /users/tracking`, so they are
         * not in this package's mock module. Rather than copy the controller's
         * strings here and assert them twice, the claim is recorded where the
         * string is: the tracking screen's `MockedDataNotice` says the
         * coordinates do not move and that nothing on it is moving, and
         * `mocked-customer-screens.test.tsx` asserts that sentence is on the
         * screen and that dropping it fails.
         *
         * **Three entries went away and one was renamed, and none of them is a
         * deletion of a promise.**
         *
         * `'Plumber'` and `'Electrician'` were the trades on the old *mock*
         * category list. The categories now come from `GET /users/discovery`, which
         * sends `Plumbing`, `Electrical` and `Carpentry` — so the singular forms
         * are no longer on any screen and the three plural ones are. Both facts
         * are caught: the pinned list below no longer contains them, and
         * `records no claim that is not actually rendered` would fail if it did.
         *
         * `'98 jobs'` became `'240 jobs'` because the featured technician is now
         * drawn from the shared roster, where Mahesh Chandra has completed 240
         * jobs rather than the 98 the local mock gave him. The entry is kept
         * because it is the same kind of claim — a figure about a person's
         * history, from nowhere — and changing the number is not the same as
         * deciding the number is fine.
         */
        expect([...UNSUPPORTED_CUSTOMER_CLAIMS]).toEqual([
            'Hi, Aarav',
            'Koramangala, Bengaluru',
            'Plumbing',
            'Electrical',
            'Carpentry',
            // The search query. Kept, unlike `'Electrician'` above it — the walk
            // found it because `MatchingResults` prints `matching.query` in two
            // places, so it is still on a screen.
            'Plumber',
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
            // The same three trades bare, because the discovery carousel and the
            // booking card print the trade without the years. Recorded twice on
            // purpose — see the note in `mock-data.ts`.
            'Master Plumber',
            'Plumbing & General Fix',
            'Master Pipe & Sanitary',
            'Expert Plumber',
            'Pipe Leakage Repair',
            'Ramesh Kumar',
            'Suresh Yadav',
            'Mahesh Chandra',
            'Imran Qureshi',
            // The bookings list's five own claims. `'In progress'` is the sharpest
            // of them: it is a live status line about a visit this repository has
            // no record of, and it is a claim for exactly the same reason the
            // tracker used to be — a sentence describing a world in which
            // something is happening now.
            //
            // The two dates are pinned in the fixture rather than left to drift,
            // so the record names a date rather than a shape. They are
            // `now()`-relative in the controller, which means the walk would fail
            // every time the fixture was regenerated from a live response — and a
            // walk that fails on a rebase for that reason is a walk people learn
            // to skip.
            'Sunita Deshmukh',
            'In progress',
            'Completed',
            '14 Nov 2026, 9:12 AM',
            '11 Nov 2026, 4:40 PM',
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
            '240 jobs',
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

    it('records every invented value the screens carry, not only a pinned list', () => {
        /*
         * The assertion above pins the list to today's contents, which stops it
         * being edited quietly — but it does **not** prove the list is *complete*.
         * A new field added to a payload, rendered on a screen and never written
         * down, passes the pinned assertion perfectly: the list is unchanged and
         * the new value is on screen. The exact failure the record exists to
         * prevent, and the pinned list is blind to it.
         *
         * So this walks the fixtures instead. Every string in them is a value a
         * customer can read, and each has to be either recorded as a claim or
         * listed below as deliberately not one. That inverts the maintenance
         * burden in the right direction: adding a field now fails here, and the
         * author has to say which it is, rather than the record going stale in
         * silence.
         *
         * ## Walking the fixtures rather than the mock module, and why that is
         * *more* coverage rather than less
         *
         * This used to walk `mock-data.ts`, which held every invented value the
         * screens drew. Those literals moved into three Laravel controllers, and a
         * walk of a TypeScript module cannot see PHP — so for a while this test
         * covered three badges and nothing else, while passing. **That is the
         * failure mode this test exists to prevent, committed to itself.** A record
         * that silently stops covering the screen it was written for is worse than
         * no record, because it is still green.
         *
         * The three fixtures are what makes the walk whole again. They are copies
         * of the controllers' own literals, they live in this package, and they
         * are typed as `Discovery`, `Matching` and `BookingQuote` — so a fixture
         * that fell behind its controller is a *type error* here, and the walk
         * below cannot fall behind the screen.
         *
         * Two things it deliberately cannot reach, both stated rather than left to
         * be discovered: the tracking payload's strings (covered by
         * `mocked-customer-screens.test.tsx` and disclosed by that screen's
         * `MockedDataNotice`), and the *composed* figures below — `From ₹149`,
         * `₹350 – ₹500`, `Master Plumber • 12 yrs exp`. Those are assembled by
         * `money.ts` from an integer, a currency code and a label, so they are
         * recorded as claims and asserted as rendered rather than walked as source
         * values. A `formatMoney` that stopped grouping would be caught by
         * `money.test.ts`, not here.
         */
        const invented = [
            ...DISCOVERY.categories.map((category) => category.label),
            ...DISCOVERY.featured_technicians.flatMap((worker) => [
                worker.name,
                worker.trade,
            ]),
            MATCHING.query,
            MATCHING.area,
            MATCHING.summary,
            ...MATCHING.filters.map((filter) => filter.label),
            ...MATCHING.technicians.flatMap((technician) => [
                technician.name,
                technician.trade,
                technician.availability.label,
            ]),
            BOOKING_QUOTE.estimate.heading,
            BOOKING_QUOTE.estimate.badge,
            BOOKING_QUOTE.estimate.footnote,
            ...BOOKING_QUOTE.payment_methods.flatMap((method) => [
                method.title,
                method.note,
            ]),
            BOOKING_QUOTE.service,
            BOOKING_QUOTE.technician.name,
            BOOKING_QUOTE.technician.trade,
            // The bookings list, walked for the same reason as the three above.
            // `worker_name` is the technician, `service` the trade it was booked
            // under, and both are on a screen a customer reads — so a roster that
            // gains a fourth worker has to be recorded here.
            //
            // **`status_label` and `scheduled_on` are walked too, and that is the
            // point of including them.** They are prose rather than machine values,
            // which is exactly why the walk cannot tell them apart: "Completed"
            // and a date read as claims to a machine the same way `status` and
            // `scheduled_at` would. They are recorded as claims because nobody
            // looked up whether that visit was completed.
            ...BOOKINGS.bookings.flatMap((booking) => [
                booking.service,
                booking.worker_name,
                booking.status_label,
                booking.scheduled_on,
            ]),
            ...MOCK_TRUST_BADGES.map((badge) => badge.label),
        ]

        /*
         * The values that are *not* claims, and why. Each is a string a customer
         * reads, and each is a fact about the screen rather than about the
         * business:
         *
         * - The screen's own headings. "Select Date & Time" describes the control
         *   it labels; the repository is not claiming to be able to satisfy it.
         * - The action labels. "Book Now" is what a button says — the *promise*
         *   it makes is that something gets booked, and that is not in the payload.
         * - The filter labels, which are recorded anyway. "AI Best Match" is the
         *   sharpest one: the chips are inert, so keeping it in the record is how
         *   a future reader learns the sort exists only as a picture of one.
         *
         * The empty list is deliberate and load-bearing. It was a dozen entries
         * when the walk covered local mocks; the walk now covers endpoints, whose
         * strings are all recorded claims, so there is nothing left to excuse.
         * `expect(notClaims.size).toBe(0)` below keeps it that way — an excuse
         * added without a record entry fails rather than quietly widening what the
         * test lets through.
         */
        const notClaims = new Set<string>([])

        /*
         * The excuse list must stay empty, because an empty one is a claim: it says
         * every string the screens carry is something the platform promises, and
         * somebody has decided to write it down. A non-empty list is that claim
         * withdrawn one entry at a time, and this is where it gets withdrawn.
         *
         * Asserted separately rather than left implicit so that adding an excuse
         * produces a failure somebody reads — "you have excused a value from the
         * record" — instead of a green suite that has quietly decided a claim is
         * not one.
         */
        expect(
            notClaims,
            'a value has been excused from the record; either record it as a claim, ' +
                'or say here in a comment why it is only a label',
        ).toEqual(new Set())

        const unrecorded = [
            ...new Set(invented),
        ].filter((value) => !notClaims.has(value)).filter(
            (value) => !UNSUPPORTED_CUSTOMER_CLAIMS.includes(value as never),
        )

        expect(
            unrecorded,
            'these values are rendered on a screen but not in the record; add them to ' +
                'UNSUPPORTED_CUSTOMER_CLAIMS, or to the not-claims list in this test if ' +
                'they are only labels',
        ).toEqual([])

        /*
         * And the other end of the walk, which the pinned assertion above cannot
         * give: every recorded claim must be a value that appears *somewhere* in
         * the fixtures or the badge module, not a string this test typed into its
         * own expectation. Without this, a claim could be added to the record for
         * a value that was never rendered and the pinned list would happily agree
         * with itself.
         *
         * The composed figures are the exception and are written out, because they
         * are assembled by `money.ts` from numbers rather than stored as strings —
         * which is also the reason they are claims in the first place.
         */
        const fromPayloads = new Set(invented)
        const composed = [
            // Assembled by `money.ts` from an integer and a currency code rather
            // than stored as a string — which is the whole reason any of them is a
            // claim: a formatting function is not a price.
            'From ₹149',
            'From ₹129',
            'From ₹199',
            '₹149',
            '₹129',
            '₹179',
            '₹250',
            '₹51',
            '₹450',
            '₹350 – ₹500',
            '1.2 km',
            '2.8 km',
            '1.8 km',
            '22 mins',
            '120 jobs',
            '240 jobs',
            '4.8',
            '4.9',
            '4.6',
            '(120)',
            '(84)',
            '(240)',
            'Master Plumber • 12 yrs exp',
            'Plumbing & General Fix • 8 yrs exp',
            'Master Pipe & Sanitary • 15 yrs exp',
            // Sent as separate parts and printed as one sentence. The screen holds
            // `found_count`; the word "Found" is the design's.
            '24 Found',
            'Searching for “Plumber”',
            // Two parts: the payload's `area` and the screen's own sentence around
            // it. Recorded whole because that is the string on screen.
            'AI matching active in Sector 48, Gurugram',
            // The estimate's own labels. `heading` and `badge` are walked above as
            // payload fields; these two are the line labels the screen renders as
            // the `<dt>` of a `<dl>`.
            'Base Service Fee',
            'Estimated Labor (45 min)',
            'Platform Charges',
            'Total Payable',
            // Screen-owned copy rather than payload, and the reason each is still
            // a claim is the same: the platform is saying it.
            'Hi, Aarav',
            'Koramangala, Bengaluru',
            'AI Price Estimator',
            'AI BEST MATCH',
            'FixMate 30-Day Work Warranty',
            'Every service is insured up to ₹10,000 for damages.',
        ]

        const unfounded = [...UNSUPPORTED_CUSTOMER_CLAIMS].filter(
            (claim) => !fromPayloads.has(claim) && !composed.includes(claim),
        )

        expect(
            unfounded,
            'these claims are in the record but match no value any screen carries',
        ).toEqual([])
    })

    it('records no claim that is not actually rendered', () => {
        /*
         * The other direction, and the one that keeps the list from rotting. A
         * list that accumulates entries for claims already deleted tells the next
         * reader that a price is still on screen when it is not.
         *
         * `plain()` supplies all three payloads, so "rendered" here means rendered
         * on a screen that has data — not merely reachable in markup. That was the
         * gap while the screens fetched their own: every claim sat behind a loader
         * that never ran, and this test would have failed on all of them had it
         * been rewritten first.
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
