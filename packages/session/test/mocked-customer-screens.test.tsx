import type {
    BookingQuote,
    DiagnosisResult,
    DiagnosisSuggestions,
    LiveTracking,
    Matching,
    RegistrationResult,
} from '@fixmate/api-client'
import { renderToStaticMarkup } from 'react-dom/server'
import { BOOKING_QUOTE } from './fixtures/booking-quote'
import { BOOKINGS } from './fixtures/bookings'
import { DISCOVERY } from './fixtures/discovery'
import { MATCHING } from './fixtures/matching'
import { TRACKING } from './fixtures/tracking'
import { describe, expect, it } from 'vitest'
import { AiDiagnosisScreen } from '../src/react/customer/ai-diagnosis'
import { BookingDetailsScreen } from '../src/react/customer/booking-details'
import { CustomerBookingsScreen } from '../src/react/customer/booking-list'
import { CustomerDashboardScreen } from '../src/react/customer/customer-dashboard'
import {
    CustomerRegistration,
    Registered,
    validate,
} from '../src/react/customer/customer-registration'
import { LiveTrackingScreen } from '../src/react/customer/live-tracking'
import { MatchingResultsScreen } from '../src/react/customer/matching-results'
import { MockedDataNotice } from '../src/react/customer/mocked-data-notice'
import type { MockedResource } from '../src/react/customer/use-mocked-resource'
import { describeResourceFailure } from '../src/react/customer/use-mocked-resource'

/**
 * The seven screens fed by the mocked customer endpoints.
 *
 * These screens exist to be *looked at*, and the risk they carry is not a crash —
 * it is that a fixture gets mistaken for a working feature. A technician's
 * coordinates, a `0.92` confidence and a `201` from a registration form each look
 * exactly like the real thing, and the difference is invisible in a screenshot.
 *
 * So most of what follows is about disclosure rather than rendering: that every
 * mocked screen says it, that the tracking screen says a refresh changes nothing,
 * and that registration's success state says no account was made. Those are the
 * claims a reader would otherwise have to take on trust.
 *
 * ## Why `renderToStaticMarkup`, and what that costs
 *
 * This package has no jsdom, and `sign-in-screen.test.tsx` and
 * `change-password-screen.test.tsx` both record why adding one for a composition
 * check is a worse trade than server rendering. It has one sharp consequence
 * here: **an effect never runs**, so a screen written only as a hook can never be
 * shown its resolved state — every render would be the loading state.
 *
 * That is why each screen is split into a fetching half and a presentational
 * half (`AiDiagnosisScreen`, `LiveTrackingScreen`), and why the states below are
 * written by hand as plain objects. The seam exists so the states worth pinning
 * are reachable without a DOM.
 *
 * What this cannot do: click, type, or check anything a browser computes. The
 * toggles and the form submission are tested where those components live, in
 * `packages/ui`.
 */

// -------------------------------------------------------------------------
// Fixtures, shaped exactly as the controllers answer.
// -------------------------------------------------------------------------

/** `DiagnosisController`'s literal. */
const DIAGNOSIS: DiagnosisResult = {
    diagnosis: {
        problem: 'Kitchen sink pipe leaking under the basin',
        severity: 'medium',
        possible_causes: ['Loose compression joint', 'Failed washer on the trap'],
        recommended_solution: 'Replace the failed washer and reseal the compression joint.',
        estimated_time: '30-45 minutes',
        price_estimate: { min: 400, max: 900, currency: 'INR' },
        tools_needed: ['Adjustable spanner', 'Thread seal tape'],
    },
}

/** `DiagnosisSuggestionsController`'s literal, trimmed to two of the three. */
const SUGGESTIONS: DiagnosisSuggestions = {
    suggestions: [
        {
            id: 'leak',
            title: 'Leak or dripping pipe',
            description: 'Water escaping from a joint, tap or the base of a fixture',
            confidence: 0.92,
            price_range: { min: 400, max: 900, currency: 'INR' },
        },
        {
            id: 'power',
            title: 'Electrical fault',
            description: 'Sparking, a tripped breaker, or a socket that has stopped working',
            confidence: 0.74,
            price_range: { min: 500, max: 1400, currency: 'INR' },
        },
    ],
    recommended: 'leak',
}

