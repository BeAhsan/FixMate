'use client'

import type { MatchResult, Matching } from '@fixmate/api-client'
import { APPLE_PRESS } from '@fixmate/ui'
import { MockedDataNotice } from './mocked-data-notice'
import {
    formatCount,
    formatDistance,
    formatMoney,
    formatMoneyRange,
    formatRating,
} from './money'
import { JAKARTA_FONT_CLASS } from './typeface'
import {
    ACCENT_TEXT,
    AMBER_TEXT,
    CARD,
    CHIP_OFF,
    CHIP_ON,
    DEEP,
    GROUND,
    INK,
    INK_SOFT,
    MINT,
    TRUST_FOOT,
} from './tokens'
import { useMockedResource, type MockedResource } from './use-mocked-resource'

/**
 * The customer's search results, built to the Figma frame and fed by the mocked
 * matching endpoint.
 *
 * ## What the screen is honest about
 *
 * **The screen says so on arrival.** `MockedDataNotice` is the first thing under
 * the header, because a screen showing three ratings, three distances and a
 * "22 mins" average looks exactly like one showing real ones — and that is
 * precisely how a fixture gets mistaken for a feature. It does not need anybody
 * to be careless; it needs one screenshot.
 *
 * Everything on it is still a literal. The header says it searched for a plumber
 * and found 24, and neither is true: there is no search, no index of technicians,
 * no geolocation and no way to sort by distance. The payload is in a Laravel
 * controller, and `MockedCustomerEndpointsTest` pins it field by field.
 *
 * The one thing this screen still does *not* do is present a fabricated ranking as
 * a result. The design opens on its "AI Best Match" chip with one card badged
 * `AI BEST MATCH`; that state is drawn, and the sort chips are real buttons with
 * `aria-pressed` that do not sort. See {@link FilterChips}.
 *
 * ## What the screen composes and the endpoint does not send
 *
 * The rule throughout: **the back end sends structured values and this file
 * decides what a sentence looks like.** Three of them are worth naming:
 *
 * - `trade` and `years_experience` arrive separately and the card joins them with
 *   the design's bullet, because a bullet character in a payload is a rendering
 *   decision four front ends should each spell their own way.
 * - `found_count` arrives as the number 24 and the screen turns it into
 *   "24 Found", because the word "Found" is this design's.
 * - `is_today`-style flags arrive as flags, never as the words they stand for.
 *
 * The inverse is also true and matters just as much: the badge says
 * `AI BEST MATCH` and the endpoint sends `best_match: true`, so the screen never
 * decides *which* card is the best one, and a fixture cannot badge a card the
 * back end did not badge.
 */
export function MatchingResults({
    loadMatching,
}: {
    loadMatching: () => Promise<Matching>
}) {
    const matching = useMockedResource(loadMatching, 'matching')

    return <MatchingResultsScreen matching={matching} />
}

/**
 * The screen, given its state.
 *
 * Split from the fetching for the reason `LiveTrackingScreen` is: an effect never
 * runs under `renderToStaticMarkup`, so a screen that only exists as a hook can
 * never be shown its ready state in a test. Taking the state as a prop makes the
 * three of them plain objects.
 */
