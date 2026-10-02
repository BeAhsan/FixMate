'use client'

import type { Discovery, LiveTracking, TrackingStage } from '@fixmate/api-client'
import { APPLE_PRESS } from '@fixmate/ui'
import { usePathname } from 'next/navigation'
import { MockedDataNotice } from './mocked-data-notice'
import { formatCount, formatMoneyFrom, formatRating } from './money'
import { MOCK_TRUST_BADGES } from './mock-data'
import { TabBar } from './tab-bar'
import { JAKARTA_FONT_CLASS } from './typeface'
import {
    ACCENT_TEXT,
    ACTION,
    AMBER_TEXT,
    CARD,
    DEEP,
    GROUND,
    INK,
    INK_SOFT,
} from './tokens'
import { useMockedResource, type MockedResource } from './use-mocked-resource'

/**
 * The customer's dashboard, built to the Figma frame.
 *
 * ## What is real on this screen
 *
 * `accountName`. The session knows who signed in, and the design greets somebody
 * by name, so the real name wins whenever there is one.
 *
 * ## Two of the mocked sections are now endpoints
 *
 * The job card reads `GET /users/tracking` and the categories and the featured
 * technicians read `GET /users/discovery`, both handed in as loaders so this file
 * imports no client and each section's three states can be rendered from plain
 * objects. **What the endpoints return is still a literal** — no price was
 * computed, nobody was ranked, nobody is moving — so the screen carries the same
 * `MockedDataNotice` the other mocked screens do.
 *
 * What stays local is `MOCK_TRUST_BADGES`, and it stays local because it is
 * marketing copy rather than a resource: "Verified Mistris", "Transparent Pricing"
 * and "Job Tracking" are sentences about the business, there is nothing behind
 * them to fetch, and an endpoint returning three strings would be a network round
 * trip to deliver constants. Their claims are in `UNSUPPORTED_CUSTOMER_CLAIMS` in
 * mock-data.ts.
 *
 * ## Two sections, one request
 *
 * Both sections read the same endpoint, so `CustomerDashboard` fetches **once** and
 * hands the same resource to both. Two `useMockedResource` calls would have been
 * two requests for one payload, and the two sections would then be able to
 * disagree about whether the endpoint works — a screen showing categories beside a
 * carousel that says it could not be loaded.
 *
 * ## Why this is not wrapped in `ApplicationShell`
 *
 * The shared shell draws its own header and a wrapping navigation. This screen
 * draws a header too — a greeting, the signed-in person's name, a location, and a
 * tab bar — and two headers on one page is not a design, it is a mistake. So this
 * screen replaces the shell rather than nesting inside it.
 *
 * That is also why it lives in `packages/session` and not in the application:
 * `FrontEndApplicationsTest` fails any `<header` written under an application's
 * `app/`, because that is the shape a copied shell takes. A designed screen with
 * its own header cannot live there.
 */
export interface CustomerDashboardProps {
    accountName?: string | null
    location?: string | null
    /**
     * The mocked tracking endpoint, handed over rather than called here.
     *
     * The job card on this screen is one of the two parts that had an endpoint to
     * read, so it reads one.
     */
    loadTracking?: () => Promise<LiveTracking>
    /** The mocked discovery endpoint, behind the categories and the carousel. */
    loadDiscovery?: () => Promise<Discovery>
}

export function CustomerDashboard({
    accountName,
    location,
    loadTracking,
    loadDiscovery,
}: CustomerDashboardProps) {
    const pathname = usePathname()
    const tracking = useMockedResource(
        loadTracking ?? UNREACHABLE_TRACKING,
        'dashboard-tracking',
    )
    const discovery = useMockedResource(
        loadDiscovery ?? UNREACHABLE_DISCOVERY,
        'dashboard-discovery',
    )

    return (
        <CustomerDashboardScreen
            accountName={accountName}
            location={location}
            pathname={pathname}
            tracking={tracking}
            discovery={discovery}
        />
    )
}