const REGISTRATION: RegistrationResult = {
    success: true,
    message: 'Registration successful',
    user: { id: 1, name: 'Aarav Sharma', email: 'aarav@example.test' },
    token: 'mock-registration-abcdef0123456789',
}

/** A state of each kind, written out so the tests cannot share a helper's mistake. */
const loading = <T,>(): MockedResource<T> => ({ status: 'loading', data: null, refreshing: false })
const ready = <T,>(data: T): MockedResource<T> => ({ status: 'ready', data, refreshing: false })
const failed = (message: string): MockedResource<never> => ({
    status: 'failed',
    data: null,
    message,
    refreshing: false,
})

const noop = () => {}

/**
 * Attribute assertions, case-insensitively.
 *
 * HTML attribute names are case-insensitive, so `autoComplete="x"` and
 * `autocomplete="x"` are the same attribute to a browser — but React's server
 * renderer emits whichever spelling the JSX prop had. Asserting one of them pins
 * React's output rather than what the browser reads, so the markup is lower-cased
 * first and the assertion is about the attribute.
 *
 * This matters here because `autoComplete` is load-bearing in its own right: the
 * value tells a password manager whether the field is a new password or the
 * current one, and a wrong value is a reason for it to offer nothing at all.
 */
function attributes(html: string): string {
    return html.toLowerCase()
}

/**
 * The opening tag of the submit button, so a `disabled` assertion is about the
 * attribute and not about the word appearing in a `disabled:` Tailwind variant
 * class — which is on the button whether or not it is disabled.
 */
function submitButton(html: string): string {
    const openingTag = html.match(/<button[^>]*type="submit"[^>]*>/i)

    if (openingTag === null) {
        throw new Error('no submit button was rendered')
    }

    return openingTag[0]
}

/**
 * Whether an opening tag carries the boolean `disabled` attribute.
 *
 * Matched as `disabled` followed by `=`, whitespace or `>`, because the string
 * `disabled` also occurs inside the Tailwind variant classes
 * `disabled:cursor-not-allowed` and `disabled:opacity-60` — which are on the
 * button whether or not it is disabled. A plain `includes('disabled')` therefore
 * fails on a button that is very much enabled, which is the failure mode this
 * assertion exists to avoid reporting.
 */
function isDisabled(openingTag: string): boolean {
    return /\sdisabled(=|\s|>)/i.test(openingTag)
}

// -------------------------------------------------------------------------
// The disclosure.
// -------------------------------------------------------------------------