export function MatchingResultsScreen({
    matching,
}: {
    matching: MockedResource<Matching>
}) {
    return (
        <div className={`flex min-h-screen flex-col ${GROUND} ${JAKARTA_FONT_CLASS}`}>
            <header
                className={`sticky top-0 z-10 border-b border-[#E6E9F2] bg-[#F9F9FF]/95 backdrop-blur dark:border-[#243350] dark:bg-[#0B1220]/95`}
            >
                <div className="mx-auto flex w-full max-w-md items-center gap-4 px-5 py-4">
                    <BackButton />

                    <div className="min-w-0">
                        <p
                            className={`text-[11px] font-bold tracking-widest ${ACCENT_TEXT}`}
                        >
                            SEARCH &amp; MATCH
                        </p>
                        {/*
                         * The heading names the query, so it cannot render before
                         * the payload arrives — there is no query to name. It is
                         * therefore absent while loading rather than a placeholder
                         * reading "Plumber", which would be a screen asserting a
                         * search for something it has not been told about.
                         */}
                        {matching.status === 'ready' && (
                            <h1
                                className={`truncate text-xl font-bold tracking-tight ${INK}`}
                            >
                                {matching.data.query} Search &amp; Matching
                            </h1>
                        )}
                    </div>
                </div>
            </header>

            <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 py-5">
                <MockedDataNotice detail="These three technicians were not matched to anything. No search ran, the sort chips below change nothing, and the list is in the order the back end wrote it." />

                {matching.status === 'loading' && (
                    <p role="status" className={`text-sm ${INK_SOFT}`}>
                        Loading matches…
                    </p>
                )}

                {matching.status === 'failed' && (
                    <p role="status" className={`text-sm ${INK_SOFT}`}>
                        Matches could not be loaded. {matching.message}
                    </p>
                )}

                {matching.status === 'ready' && (
                    <Matches matching={matching.data} />
                )}
            </main>
        </div>
    )
}

/**
 * Everything below the header, given a resolved payload.
 *
 * Separate from `MatchingResultsScreen` so the three states are the screen's and
 * the layout is this function's: a test can render a payload with no effect, and
 * a screen can be shown its loading sentence without a payload to go with it.
 */
function Matches({ matching }: { matching: Matching }) {
    return (
        <>
            <QueryFeedback matching={matching} />
            <FilterChips filters={matching.filters} />
            <RecommendationPanel matching={matching} />

            <section className="mt-2 flex flex-col gap-3.5">
                <div className="flex items-center justify-between gap-3">
                    <h2 className={`text-lg font-bold ${INK}`}>
                        Available Specialists
                    </h2>
                    {/*
                     * "Live Sorting" is the design's, and it is the one string on
                     * this screen the endpoint makes less true rather than more:
                     * the list is not sorted by anything and never changes. It is
                     * kept because the frame specifies it and because removing a
                     * design's label is a product decision, and it is in the
                     * claims record for exactly that reason.
                     */}
                    <span className={`text-xs font-semibold ${ACCENT_TEXT}`}>
                        Live Sorting
                    </span>
                </div>

                <div className="flex flex-col gap-4">
                    {matching.technicians.map((technician) => (
                        <WorkerCard
                            key={technician.id}
                            technician={technician}
                        />
                    ))}
                </div>
            </section>

            <TrustFooter />
        </>
    )
}

/**
 * The header's back control, shared with the booking screen.
 *
 * A `<button>` and not an anchor: on a static export each route is a separate
 * document, so a person who typed this address has no history to return to. See
 * the booking screen's `BackButton` for the full argument.
 */
function BackButton() {
    return (
        <button
            type="button"
            aria-label="Back to the dashboard"
            className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3FF] text-[#141B2B] hover:bg-[#E4E8FA] dark:bg-[#1A2438] dark:text-[#EDF0FF] dark:hover:bg-[#232F49] ${APPLE_PRESS}`}
        >
            <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
        </button>
    )
}

/**
 * The query echo, the result count, and the area the matching is said to run in.
 *
 * "AI matching active in Sector 48, Gurugram" is the claim worth pausing on. It
 * says an automated system is *currently* running, in a named place, for a person
 * looking at this screen. There is no matcher, no location on any model, and no
 * scheduled work of any kind in this repository. It is a live-looking status line
 * describing a system that does not exist — the single most misleading element in
 * the customer's flow, which is why it is near the top of the claims record rather
 * than buried in it.
 *
 * The area is the endpoint's `area` field, so the sentence's *shape* is this
 * screen's while the place in it came from the back end. A different area would
 * print a different sentence; an area the endpoint did not send would print
 * nothing, because this screen does not keep one to fall back on.
 */
function QueryFeedback({ matching }: { matching: Matching }) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className={`text-base font-semibold ${INK}`}>
                    Searching for “{matching.query}”
                </p>
                <p className={`text-sm font-bold ${ACCENT_TEXT}`}>
                    {matching.found_count} Found
                </p>
            </div>
            <p className={`text-xs ${INK_SOFT}`}>
                AI matching active in {matching.area}
            </p>
        </div>
    )
}