/**
 * What a section does when the caller supplied no loader.
 *
 * Rejected promises rather than constants, and the distinction matters: these are
 * the only parts of the screen that can fail, and a screen whose failure path was
 * unreachable would be a screen whose failure path was never written.
 * `describeResourceFailure` turns the rejection into the ordinary sentence, so a
 * section shows its message like any other and a caller who forgot the loader sees
 * a missing section rather than a silent `undefined` in the middle of the layout.
 *
 * Two functions rather than one shared, because the messages name what was
 * missing. A caller who wired tracking and forgot discovery is told discovery was
 * not supplied, which is a sentence that says what to do next.
 */
const UNREACHABLE_TRACKING = () =>
    Promise.reject(new Error('The dashboard was rendered without a tracking loader.'))

const UNREACHABLE_DISCOVERY = () =>
    Promise.reject(new Error('The dashboard was rendered without a discovery loader.'))

/**
 * The screen, given its tracking state and its path.
 *
 * Split from the fetching for the same reason `LiveTrackingScreen` is: an effect
 * never runs under `renderToStaticMarkup`, so a screen that only exists as a hook
 * cannot be shown its resolved state in a test. `pathname` comes in as a prop too
 * because `usePathname` needs Next's router context, which a static render does
 * not have — so passing it makes this renderable, and passing it makes the tab bar
 * testable at a chosen path rather than at whatever the router happens to say.
 */
export function CustomerDashboardScreen({
    accountName,
    location,
    pathname,
    tracking,
    discovery,
}: {
    accountName?: string | null
    location?: string | null
    pathname: string
    tracking: MockedResource<LiveTracking>
    discovery: MockedResource<Discovery>
}) {
    return (
        <div
            className={`flex min-h-screen flex-col ${GROUND} ${JAKARTA_FONT_CLASS}`}
        >
            <header
                className={`sticky top-0 z-10 border-b border-[#EDF1F5] bg-[#FBFCFC]/95 backdrop-blur dark:border-[#243350] dark:bg-[#0B1220]/95`}
            >
                <div className="mx-auto w-full max-w-md px-5 py-4">
                    <p className={`text-xs font-semibold ${INK_SOFT}`}>
                        Good morning
                    </p>
                    <h1
                        className={`truncate text-2xl font-extrabold tracking-tight ${INK}`}
                    >
                        Hi, {accountName ?? 'Aarav'}
                    </h1>

                    <p
                        className={`mt-1.5 flex items-center gap-1.5 text-sm ${INK_SOFT}`}
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                            className="shrink-0"
                        >
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                            <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span className="truncate">
                            {location ?? 'Koramangala, Bengaluru'}
                        </span>
                    </p>
                </div>
            </header>

            <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-5 pb-24">
                <MockedDataNotice />
                <SearchAndPrompt />
                <PriceEstimator />
                <Categories categories={discovery} />
                <TopRated technicians={discovery} />
                <ActiveJobCard tracking={tracking} />
                <TrustBanner />
            </main>

            <TabBar currentPath={pathname} />
        </div>
    )
}

/**
 * The search field and the AI prompt, as one section.
 *
 * The field is `readOnly` and the prompt is a `<button>`, deliberately: there is
 * no search — no index, no endpoint, no results route other than the mocked one
 * at `/matching-results/`. A field that accepted typing would be a form with
 * nowhere to submit to, and the honest version of "type a trade and see who is
 * available" is a field that cannot be typed into.
 *
 * The prompt text is a fixed sentence rather than a placeholder for the same
 * reason. The design draws it as an example, and it is drawn as an example.
 */