describe('the example-data notice', () => {
    it('says the numbers are examples and nobody is being tracked', () => {
        const html = renderToStaticMarkup(<MockedDataNotice />)

        expect(html).toContain('Example data')
        expect(html).toContain('not a real result')
        expect(html).toContain('Nobody is being')
        expect(html).toContain('no booking will be made')
    })

    it('carries the detail a screen supplies rather than a second copy of the wording', () => {
        // The detail is the part specific to each screen — "the coordinates do not
        // move" is true of the tracker and false of the diagnosis screen. Asserted
        // here so that a screen cannot satisfy this component by passing nothing and
        // still be counted as disclosing its own specific lie.
        expect(renderToStaticMarkup(<MockedDataNotice />)).not.toContain('coordinates')

        expect(
            renderToStaticMarkup(<MockedDataNotice detail="The coordinates do not move." />),
        ).toContain('coordinates do not move')
    })

    it('is a note rather than an alert, so it does not interrupt on arrival', () => {
        // `role="alert"` is an assertive live region: it interrupts whatever a screen
        // reader is currently saying. Context for a page is not that.
        const html = renderToStaticMarkup(<MockedDataNotice />)

        expect(html).toContain('role="note"')
        expect(html).not.toContain('role="alert"')
        expect(html).not.toContain('aria-live')
    })

    it('is on every mocked screen', () => {
        /*
         * The reason the notice is a component. A seventh mocked screen that
         * forgets it is then a visible omission rather than a silent one, and this
         * is the assertion that makes forgetting impossible to review past.
         *
         * **Seven, not three, and the count is the assertion.** The four newer
         * screens each read an endpoint and were added later, which is exactly when
         * a notice gets left off — the screen has a real fetch in it now, so it
         * reads like a real screen. The list below is therefore the complete
         * inventory of mocked screens, and `expect(screens).toHaveLength(7)` fails
         * the moment somebody adds an eighth and does not list it here. Without
         * that line, adding a screen that *does* carry the notice would be
         * invisible too, and this test would quietly stop covering the one that
         * does not.
         *
         * Each is rendered in its ready state, because a notice that only appears
         * once data has arrived is a notice about the data rather than about the
         * screen — and the first thing a person sees on arrival is the loading
         * state.
         */
        const screens = [
            renderToStaticMarkup(
                <AiDiagnosisScreen
                    diagnosis={ready(DIAGNOSIS)}
                    suggestions={ready(SUGGESTIONS)}
                    onRefresh={noop}
                />,
            ),
            renderToStaticMarkup(
                <LiveTrackingScreen tracking={ready(TRACKING)} onRefresh={noop} />,
            ),
            renderToStaticMarkup(
                <CustomerRegistration
                    loadRegistration={async () => REGISTRATION}
                    onSignInInstead={noop}
                />,
            ),
            renderToStaticMarkup(
                <CustomerDashboardScreen
                    pathname="/"
                    tracking={ready(TRACKING)}
                    discovery={ready(DISCOVERY)}
                />,
            ),
            renderToStaticMarkup(
                <MatchingResultsScreen matching={ready(MATCHING)} />,
            ),
            renderToStaticMarkup(
                <BookingDetailsScreen quote={ready(BOOKING_QUOTE)} />,
            ),
            renderToStaticMarkup(
                <CustomerBookingsScreen bookings={ready(BOOKINGS)} />,
            ),
        ]

        expect(screens).toHaveLength(7)

        for (const html of screens) {
            expect(html, 'a mocked screen is missing the notice').toContain('Example data')
        }
    })

    it('is on the two picker screens even before their payloads arrive', () => {
        /*
         * The narrower half, and the one that matters most for these screens: a
         * person arriving at `/booking-details/` sees a loading sentence, not a
         * price, so a notice rendered only in the ready state would never be read
         * by anyone looking at whether it was there. Asserted on the loading
         * markup, where the claim is least likely to be noticed.
         */
        const loading = [
            renderToStaticMarkup(
                <BookingDetailsScreen quote={{ status: 'loading', data: null, refreshing: false }} />,
            ),
            renderToStaticMarkup(
                <MatchingResultsScreen matching={{ status: 'loading', data: null, refreshing: false }} />,
            ),
        ]

        for (const html of loading) {
            expect(html, 'a loading mocked screen is missing the notice').toContain(
                'Example data',
            )
        }
    })
})

// -------------------------------------------------------------------------
// AI diagnosis.
// -------------------------------------------------------------------------