/**
 * The four sort chips.
 *
 * **They do not sort.** There is one list and it is the same list whichever chip
 * is pressed, and there is no matcher behind "Near Me" — no geolocation, no
 * address, no distance. So they are buttons carrying the design's one selected
 * state and nothing else.
 *
 * That is a real gap and not a rounding error, which is why it is here rather
 * than quietly omitted: three of the four chips each assert something about a set
 * of technicians this repository does not have. "AI Best Match" in particular —
 * the one drawn selected, and therefore the one the screen opens on — is a claim
 * about a ranking no code here computes. All four are in
 * `UNSUPPORTED_CUSTOMER_CLAIMS`.
 *
 * `aria-pressed` rather than a visual fill, because the selected chip is the
 * screen's *initial state*: a person arriving needs to know the results are
 * already ordered by something, and colour alone says nothing to anybody who
 * cannot see it.
 *
 * ## The chips arrive from the endpoint and still do nothing
 *
 * `filters` is sent rather than kept in this file so that the inertness is
 * visible in one place: a server is offering to sort these results, and the list
 * is in the order the server wrote it. `MockedCustomerEndpointsTest` sends each
 * chip as a query parameter and asserts the response is byte-identical, so the
 * day sorting starts working this file has to change too.
 */
function FilterChips({ filters }: { filters: Matching['filters'] }) {
    return (
        <div
            role="group"
            aria-label="Sort results"
            className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-1"
        >
            {filters.map((filter, index) => (
                <button
                    key={filter.id}
                    type="button"
                    aria-pressed={index === 0}
                    className={[
                        'shrink-0 snap-start rounded-full px-3.5 py-2 text-xs font-semibold',
                        index === 0 ? CHIP_ON : CHIP_OFF,
                        APPLE_PRESS,
                    ].join(' ')}
                >
                    {filter.label}
                </button>
            ))}
        </div>
    )
}

/**
 * The dark hero panel: the recommendation sentence and the two figures.
 *
 * Dark in a light design, like the price card, and for the same reason — it is
 * the one place the screen makes an argument rather than presenting a list, and
 * inverting it is how the design says "this is the recommendation".
 *
 * The two stat tiles are translucent white over the teal, so the panel's colour
 * shows through. The two figures are the most quantitative claims on the screen
 * and neither is computed: there is no arrival-time model, no distance matrix and
 * no price range. A customer could reasonably book on "22 mins".
 *
 * **The panel's heading and the units are this screen's.** The endpoint sends
 * `average_arrival_minutes: 22` and a `MoneyRange`, and this file decides that
 * the first is "22 mins" and the second is "₹350 – ₹500" — the words "mins" and
 * the range's dash are rendering decisions, and putting them in a controller
 * would choose them for four front ends.
 */
function RecommendationPanel({ matching }: { matching: Matching }) {
    return (
        <section
            className={`relative overflow-hidden rounded-2xl p-5 ${DEEP}`}
        >
            <div className="relative z-10 flex flex-col gap-3">
                <h2 className="text-lg font-bold text-[#F9F9FF]">
                    Smart Recommendation
                </h2>
                <p className="text-sm leading-6 text-[#C9DED9] dark:text-[#A8C6BF]">
                    {matching.summary}
                </p>

                <div className="mt-1 grid grid-cols-2 gap-2.5">
                    <StatTile
                        label="AVG. ARRIVAL"
                        value={`${matching.average_arrival_minutes} mins`}
                    />
                    <StatTile
                        label="EST. COST"
                        value={formatMoneyRange(matching.estimated_cost)}
                    />
                </div>
            </div>
        </section>
    )
}

/** One figure in the hero panel, on a translucent card. */
function StatTile({ label, value }: { label: string; value: string }) {
    return (
        <div
            className="rounded-xl bg-white/10 p-3 backdrop-blur-sm ring-1 ring-white/10"
        >
            <p className="text-[10px] font-bold tracking-widest text-[#84BAAF]">
                {label}
            </p>
            <p className="mt-0.5 text-base font-bold text-[#F9F9FF]">{value}</p>
        </div>
    )
}