function SearchAndPrompt() {
    return (
        <section className="flex flex-col gap-2.5">
            <div
                className={`flex items-center gap-2.5 rounded-2xl px-4 py-3 ${CARD}`}
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
                    className={`shrink-0 ${INK_SOFT}`}
                >
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                    readOnly
                    aria-label="Search for a service — not yet available"
                    placeholder="Search for plumber, electrician..."
                    className={`w-full bg-transparent text-sm outline-none placeholder:${INK_SOFT} ${INK}`}
                />
            </div>

            <button
                type="button"
                className={`flex items-center justify-between gap-3 rounded-2xl bg-[#F1F3FF] px-4 py-2.5 text-left text-xs text-[#404946] ring-1 ring-[#E2E8F0] hover:bg-[#E4E8FA] dark:bg-[#16213A] dark:text-[#A8C6BF] dark:ring-[#243350] dark:hover:bg-[#1B2942] ${APPLE_PRESS}`}
            >
                <span className="truncate">
                    “Help me find a plumber for a leaky sink...”
                </span>
                <span
                    className={`shrink-0 text-[10px] font-bold tracking-widest ${ACCENT_TEXT}`}
                >
                    ASK AI
                </span>
            </button>
        </section>
    )
}

/**
 * The estimator banner.
 *
 * "INSTANT" and "Describe your problem & get an instant price estimate before you
 * book" both promise a working estimator. There is no estimator: no model, no
 * endpoint, no image upload, and the price the booking screen shows is a literal.
 * Both claims are in the record.
 *
 * The banner is the design's only rounded-2xl-plus surface at this width and it
 * is drawn on the pale amber the design specifies, with a soft glow in the corner
 * — an accent rather than a card, which is why it has no ring.
 */