describe('the AI diagnosis screen', () => {
    function render(diagnosis = ready(DIAGNOSIS), suggestions = ready(SUGGESTIONS)): string {
        return renderToStaticMarkup(
            <AiDiagnosisScreen diagnosis={diagnosis} suggestions={suggestions} onRefresh={noop} />,
        )
    }

    it('renders every field the response carried', () => {
        // All seven. A diagnosis screen that drops `tools_needed` still looks like a
        // diagnosis screen, which is why each field is named rather than the
        // section headings being counted.
        const html = render()

        for (const value of [
            'Kitchen sink pipe leaking under the basin',
            'Loose compression joint',
            'Failed washer on the trap',
            'Replace the failed washer',
            '30-45 minutes',
            'Adjustable spanner',
            'Thread seal tape',
        ]) {
            expect(html, `missing ${value}`).toContain(value)
        }
    })

    it('says the confidence scores are written rather than calculated', () => {
        expect(render()).toContain('written in a controller, not calculated')
    })

    it('formats a price range with the rupee symbol and the Indian grouping', () => {
        // The payload carries `min`/`max` as integers and a currency code, and the
        // symbol is added here. So the assertion is on the *formatted* string: four
        // front ends each format their own prices, and this is the one place for the
        // customer screens.
        expect(render()).toContain('₹')
        expect(render()).toContain('400')
        expect(render()).toContain('900')

        // Indian grouping puts a separator above four digits, which is the visible
        // difference from `en-US` and the thing worth pinning: 1,400 in one locale
        // is 1,400 and in the other it is not.
        expect(render()).toContain('1,400')
    })

    it('shows the severity as a word rather than as a colour alone', () => {
        const html = render()

        expect(html).toContain('Medium severity')

        // The back end sends `medium`. Rendering the raw token would be honest about
        // the payload and useless to read, so the screen maps it — and an unmapped
        // value has to fall through unchanged rather than disappear.
        expect(html).not.toContain('>medium<')
    })

    it('renders an unrecognised severity rather than hiding it', () => {
        // A blank pill would hide the fact that the back end sent something this
        // screen does not know about, which is the reportable outcome.
        const html = render(
            ready({
                ...DIAGNOSIS,
                diagnosis: { ...DIAGNOSIS.diagnosis, severity: 'catastrophic' },
            }),
        )

        expect(html).toContain('catastrophic')
    })

    it('marks the recommended suggestion in a way a screen reader can read', () => {
        // `aria-pressed` rather than the visible badge alone. The badge is still
        // rendered for the design, but it must not be the only carrier of which
        // category the response chose.
        const html = render()

        expect(html).toContain('aria-pressed="true"')
        expect(html).toContain('Recommended')
        expect(html).toContain('aria-pressed="false"')
    })

    it('still shows the diagnosis when the suggestions failed', () => {
        // Two independent requests, and one failing must not throw away the other.
        // The alternative — an all-or-nothing screen — is the worse error, because
        // the diagnosis is the part the person came for.
        const html = render(ready(DIAGNOSIS), failed('The service is unreachable.'))

        expect(html).toContain('Kitchen sink pipe leaking under the basin')
        expect(html).toContain('The service is unreachable.')
    })

    it('still shows the suggestions when the diagnosis failed', () => {
        const html = render(failed('The service is unreachable.'), ready(SUGGESTIONS))

        expect(html).toContain('Leak or dripping pipe')
        expect(html).toContain('The service is unreachable.')
    })

    it('distinguishes loading from failure', () => {
        // A dashboard showing an empty state has told the person something; one
        // showing an error has not. So the two must never render the same markup.
        const loadingHtml = render(loading<DiagnosisResult>(), ready(SUGGESTIONS))
        const failedHtml = render(failed('The service is unreachable.'), ready(SUGGESTIONS))

        expect(loadingHtml).toContain('Loading diagnosis…')
        expect(loadingHtml).not.toContain('The service is unreachable.')
        expect(failedHtml).toContain('The service is unreachable.')
        expect(failedHtml).not.toContain('Loading diagnosis…')
    })

    it('announces the waiting state politely', () => {
        expect(render(loading<DiagnosisResult>(), loading<DiagnosisSuggestions>())).toContain(
            'role="status"',
        )
    })

    it('has a named region for the suggestions', () => {
        expect(render()).toContain('aria-label="Possible problems"')
    })
})

// -------------------------------------------------------------------------
// Discovery, matching and the booking quote.
// -------------------------------------------------------------------------

