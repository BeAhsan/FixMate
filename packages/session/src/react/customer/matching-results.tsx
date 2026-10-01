'use client'

import { APPLE_PRESS } from '@fixmate/ui'
import { MOCK_MATCHES, MOCK_SEARCH } from './mock-data'
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

/**
 * The customer's search results, built to the Figma frame.
 *
 * The three screens of the customer flow share this file's siblings; the shape of
 * the mocks and the honesty record are in `mock-data.ts`.
 *
 * ## What the screen is honest about
 *
 * The header says it searched for a plumber and found 24. Neither is true: there
 * is no search, no index of technicians, no geolocation and no way to sort by
 * distance. Every figure on this screen — the count, the 22-minute average
 * arrival, the ₹350–₹500 range, the three distances, the ratings, the review
 * counts — is a literal in a mock module. All of them are in
 * `UNSUPPORTED_CUSTOMER_CLAIMS`.
 *
 * The one thing this screen does *not* do is present a fabricated ranking as a
 * result. The design opens on its "AI Best Match" chip with one card badged
 * `AI BEST MATCH`; that state is drawn, and the sort chips are real buttons with
 * `aria-pressed` that do not sort. See {@link FilterChips}.
 */
export function MatchingResults() {
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
                        <h1
                            className={`truncate text-xl font-bold tracking-tight ${INK}`}
                        >
                            {MOCK_SEARCH.query} Search &amp; Matching
                        </h1>
                    </div>
                </div>
            </header>

            <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 py-5">
                <QueryFeedback />
                <FilterChips />
                <RecommendationPanel />

                <section className="mt-2 flex flex-col gap-3.5">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className={`text-lg font-bold ${INK}`}>
                            Available Specialists
                        </h2>
                        <span className={`text-xs font-semibold ${ACCENT_TEXT}`}>
                            Live Sorting
                        </span>
                    </div>

                    <div className="flex flex-col gap-4">
                        {MOCK_MATCHES.map((m) => (
                            <WorkerCard key={m.id} match={m} />
                        ))}
                    </div>
                </section>

                <TrustFooter />
            </main>
        </div>
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
 * the customer's flow, which is why it is the second entry in the claims record
 * rather than buried in it.
 */
function QueryFeedback() {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className={`text-base font-semibold ${INK}`}>
                    {MOCK_SEARCH.searchingFor}
                </p>
                <p className={`text-sm font-bold ${ACCENT_TEXT}`}>
                    {MOCK_SEARCH.found}
                </p>
            </div>
            <p className={`text-xs ${INK_SOFT}`}>
                AI matching active in {MOCK_SEARCH.area}
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
 * about a ranking no code here computes. All four are recorded in
 * `UNSUPPORTED_CUSTOMER_CLAIMS`.
 *
 * `aria-pressed` rather than a visual fill, because the selected chip is the
 * screen's *initial state*: a person arriving needs to know the results are
 * already ordered by something, and colour alone says nothing to anybody who
 * cannot see it.
 */
function FilterChips() {
    return (
        <div
            role="group"
            aria-label="Sort results"
            className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-1"
        >
            {MOCK_SEARCH.filters.map((filter) => (
                <button
                    key={filter.label}
                    type="button"
                    aria-pressed={filter.selected}
                    className={[
                        'shrink-0 snap-start rounded-full px-3.5 py-2 text-xs font-semibold',
                        filter.selected ? CHIP_ON : CHIP_OFF,
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
 */
function RecommendationPanel() {
    return (
        <section
            className={`relative overflow-hidden rounded-2xl p-5 ${DEEP}`}
        >
            <div className="relative z-10 flex flex-col gap-3">
                <h2 className="text-lg font-bold text-[#F9F9FF]">
                    Smart Recommendation
                </h2>
                <p className="text-sm leading-6 text-[#C9DED9] dark:text-[#A8C6BF]">
                    {MOCK_SEARCH.recommendation}
                </p>

                <div className="mt-1 grid grid-cols-2 gap-2.5">
                    <StatTile
                        label="AVG. ARRIVAL"
                        value={MOCK_SEARCH.avgArrival}
                    />
                    <StatTile
                        label="EST. COST"
                        value={MOCK_SEARCH.estimatedCost}
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
 * even in spirit: it asserts that a ranking was computed and that this person
 * won it. It is rendered because the design specifies it, and it is in the
 * claims record.
 *
 * The call button is drawn beside the action on the two cards that have one, and
 * it calls nothing — no worker carries a telephone number anywhere in this
 * repository. It is a real button rather than a `tel:` link precisely because a
 * `tel:` link would put a fabricated number into the OS dialler, which is a
 * person-visible failure this screen can avoid.
 */
function WorkerCard({
    match,
}: {
    match: (typeof MOCK_MATCHES)[number]
}) {
    return (
        <article className={`relative flex flex-col gap-3 p-4 ${CARD}`}>
            {match.bestMatch && (
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
                    {match.name.charAt(0)}
                </span>

                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className={`truncate ${INK}`}>
                                <span className="text-base font-bold">
                                    {match.name}
                                </span>
                            </h3>
                            <p className={`truncate text-xs ${INK_SOFT}`}>
                                {match.summary}
                            </p>
                        </div>

                        <div className="shrink-0 text-right">
                            <p
                                className={`text-lg font-extrabold ${
                                    match.bestMatch
                                        ? 'text-[#00332D] dark:text-[#6FFBBE]'
                                        : INK
                                }`}
                            >
                                {match.baseFee}
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
                            {match.rating}
                        </span>
                        <span className="text-[#707976] dark:text-[#64748B]">
                            {match.reviews}
                        </span>
                        <span
                            aria-hidden="true"
                            className="text-[#BFC8C5] dark:text-[#475569]"
                        >
                            •
                        </span>
                        <span>{match.distance}</span>
                    </p>
                </div>
            </div>

            <div
                className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ${
                    match.bestMatch
                        ? 'bg-[#F1F3FF] dark:bg-[#16213A]'
                        : 'bg-transparent'
                }`}
            >
                <span
                    className={
                        match.availability.startsWith('Available:')
                            ? `truncate text-xs ${INK_SOFT}`
                            : `truncate text-xs font-semibold ${ACCENT_TEXT}`
                    }
                >
                    {match.availability}
                </span>

                <div className="flex shrink-0 items-center gap-2">
                    {match.bestMatch && <CallButton name={match.name} />}
                    <button
                        type="button"
                        className={[
                            'rounded-xl px-4 py-2.5 text-xs font-bold',
                            match.action === 'View Profile'
                                ? 'bg-[#293040] text-[#EDF0FF] hover:bg-[#1F2634] dark:bg-[#293040] dark:text-[#EDF0FF]'
                                : 'bg-[#00332D] text-white hover:bg-[#002520] dark:bg-[#6FFBBE] dark:text-[#04231F]',
                            APPLE_PRESS,
                        ].join(' ')}
                    >
                        {match.action}
                    </button>
                </div>
            </div>
        </article>
    )
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