function PriceEstimator() {
    return (
        <section
            className="relative overflow-hidden rounded-3xl bg-[#FEF9EC] p-5 ring-1 ring-[#FDEBC8] dark:bg-[#241E0E] dark:ring-[#3D3313]"
        >
            <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-6 -top-8 size-28 rounded-full bg-[#FEF3C7] opacity-70 blur-2xl dark:bg-[#4A3C12] dark:opacity-40"
            />

            <div className="relative flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                    <h2 className={`text-lg font-bold ${INK}`}>
                        AI Price Estimator
                    </h2>
                    <span
                        className="rounded-full bg-[#FEF3C7] px-2.5 py-1 text-[10px] font-bold tracking-widest text-[#92400E] dark:bg-[#4A3C12] dark:text-[#FDE68A]"
                    >
                        INSTANT
                    </span>
                </div>

                <p className={`text-sm leading-5 ${INK_SOFT}`}>
                    Describe your problem &amp; get an instant price estimate
                    before you book.
                </p>

                <div className="mt-1.5 grid grid-cols-2 gap-2.5">
                    <button
                        type="button"
                        className={`rounded-xl bg-white px-3 py-2.5 text-xs font-bold text-[#141B2B] ring-1 ring-[#E2E8F0] hover:bg-[#F8FAFC] dark:bg-[#16213A] dark:text-[#EDF0FF] dark:ring-[#243350] dark:hover:bg-[#1B2942] ${APPLE_PRESS}`}
                    >
                        Describe Issue
                    </button>
                    <button
                        type="button"
                        className={`rounded-xl px-3 py-2.5 text-xs font-bold ${ACTION} ${APPLE_PRESS}`}
                    >
                        Upload Photo
                    </button>
                </div>
            </div>
        </section>
    )
}

/**
 * The three service categories.
 *
 * Each carries a "From ₹…" price, which is a real offer at a real number. None
 * of the three prices is derived from a rate card — there is no rate card — so
 * they are placeholders that read as commitments. They are in the record.
 *
 * The icons are letters rather than glyphs or images. The design draws pictograms
 * this repository has no assets for, and an emoji would render in a different
 * visual language on every platform; a letter in the design's own green reads as
 * a deliberate monogram instead of a missing icon.
 */
function Categories({ categories }: { categories: MockedResource<Discovery> }) {
    return (
        <section className="flex flex-col gap-3">
            <h2 className={`text-lg font-bold ${INK}`}>
                What do you need help with?
            </h2>

            <ResourceBlock resource={categories} label="the service categories">
                {(discovery) => (
                    <div className="grid grid-cols-3 gap-2.5">
                        {discovery.categories.map((category) => (
                            <button
                                key={category.id}
                                type="button"
                                className={`flex flex-col items-start gap-2 p-3.5 text-left ${CARD} ${APPLE_PRESS}`}
                            >
                                <span
                                    aria-hidden="true"
                                    className="flex size-9 items-center justify-center rounded-xl bg-[#E8F7F4] text-sm font-bold text-[#0F5B55] dark:bg-[#12332E] dark:text-[#6FFBBE]"
                                >
                                    {category.label.charAt(0)}
                                </span>
                                <span className={`text-sm font-bold ${INK}`}>
                                    {category.label}
                                </span>
                                <span className={`text-xs ${INK_SOFT}`}>
                                    {formatMoneyFrom(
                                        category.price_from,
                                        category.currency,
                                    )}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </ResourceBlock>
        </section>
    )
}

/**
 * The two featured technicians, in a horizontal scroller.
 *
 * A scroller and not a grid, because the design is a carousel and because the
 * number of featured technicians is not fixed — a third would scroll rather than
 * reflow, which is the behaviour the design implies.
 *
 * `See all` is a button rather than a link to `/matching-results/` on purpose.
 * That route *does* exist, and linking to it would be defensible — but it shows
 * a different screen for a different query, not a list of everybody, so a link
 * labelled "See all" would land on something that is not all of anything.
 */
function TopRated({ technicians }: { technicians: MockedResource<Discovery> }) {
    return (
        <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <h2 className={`text-lg font-bold ${INK}`}>
                    Top Rated Mistris near you
                </h2>
                <button
                    type="button"
                    className={`shrink-0 text-sm font-semibold ${ACCENT_TEXT}`}
                >
                    See all
                </button>
            </div>

            <ResourceBlock resource={technicians} label="the featured technicians">
                {(discovery) => (
                    <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1">
                        {discovery.featured_technicians.map((worker) => (
                            <article
                                key={worker.id}
                                className={`flex w-[168px] shrink-0 snap-start flex-col gap-2.5 p-3.5 ${CARD}`}
                            >
                                <div className="flex items-center gap-2.5">
                                    <span
                                        aria-hidden="true"
                                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] text-sm font-bold text-[#94A3B8] dark:bg-[#1A2438] dark:text-[#64748B]"
                                    >
                                        {worker.name.charAt(0)}
                                    </span>
                                    <div className="min-w-0">
                                        <p
                                            className={`truncate text-sm font-bold ${INK}`}
                                        >
                                            {worker.name}
                                        </p>
                                        <p
                                            className={`truncate text-xs ${INK_SOFT}`}
                                        >
                                            {worker.trade}
                                        </p>
                                    </div>
                                </div>

                                <p
                                    className={`flex items-center gap-1 text-xs font-semibold ${INK_SOFT}`}
                                >
                                    <span
                                        aria-hidden="true"
                                        className={AMBER_TEXT}
                                    >
                                        ★
                                    </span>
                                    <span className={INK}>
                                        {formatRating(worker.rating)}
                                    </span>
                                    <span aria-hidden="true">·</span>
                                    <span>
                                        {formatCount(worker.completed_jobs)}{' '}
                                        jobs
                                    </span>
                                </p>

                                <button
                                    type="button"
                                    className={`mt-auto w-full rounded-xl px-3 py-2 text-xs font-bold ${ACTION} ${APPLE_PRESS}`}
                                >
                                    Book
                                </button>
                            </article>
                        ))}
                    </div>
                )}
            </ResourceBlock>
        </section>
    )
}

/**
 * One section's three states: loading, failed, and the data.
 *
 * ## Why a shared block and not three copies
 *
 * The dashboard now reads two endpoints and draws three mocked sections, so the
 * loading and failure sentences would otherwise be written six times — and the
 * point of `MockedDataNotice` is that a mocked screen says so in the same words
 * everywhere. Two copies of that sentence is already one too many; the test that
 * checks the notice is present on every mocked screen is the thing that catches a
 * screen that forgot, and it cannot catch one that says it differently.
 *
 * `label` is what the failure sentence names, because "Something went wrong" on a
 * dashboard with two independently-failing sections tells a person nothing about
 * which part is missing. The reason itself is `resource.message`, which
 * `useMockedResource` has already turned into a sentence — this block must not
 * call `describeResourceFailure` again, because a second pass over an already
 * rewritten message would find no `ApiError` in it and replace every specific
 * answer with the generic one.
 *
 * The block renders no notice of its own. `MockedDataNotice` sits once at the top
 * of the screen because it is a statement about the screen, not about a section:
 * a reader who has scrolled past the top still needs to know, and four notices
 * down the page would be four chances to have written the sentence differently.
 */
function ResourceBlock<T>({
    resource,
    label,
    children,
}: {
    resource: MockedResource<T>
    label: string
    children: (data: T) => React.ReactNode
}) {
    if (resource.status === 'loading') {
        return (
            <p className={`text-sm ${INK_SOFT}`} role="status">
                Loading {label}…
            </p>
        )
    }

    if (resource.status === 'failed') {
        return (
            <p className={`text-sm ${INK_SOFT}`} role="status">
                {label} could not be loaded. {resource.message}
            </p>
        )
    }

    return <>{children(resource.data)}</>
}

/**
 * The job in progress, with the design's four-stage tracker.
 *
 * **The tracker is the most structurally misleading thing on this screen.** It is
 * a lifecycle — Accepted, On the way, Arriving now, Work completed — drawn at
 * whatever position the response says, and there is no job, no status column, no
 * driver location and no event that could move it. A person watching this will
 * believe somebody is travelling to them. `ETA 5 min` is the same claim in a
 * number.
 *
 * It is drawn because the design draws it, and reading it from
 * `GET /users/tracking` does not make it less misleading — the endpoint is a
 * fixture too. What reading it does fix is that the position is now
 * {@link reachedStage} over the response's own completion flags, rather than a
 * number typed into a mock beside the four names it described. Two things can
 * still be wrong here — the endpoint answering, and the flags agreeing with the
 * timestamps — and both are somewhere a test can reach. Before, the third was not:
 * the position and the stage names were separate constants that could contradict
 * each other and render as a perfectly well-formed tracker.
 *
 * The screen it is drawn on carries no example-data notice, and that is a real gap
 * rather than an oversight. The dedicated tracking screen does; this card does
 * not, because a notice above a section the size of a receipt would be a different
 * screen from the design's. The honest answer is that the card's claim is
 * carried by `LiveTrackingController`'s docblock and by `MockedCustomerEndpointsTest`,
 * and neither of those reaches somebody using the app — recorded here so the gap
 * is a decision somebody made and not one nobody noticed.
 *
 * The step markers carry their state in three ways, not one: fill, a tick for
 * passed stages, and weight on the label. The tick is the load-bearing one for a
 * screen-reader user, since fill alone is invisible to them; it is `aria-hidden`
 * because the label beside it is what gets read.
 */
function ActiveJobCard({ tracking }: { tracking: MockedResource<LiveTracking> }) {
    if (tracking.status === 'loading') {
        return (
            <section
                aria-label="Active job"
                className={`flex flex-col gap-4 p-5 ${CARD}`}
            >
                <p role="status" className={`text-sm ${INK_SOFT}`}>
                    Loading your active job…
                </p>
            </section>
        )
    }

    if (tracking.status === 'failed') {
        // **Rendered in place, not omitted.** A card that disappears is a card
        // somebody will not notice is missing, and the request really did fail.
        // The message is here so the failure is visible where the content was.
        return (
            <section
                aria-label="Active job"
                className={`flex flex-col gap-4 p-5 ${CARD}`}
            >
                <p className={`text-sm ${INK_SOFT}`}>{tracking.message}</p>
            </section>
        )
    }

    const { worker, service, location, stages, status } = tracking.data

    return (
        <section className={`flex flex-col gap-4 p-5 ${CARD}`}>
            <div className="flex items-center justify-between gap-3">
                <span
                    className="flex items-center gap-1.5 rounded-full bg-[#E8F7F4] px-2.5 py-1 text-xs font-bold text-[#114B43] dark:bg-[#12332E] dark:text-[#6FFBBE]"
                >
                    <span
                        aria-hidden="true"
                        className="size-1.5 rounded-full bg-[#10B981]"
                    />
                    Active Job
                </span>
                <span className={`text-xs font-semibold ${INK_SOFT}`}>
                    {`ETA ${location.eta_minutes} min`}
                </span>
            </div>

            {/*
              `status` is the back end's own word for the job's state, shown next
              to the technician. It is deliberately *not* "Active Job" — that pill
              above is this card's own heading, and rendering the same word twice
              would hide the one that can change.
            */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span
                        aria-hidden="true"
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] text-sm font-bold text-[#94A3B8] dark:bg-[#1A2438] dark:text-[#64748B]"
                    >
                        {worker.name.charAt(0)}
                    </span>
                    <div className="min-w-0">
                        <p className={`truncate text-sm font-bold ${INK}`}>
                            {worker.name}
                        </p>
                        <p className={`truncate text-xs ${INK_SOFT}`}>{service}</p>
                    </div>
                </div>

                <CallTechnician name={worker.name} />
            </div>

            <p className={`text-xs font-semibold uppercase tracking-wide ${INK_SOFT}`}>
                {status.replace(/_/g, ' ')}
            </p>

            <StageTracker stages={stages} />

            <button
                type="button"
                className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold ${ACCENT_TEXT} ${APPLE_PRESS}`}
            >
                View Details
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
            </button>
        </section>
    )
}

/**
 * The call button in the job card.
 *
 * A `<button>` and not a `tel:` anchor, and that is the whole point of it: no
 * worker carries a telephone number anywhere in this repository, so a `tel:` link
 * would hand a fabricated number to the operating system's dialler. A button
 * that does nothing is inert; a `tel:` link puts a wrong number in front of
 * somebody's phone.
 */
function CallTechnician({ name }: { name: string }) {
    return (
        <button
            type="button"
            aria-label={`Call ${name}`}
            className={`flex shrink-0 items-center gap-1.5 rounded-full bg-[#F0FBF8] px-3 py-2 text-xs font-semibold text-[#114B43] hover:bg-[#E3F5F0] dark:bg-[#12332E] dark:text-[#6FFBBE] dark:hover:bg-[#17403A] ${APPLE_PRESS}`}
        >
            <svg
                width="14"
                height="14"
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
            Call
        </button>
    )
}

/**
 * The four-stage tracker.
 *
 * A `<ol>` because the order *is* the information: it is a sequence, and a list of
 * four unlabelled spans would leave a screen-reader user with four identical items
 * and no way to know which came first. Each `<li>` carries its own state in
 * `aria-current="step"`, so the active stage is announced rather than implied by
 * colour.
 *
 * The connecting line is drawn as a background on the list rather than as separate
 * elements, because the design's three segments are one line in three states and
 * three elements would need to be kept in step with the four markers by hand.
 */
function StageTracker({ stages }: { stages: TrackingStage[] }) {
    const reached = reachedStage(stages)

    return (
        <ol className="relative flex items-start justify-between gap-1 pt-1">
            {stages.map((stage, index) => {
                const done = index < reached
                const active = index === reached
                const upcoming = index > reached

                return (
                    <li
                        key={stage.name}
                        aria-current={active ? 'step' : undefined}
                        className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center first:items-start first:text-left last:items-end last:text-right"
                    >
                        {/* The connector, drawn behind the markers. */}
                        {index < stages.length - 1 && (
                            <span
                                aria-hidden="true"
                                className={`absolute left-1/2 top-[9px] h-0.5 w-full ${
                                    done ? 'bg-[#114B43] dark:bg-[#2C6B60]' : 'bg-[#E2E8F0] dark:bg-[#243350]'
                                }`}
                            />
                        )}

                        <span
                            aria-hidden="true"
                            className={[
                                'relative z-10 flex size-5 items-center justify-center rounded-full',
                                done
                                    ? 'bg-[#114B43] dark:bg-[#2C6B60]'
                                    : active
                                      ? 'bg-[#114B43] ring-2 ring-white dark:bg-[#6FFBBE] dark:ring-[#111A2B]'
                                      : 'bg-[#E2E8F0] dark:bg-[#243350]',
                                upcoming ? '' : '',
                            ].join(' ')}
                        >
                            {done ? (
                                <svg
                                    width="11"
                                    height="11"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="text-white dark:text-[#04231F]"
                                >
                                    <path d="M20 6L9 17l-5-5" />
                                </svg>
                            ) : active ? (
                                <span className="size-1.5 rounded-full bg-white dark:bg-[#04231F]" />
                            ) : null}
                        </span>

                        <span
                            className={`text-[10px] leading-tight ${
                                active
                                    ? `font-bold ${INK}`
                                    : done
                                      ? `font-semibold ${INK_SOFT}`
                                      : INK_SOFT
                            }`}
                        >
                            {stage.name}
                        </span>
                    </li>
                )
            })}
        </ol>
    )
}

/**
 * Which stage the tracker is drawn at.
 *
 * The first stage the response has *not* completed — or the end, when every stage
 * is done, so a finished job reads as finished rather than as the last stage
 * still being approached.
 *
 * **This replaces `MOCK_ACTIVE_JOB.reached`, which was a number typed in beside
 * the four stage names it described.** The two could disagree with each other and
 * nothing would notice: moving `reached` to 2 would draw the third marker active
 * while the comment above it still said the design draws step 2. Deriving it from
 * the response means there is one thing to be right rather than two, and the
 * function is exported so the derivation is testable on its own — it is the part
 * that has to handle "all completed" and "none completed", and both are edge
 * cases a render at one position would never reach.
 */
export function reachedStage(stages: TrackingStage[]): number {
    const firstIncomplete = stages.findIndex((stage) => !stage.completed)

    return firstIncomplete === -1 ? stages.length : firstIncomplete
}

/**
 * The three trust badges on the design's deep-teal banner.
 *
 * **Three claims about the business, and none of them is checkable.** "Verified
 * Mistris" says background checks happen; nothing here checks anything. "Job
 * Tracking" describes the tracker above, which is a fixed position in a mock.
 * "Transparent Pricing" describes a price itemisation produced by an estimator
 * that does not exist.
 *
 * This is the one place the three screens make promises *about the service*
 * rather than about the interface, and it is the strip most likely to be read as
 * a summary of what FixMate is. All three are in the record.
 *
 * On the deep teal rather than a card, because the design uses the inversion to
 * close the screen: the last thing a person sees before the tab bar is a dark
 * band of reassurance.
 */
function TrustBanner() {
    return (
        <section
            className={`flex items-center justify-around gap-2 rounded-2xl px-4 py-4 ${DEEP}`}
        >
            {MOCK_TRUST_BADGES.map((badge) => (
                <div
                    key={badge.id}
                    className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center"
                >
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        className="shrink-0 text-[#FBBF24]"
                    >
                        {badge.id === 'verified' ? (
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        ) : badge.id === 'pricing' ? (
                            <>
                                <path d="M12 1v22" />
                                <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                            </>
                        ) : (
                            <>
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 6v6l4 2" />
                            </>
                        )}
                    </svg>
                    <p className="text-[11px] font-semibold leading-tight text-[#ECFDF5] dark:text-[#B8E8DD]">
                        {badge.label}
                    </p>
                </div>
            ))}
        </section>
    )
}