describe('the matching results screen', () => {
    function render(matching: MockedResource<Matching> = ready(MATCHING)): string {
        return renderToStaticMarkup(<MatchingResultsScreen matching={matching} />)
    }

    it('says nothing about a query it has not been told', () => {
        /*
         * **The one thing this screen cannot render before its payload is a
         * heading, and that is a design constraint rather than an omission.** The
         * frame reads "Plumber Search & Matching", and there is no Plumber until
         * `query` arrives — so a placeholder would be a screen asserting a search
         * for something nobody searched for. The heading is absent while loading,
         * and asserted absent rather than assumed.
         */
        const html = render(loading<Matching>())

        expect(html).not.toContain('Search &amp; Matching<')
        expect(html).toContain('SEARCH &amp; MATCH')
    })

    it('distinguishes loading from failure', () => {
        expect(render(loading<Matching>())).toContain('Loading matches…')
        expect(render(failed('The service is unreachable.'))).toContain(
            'The service is unreachable.',
        )
    })

    it('names the filters as filters, and admits they are inert', () => {
        /*
         * The chips are the sharpest unbacked claim on this screen: four labels
         * ending in "Best Match", "Near Me" and "Top Rated" on a list nothing
         * ordered and nothing can re-order. They render because the design draws
         * them; the notice is what makes them honest; and `UNSUPPORTED_CUSTOMER_CLAIMS`
         * is where removing them is one edit.
         *
         * Asserted that the labels *come from* the payload rather than being
         * written in the markup, by giving a fixture with different labels — a
         * screen with its own array would render the design's four and pass every
         * count-based version of this test.
         */
        const renamed = render(
            ready({
                ...MATCHING,
                filters: [
                    { id: 'cheap', label: 'Cheapest First' },
                    { id: 'soonest', label: 'Soonest Arrival' },
                ],
            }),
        )

        expect(renamed).toContain('Cheapest First')
        expect(renamed).toContain('Soonest Arrival')
        expect(renamed).not.toContain('Price: Low to High')
        // Two chips, two pressed-by-default — the first, as the design draws it.
        expect(renamed.match(/aria-pressed="true"/g)).toHaveLength(1)
    })

    it('draws one card per technician and not one per result claimed', () => {
        /*
         * `found_count` is 24 and three technicians are sent, and the screen must
         * not reconcile them — the two numbers come from the same response and the
         * response is the authority. The assertion is on `<article`, so a screen
         * that padded the list to 24 cards, or drew one and said "24", fails.
         */
        const html = render()

        expect(html).toContain('24 Found')
        expect(html.match(/<article/g)).toHaveLength(3)
    })

    it('shows the summary the response gave, rather than one it composed', () => {
        /*
         * "Based on your "Leaky Pipe Under Sink" request, we matched 3 master
         * technicians…" is a sentence about a request and a matching run. Nothing
         * here holds a request and nothing ran a matcher, so it arrives as a
         * literal — and the screen's temptation to rebuild it from `query` and
         * `found_count` is exactly what this rejects: a composed version would
         * say "Based on your "Plumber" request, we matched 24…", which is a *more*
         * specific lie, because it would name a request nobody made and a count
         * that does not match the list beneath it.
         */
        expect(render()).toContain(MATCHING.summary)
    })
})

describe('the booking quote screen', () => {
    function render(quote: MockedResource<BookingQuote> = ready(BOOKING_QUOTE)): string {
        return renderToStaticMarkup(<BookingDetailsScreen quote={quote} />)
    }

    it('distinguishes loading from failure', () => {
        /*
         * Loading and a 404 have to look different, and this screen has the only
         * endpoint that 404s: every mocked customer route answers a literal, and
         * `GET /users/bookings/{booking}/quote` refuses an identifier it has no
         * example for. "This booking's quote could not be loaded" and "there is no
         * such booking" are different sentences for a person deciding whether to
         * go back, so the failure state shows the message and the screen keeps its
         * header — a screen that rendered nothing at all would be a person with no
         * way out.
         */
        expect(render(loading<BookingQuote>())).toContain('Loading the quote…')
        expect(render(loading<BookingQuote>())).not.toContain('₹450')

        const notFound = render(failed('No such booking.'))

        expect(notFound).toContain('No such booking.')
        expect(notFound).toContain('Booking Details')
        expect(notFound).not.toContain('₹450')
        expect(notFound).not.toContain('UPI / QR / Wallets')
    })

    it('names the booking it was asked for', () => {
        /*
         * `booking_id` is in the payload and the screen does not print it — the
         * frame has nowhere to put it. That is a small gap rather than a large
         * one: two of the four fields on the card are the technician and the
         * service, and a booking number is the one identifier a support
         * conversation needs. Asserted as *absent* so a screen that starts
         * printing it has to decide whether the claim list needs it — which is the
         * whole point of the record.
         */
        expect(render()).not.toContain(BOOKING_QUOTE.booking_id)
    })
})