/**
 * One technician.
 *
 * The `AI BEST MATCH` badge is a pinned overlay on the design, drawn in the
 * design's mint on its deepest green. It is the badge most likely to be wrong
 * even in spirit: it asserts that a ranking was computed and that this person won
 * it. It is rendered because the design specifies it, **and it is rendered only
 * when the endpoint flagged this technician rather than when the card happens to
 * be the first one**, which is what makes the flag worth sending.
 *
 * The call button is drawn beside the action on the card that is badged, and it
 * calls nothing — no worker carries a telephone number anywhere in this
 * repository. It is a real button rather than a `tel:` link precisely because a
 * `tel:` link would put a fabricated number into the OS dialler, which is a
 * person-visible failure this screen can avoid.
 *
 * ## The action is derived, not sent
 *
 * The endpoint sends `availability.available_now` and the design's two buttons
 * read "Book Now" and "View Profile". It does not send which one, and that is the
 * right way round: sending "Book Now" would put a UI decision in a controller, and
 * deriving it here means the flag and the button cannot disagree. The mapping is
 * one line and is exported so the pairing is testable on its own — a card whose
 * availability said "Available Now" while its button read "View Profile" is the
 * bug this prevents, and that is far easier to assert on a string than on a card.
 */
function WorkerCard({ technician }: { technician: MatchResult }) {
    const action = actionFor(technician)

    return (
        <article className={`relative flex flex-col gap-3 p-4 ${CARD}`}>
            {technician.best_match && (
                <span
                    className={`absolute -top-2 right-3 rounded-full bg-[#00332D] px-2.5 py-1 text-[10px] font-bold tracking-widest ${MINT} dark:bg-[#6FFBBE] dark:text-[#04231F]`}
                >
                    AI BEST MATCH
                </span>
            )}

            <div className="flex items-start gap-3">
                <span
                    aria-hidden="true"
                    className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#F1F3FF] text-lg font-bold text-[#707976] dark:bg-[#1A2438] dark:text-[#94A3B8]"
                >
                    {technician.name.charAt(0)}
                </span>

                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className={`truncate ${INK}`}>
                                <span className="text-base font-bold">
                                    {technician.name}
                                </span>
                            </h3>
                            <p className={`truncate text-xs ${INK_SOFT}`}>
                                {summarise(technician)}
                            </p>
                        </div>

                        <div className="shrink-0 text-right">
                            <p
                                className={`text-lg font-extrabold ${
                                    technician.best_match
                                        ? 'text-[#00332D] dark:text-[#6FFBBE]'
                                        : INK
                                }`}
                            >
                                {formatMoney(
                                    technician.base_fee,
                                    technician.currency,
                                )}
                            </p>
                            <p className={`text-[10px] ${INK_SOFT}`}>
                                Base Fee
                            </p>
                        </div>
                    </div>

                    <p
                        className={`mt-1.5 flex flex-wrap items-center gap-1.5 text-xs ${INK_SOFT}`}
                    >
                        <span className={`font-semibold ${INK}`}>
                            {formatRating(technician.rating)}
                        </span>
                        <span className="text-[#707976] dark:text-[#64748B]">
                            ({formatCount(technician.review_count)})
                        </span>
                        <span
                            aria-hidden="true"
                            className="text-[#BFC8C5] dark:text-[#475569]"
                        >
                            •
                        </span>
                        <span>{formatDistance(technician.distance_km)}</span>
                    </p>
                </div>
            </div>

            <div
                className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ${
                    technician.best_match
                        ? 'bg-[#F1F3FF] dark:bg-[#16213A]'
                        : 'bg-transparent'
                }`}
            >
                {/*
                 * The design dims the row that cannot be acted on, and it did that
                 * by reading the *label* — "Available: Today, 4:00 PM" begins with
                 * "Available:", and any other wording would have flipped the
                 * emphasis. This reads the flag instead, so a screen cannot end up
                 * asserting availability from an English string it was sent.
                 */}
                <span
                    className={
                        technician.availability.available_now
                            ? `truncate text-xs font-semibold ${ACCENT_TEXT}`
                            : `truncate text-xs ${INK_SOFT}`
                    }
                >
                    {technician.availability.label}
                </span>

                <div className="flex shrink-0 items-center gap-2">
                    {technician.best_match && (
                        <CallButton name={technician.name} />
                    )}
                    <button
                        type="button"
                        className={[
                            'rounded-xl px-4 py-2.5 text-xs font-bold',
                            action === 'View Profile'
                                ? 'bg-[#293040] text-[#EDF0FF] hover:bg-[#1F2634] dark:bg-[#293040] dark:text-[#EDF0FF]'
                                : 'bg-[#00332D] text-white hover:bg-[#002520] dark:bg-[#6FFBBE] dark:text-[#04231F]',
                            APPLE_PRESS,
                        ].join(' ')}
                    >
                        {action}
                    </button>
                </div>
            </div>
        </article>
    )
}

/**
 * The card's one-line summary: "Master Plumber • 12 yrs exp".
 *
 * **Composed here rather than sent, and the separator is the reason.** The
 * endpoint sends `trade` and `years_experience` separately because both are facts
 * and the join is presentation: four front ends would each want to spell "yrs exp"
 * and choose their own bullet. Joining them in a controller would have put a
 * bullet character into a payload, where it is a fact about a person's job
 * description.
 */
function summarise({ trade, years_experience }: MatchResult): string {
    return `${trade} • ${years_experience} yrs exp`
}

/**
 * What a card's button offers to do, from whether the technician is available.
 *
 * Available now means "Book Now"; anything else means "View Profile", because the
 * design's second card shows a technician who is not free and offers her profile
 * instead of pretending she can be taken.
 *
 * Exported and named so the pairing can be asserted directly. The alternative —
 * asserting that a rendered card shows the right word — passes exactly as well
 * when the two agree together, and is much harder to make fail when they do not.
 */
export function actionFor(technician: MatchResult): 'Book Now' | 'View Profile' {
    return technician.availability.available_now ? 'Book Now' : 'View Profile'
}

/** The design's telephone control. Calls nothing; see {@link WorkerCard}. */
function CallButton({ name }: { name: string }) {
    return (
        <button
            type="button"
            aria-label={`Call ${name}`}
            className={`flex size-10 items-center justify-center rounded-xl bg-[#E9EDFF] text-[#00332D] hover:bg-[#DCE2FB] dark:bg-[#1A2438] dark:text-[#6FFBBE] dark:hover:bg-[#232F49] ${APPLE_PRESS}`}
        >
            <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0122 16.92z" />
            </svg>
        </button>
    )
}

/**
 * The warranty banner.
 *
 * **An insurance promise, and the one claim here that is not a placeholder.** A
 * person may rely on cover when something goes wrong — a ₹10,000 limit is a real
 * number, and "every service is insured" is a statement about a policy. Nothing
 * in this repository underwrites anything: there is no insurer, no policy, no
 * claims process and no terms.
 *
 * It is rendered because the design specifies it, and it is the second entry in
 * the module docblock's "cut these first" list. It is also the one claim here
 * that a customer could act on and be harmed by, which is why the test that
 * guards the record names it explicitly rather than leaving it in a list of
 * thirty-five.
 */
function TrustFooter() {
    return (
        <section className={`mt-2 flex items-start gap-3 p-4 ${TRUST_FOOT}`}>
            <span
                aria-hidden="true"
                className={`flex size-9 shrink-0 items-center justify-center rounded-full bg-white ${ACCENT_TEXT}`}
            >
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
            </span>

            <div className="min-w-0">
                <p className={`text-sm font-bold ${INK}`}>
                    FixMate 30-Day Work Warranty
                </p>
                <p className={`text-xs leading-5 ${INK_SOFT}`}>
                    Every service is insured up to ₹10,000 for damages.
                </p>
            </div>
        </section>
    )
}