// -------------------------------------------------------------------------
// Live tracking.
// -------------------------------------------------------------------------

describe('the live tracking screen', () => {
    function render(tracking: MockedResource<LiveTracking> = ready(TRACKING)): string {
        return renderToStaticMarkup(<LiveTrackingScreen tracking={tracking} onRefresh={noop} />)
    }

    it('says plainly that nothing on the screen is moving', () => {
        // **The single most important assertion in this file.** The screen looks
        // exactly like a working tracker; the coordinates and the ETA are literals in
        // a controller and nothing polls them. If this sentence is ever removed, the
        // fixture becomes indistinguishable from the feature it is standing in for.
        const html = render()

        expect(html).toContain('do not change between requests')
        expect(html).toContain('nothing on this screen is moving')
    })

    it('says what pressing refresh will do, next to the refresh control', () => {
        // The button is here and it works. What is *not* here is motion, and a
        // button labelled "refresh" on a screen showing a position invites somebody to
        // press it twice watching for the marker to move. The honest answer goes
        // under the button rather than only in the banner.
        const html = render()

        expect(html).toContain('Refresh position')
        expect(html).toContain('It will return these same numbers')
        expect(html).toContain('fixed examples rather than a position being reported')
    })

    it('shows the coordinates as text rather than plotting them', () => {
        // A plot is the most convincing possible fake: a marker on a map is
        // indistinguishable from a *moving* marker in a screenshot. Two literal
        // numbers, labelled, are not.
        const html = render()

        expect(html).toContain('12.9719, 77.5946')
        expect(html).toContain('12.9784, 77.5912')
        expect(html).toContain('Technician')
        expect(html).toContain('Destination')

        // Nothing that could place a marker on a background image.
        expect(html).not.toContain('<svg')
        expect(html).not.toContain('<canvas')
        expect(html).not.toContain('<img')
    })

    it('names the distance and the ETA as what they are', () => {
        const html = render()

        expect(html).toContain('0.8 km away')
        expect(html).toContain('5 minutes away')
        expect(html).toContain('This is an example position')
    })

    it('carries each stage state in words as well as in a glyph', () => {
        // The tick and the hollow ring are both decorative; without the words a
        // screen reader would read four identical stage names and learn nothing.
        const html = render()

        expect(html).toContain('Accepted')
        expect(html).toContain('On the way')
        expect(html).toContain('Arriving now')
        expect(html).toContain('Work completed')

        expect(html).toContain('completed')
        expect(html).toContain('not yet reached')
        expect(html).toContain('sr-only')
    })

    it('orders the stages, because the order is the point of a timeline', () => {
        // An unordered list of the same four items renders identically and means
        // nothing, so the element itself is the assertion.
        const html = render()
        const list = html.slice(html.indexOf('aria-label="Progress"'))

        expect(list).toContain('<ol')

        const positions = ['Accepted', 'On the way', 'Arriving now', 'Work completed'].map((stage) =>
            list.indexOf(stage),
        )

        expect(positions).toEqual([...positions].sort((a, b) => a - b))
    })

    it('renders a timestamp only for a stage that completed', () => {
        // The controller guarantees the two agree — a completed stage always has a
        // timestamp and an incomplete one never does — so a timestamp appearing for an
        // unfinished stage is a payload the screen did not expect.
        const html = render()

        expect(html).toContain('2026-10-02T09:00:00+00:00')
        expect(html.match(/<time/g)).toHaveLength(2)
    })

    it('distinguishes loading from failure', () => {
        expect(render(loading<LiveTracking>())).toContain('Loading tracking…')
        expect(render(failed('The service is unreachable.'))).toContain(
            'The service is unreachable.',
        )
    })
})

// -------------------------------------------------------------------------
// Registration.
// -------------------------------------------------------------------------

describe('the registration screen', () => {
    it('says in the success state that no account was created', () => {
        // **The claim that makes this a mock rather than a lie.** The endpoint
        // answers `201` and the design shows a success panel, so a person who stops
        // reading after the panel has been told their account exists. The correction
        // has to be on the screen, not in this file's docblock.
        const html = renderToStaticMarkup(<Registered result={REGISTRATION} onSignInInstead={noop} />)

        expect(html).toContain('No account was created')
        expect(html).toContain('nobody is signed in')
        expect(html).toContain('accounts are made by an operator')
    })

    it('never renders the token the response carries', () => {
        // It looks exactly like a credential, so the screen must not display it,
        // store it, or hand it onward. Asserted against the fixture's actual value
        // rather than against the word "token", because the failure mode is the
        // *value* appearing somewhere.
        const html = renderToStaticMarkup(<Registered result={REGISTRATION} onSignInInstead={noop} />)

        expect(html).not.toContain(REGISTRATION.token)
        expect(html).not.toContain('mock-registration')
    })

    it('labels the echoed fields as echoes of what was sent', () => {
        const html = renderToStaticMarkup(<Registered result={REGISTRATION} onSignInInstead={noop} />)

        expect(html).toContain('Name you sent')
        expect(html).toContain('aarav@example.test')
        expect(html).toContain('Email you sent')
    })

    it('says the details were accepted and not that they were saved', () => {
        // "Accepted" and "created" are different claims and only one of them is
        // true. Both are on the screen, adjacent, because a reader who sees only
        // one of them has been told something false.
        const html = renderToStaticMarkup(<Registered result={REGISTRATION} onSignInInstead={noop} />)

        expect(html).toContain('accepted by the service')
        expect(html).not.toContain('account created successfully')
    })

    it('asks for the three fields the registration frame has', () => {
        const html = attributes(
            renderToStaticMarkup(
                <CustomerRegistration
                    loadRegistration={async () => REGISTRATION}
                    onSignInInstead={noop}
                />,
            ),
        )

        expect(html).toContain('full name')
        expect(html).toContain('email')
        expect(html).toContain('password')

        // `new-password` rather than `current-password`: a wrong value is a reason
        // for a password manager to offer nothing at all, which quietly undoes the
        // whole point of asking for a password.
        expect(html).toContain('autocomplete="new-password"')
        expect(html).toContain('autocomplete="name"')
        expect(html).toContain('autocomplete="email"')
    })

    it('wires the hint to the input with aria-describedby', () => {
        // **This assertion exists because the screen got it wrong the first time.**
        // `Field`'s render prop hands out `{ id, describedBy, invalid }` — its own
        // spelling — and spreading that straight onto an `<input>` renders a
        // `describedBy` attribute a browser does not recognise. The hint is visible
        // on screen either way, so the bug looked like a success in a screenshot
        // and was invisible to every other assertion on this screen.
        //
        // So the test asserts the wiring, and asserts the *absence* of the prop name
        // that means it was not wired.
        const html = renderToStaticMarkup(
            <CustomerRegistration
                loadRegistration={async () => REGISTRATION}
                onSignInInstead={noop}
            />,
        )

        expect(html).toContain('aria-describedby')
        expect(html).not.toContain('describedBy=')

        // And the referenced id has to be the hint that is actually in the document,
        // or the wiring points at nothing.
        const describedBy = html.match(/aria-describedby="([^"]+)"/i)?.[1]

        expect(describedBy).toBeDefined()
        expect(html).toContain(`id="${describedBy as string}"`)
        expect(html).toContain('As it should appear on a booking.')
    })

    it('does not disable the submit button on a half-filled form', () => {
        // Disabling it until every field is valid removes the only way a person
        // learns *which* field is wrong and replaces it with a button that silently
        // does nothing — the outcome the booking screen's docblock argues against.
        // Validation happens on submit and reports per field instead.
        //
        // **This only covers the first render, and that limit is stated rather than
        // hidden.** A render with errors already in it needs state, which needs a
        // DOM, which this package does not have. The mutation run demonstrated what
        // that costs: `disabled={submitting || Object.keys(errors).length > 0}` is
        // invisible here, because `errors` is empty on arrival and the initial markup
        // is identical. What *is* covered is the shape of the mistake someone
        // actually makes — gating the button on the form's contents — and that is
        // what the next assertion catches.
        const html = renderToStaticMarkup(
            <CustomerRegistration
                loadRegistration={async () => REGISTRATION}
                onSignInInstead={noop}
            />,
        )

        expect(html).toContain('I agree to Terms &amp; Conditions')
        expect(isDisabled(submitButton(html))).toBe(false)
    })

    it('leaves the submit button enabled when the form is empty and invalid', () => {
        // The real version of the same property, and the one that catches the
        // mutation the test above misses. `validate` says an empty form has three
        // problems, and the button is still enabled — because the button's only job
        // is to submit, and it is `validate` that reports the problems.
        //
        // Without this, "the button is enabled" and "the button is enabled because
        // the form happens to be fine" are indistinguishable.
        expect(Object.keys(validate({ name: '', email: '', password: '' }))).toHaveLength(3)

        const html = renderToStaticMarkup(
            <CustomerRegistration
                loadRegistration={async () => REGISTRATION}
                onSignInInstead={noop}
            />,
        )

        expect(isDisabled(submitButton(html))).toBe(false)
    })

    it('reports every problem with the form at once rather than the first', () => {
        // Reporting one at a time makes a person fix, submit, and be told about the
        // next — three round trips for three fields, and the last one is always the
        // field they did not know was wrong.
        const errors = validate({ name: '', email: 'not-an-address', password: '' })

        expect(errors).toMatchObject({
            name: expect.any(String),
            email: expect.any(String),
            password: expect.any(String),
        })
    })

    it('accepts a filled-in form without complaint', () => {
        expect(validate({ name: 'Aarav Sharma', email: 'aarav@example.test', password: 'x' })).toEqual(
            {},
        )
    })

    it('does not invent a password policy this platform does not have', () => {
        // There is no policy to check against, so a strength rule here would be a
        // second and different policy from whatever the back end eventually has.
        // Both of these pass; a screen that demanded more would be making a
        // decision nobody made.
        expect(
            validate({ name: 'A', email: 'a@b.test', password: 'x' }),
        ).toEqual({})
    })

    it('shows the example-data notice before the form, not after it', () => {
        // Position matters: a disclosure below a form is a footnote, and the person
        // who needs it is the one who has already filled the form in.
        const html = renderToStaticMarkup(
            <CustomerRegistration loadRegistration={async () => REGISTRATION} onSignInInstead={noop} />,
        )

        expect(html.indexOf('Example data')).toBeLessThan(html.indexOf('<form'))
    })

    it('offers a route to sign in rather than leaving the person stuck', () => {
        const html = renderToStaticMarkup(
            <CustomerRegistration loadRegistration={async () => REGISTRATION} onSignInInstead={noop} />,
        )

        expect(html).toContain('Already have an account?')
        expect(html).toContain('Sign in')
    })
})

// -------------------------------------------------------------------------
// The failure sentences.
// -------------------------------------------------------------------------

describe('the failure sentences', () => {
    it('rewrites the two cases the back end said nothing about', () => {
        // A blank screen tells a person nothing about whether to retry, and telling
        // them to retry in the second case would be exactly wrong — the service is
        // up and will answer the same shape again.
        expect(describeResourceFailure({ kind: 'network', message: 'fetch failed' })).toContain(
            'Check your connection',
        )

        expect(
            describeResourceFailure({ kind: 'contract', message: 'diagnosis.price_estimate.min' }),
        ).toContain('does not recognise')
    })

    it("passes the back end's own message through untouched", () => {
        // A 403 on a customer screen has a specific cause the front end does not
        // know, so anything written here would be a guess the person cannot check.
        expect(
            describeResourceFailure({ kind: 'forbidden', message: 'This account cannot do that.' }),
        ).toBe('This account cannot do that.')
    })

    it('falls back to a sentence for something that is not an API error at all', () => {
        // Not `undefined` and not an empty string. A blank failure panel is the one
        // outcome that tells a person nothing.
        for (const thrown of [undefined, null, 'a string', 42, {}]) {
            expect(describeResourceFailure(thrown).length).toBeGreaterThan(0)
        }
    })
})