'use client'

import type { Booking, BookingList } from '@fixmate/api-client'
import { APPLE_PRESS } from '@fixmate/ui'
import { MockedDataNotice } from './mocked-data-notice'
import { formatMoney } from './money'
import { JAKARTA_FONT_CLASS } from './typeface'
import {
    ACCENT_TEXT,
    CARD,
    GROUND,
    INK,
    INK_SOFT,
    PILL_OFF,
    PILL_ON,
} from './tokens'
import { useMockedResource, type MockedResource } from './use-mocked-resource'

/**
 * The customer's bookings, as a list.
 *
 * ## Why this screen exists at all
 *
 * Two reasons, and the second is the one worth arguing about.
 *
 * The first is that `GET /users/bookings` had a route, a controller, a typed
 * operation, a contract entry and a test — and **nothing called it**. That is the
 * failure this repository has already made once, with four `changePassword*`
 * operations that were declared, contracted and documented with no way to be
 * invoked. A fixture endpoint nobody reads is a route that costs a request and
 * proves nothing.
 *
 * The second is that the bottom tab bar's middle tab has always read **Bookings**
 * and pointed at `/booking-details/`, which is one booking. A tab labelled with a
 * plural that delivers a singular is a small lie, and an easy one to leave in
 * place, because the page behind it looks finished.
 *
 * ## What each row is, and the one decision it cannot make for itself
 *
 * A row is an **anchor** where `has_quote` is true and a plain `<li>` where it is
 * false, and that flag is the whole reason this screen can be honest about it.
 *
 * The alternative — every row an anchor to `/booking-details/` — would send a
 * person who tapped a completed booking to a page describing somebody else's
 * visit. A static export has no per-booking route, so that page is pinned to
 * `BK-2041`, and a second identifier written into this component to decide which
 * rows are safe would be a literal nothing could ever disagree with. The flag
 * moves the decision to the one place that knows the answer.
 *
 * **A row with no quote carries no affordance at all**, rather than a disabled
 * button. A control that is drawn and cannot be used is worse than one that is
 * absent: it invites the tap and then says nothing happened.
 */
export function CustomerBookings({
    loadBookings,
}: {
    loadBookings: () => Promise<BookingList>
}) {
    const bookings = useMockedResource(loadBookings, 'customer-bookings')

    return <CustomerBookingsScreen bookings={bookings} />
}

/**
 * The screen, given its state.
 *
 * Split from the fetching for the reason every other screen here is: an effect
 * never runs under `renderToStaticMarkup`, so a screen that only exists as a hook
 * can never be shown its ready state in a test. Taking the state as a prop makes
 * the three of them plain objects.
 */
export function CustomerBookingsScreen({
    bookings,
}: {
    bookings: MockedResource<BookingList>
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
                            YOUR VISITS
                        </p>

                        {/*
                         * The heading names a count, and a count cannot be printed
                         * before the list arrives — so like the matching screen's
                         * query heading it is absent while loading rather than a
                         * placeholder reading "2", which would be a screen
                         * asserting it had found two bookings before asking. The
                         * section name below it is true in every state.
                         */}
                        <h1 className={`truncate text-xl font-bold tracking-tight ${INK}`}>
                            {bookings.status === 'ready' &&
                                `${bookings.data.bookings.length} Bookings`}
                            {bookings.status !== 'ready' && 'Bookings'}
                        </h1>
                    </div>
                </div>
            </header>

            <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-5 py-5">
                <MockedDataNotice detail="Neither booking below belongs to the account you signed in with — every customer receives this identical list. Nothing here was looked up, and the completed visit has no page behind it." />

                {bookings.status === 'loading' && (
                    <p role="status" className={`text-sm ${INK_SOFT}`}>
                        Loading bookings…
                    </p>
                )}

                {bookings.status === 'failed' && (
                    <p role="status" className={`text-sm ${INK_SOFT}`}>
                        Bookings could not be loaded. {bookings.message}
                    </p>
                )}

                {bookings.status === 'ready' && (
                    <BookingRows bookings={bookings.data.bookings} />
                )}
            </main>
        </div>
    )
}

/**
 * The list, given the bookings.
 *
 * `hrefFor` is exported for the reason `actionFor` is on the matching screen: the
 * pairing between a payload flag and what a row does is the decision worth
 * testing directly, and it is invisible to any assertion about rendered counts —
 * two anchors and two rows is the same anchor count either way.
 */
export function BookingRows({ bookings }: { bookings: Booking[] }) {
    /*
     * The empty case, and it is reachable. The endpoint promises an array and
     * never a null, so "no bookings" is an answer rather than a failure, and a
     * screen that only handled the populated case would render an empty `<ul>`
     * under a heading — which reads as a broken page rather than as an account
     * that has never booked anything.
     */
    if (bookings.length === 0) {
        return (
            <p className={`text-sm ${INK_SOFT}`}>
                No bookings yet. Booking something will show it here.
            </p>
        )
    }

    return (
        <ul className="flex flex-col gap-3.5">
            {bookings.map((booking) => (
                <BookingRow key={booking.id} booking={booking} />
            ))}
        </ul>
    )
}

/**
 * Where a row goes, or nowhere.
 *
 * The destination is the one page in this export that shows a booking, and it is
 * **deliberately a second copy of the constant** `apps/user/app/booking-details/
 * page.tsx` passes as its loader argument. That page's copy names *what to fetch*
 * and this one names *where to go*; they are written by different people at
 * different times, and joining them into a shared constant would mean a component
 * importing from an application — which `FrontEndApplicationsTest` reads as the
 * shape a copied screen takes. The pairing is asserted in
 * `packages/session/test/bookings.test.ts` instead, so a third page appearing
 * here fails that test rather than going unnoticed.
 */
export function hrefFor(booking: Booking): string | null {
    return booking.has_quote ? '/booking-details/' : null
}

export function BookingRow({ booking }: { booking: Booking }) {
    const href = hrefFor(booking)

    const body = (
        <>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className={`truncate text-base font-bold ${INK}`}>
                        {booking.service}
                    </p>
                    <p className={`truncate text-xs ${INK_SOFT}`}>
                        {booking.worker_name}
                    </p>
                </div>

                {/*
                 * The status pill, coloured from the payload's own `status` rather
                 * than from a second copy of the set of live statuses written in
                 * this file. A hard-coded list of "which statuses are live" is
                 * the same shape of mistake as a hard-coded booking identifier: a
                 * fact about the back end's vocabulary living in a component that
                 * cannot be told when the vocabulary grows.
                 */}
                <span
                    className={booking.status === 'in_progress' ? PILL_ON : PILL_OFF}
                >
                    {booking.status_label}
                </span>
            </div>

            <div className="flex items-center justify-between gap-3">
                {/*
                 * A `<time>` with the machine timestamp in `dateTime` and the
                 * display string as its content, so the two can disagree — and the
                 * screen is shown the one the back end chose rather than inventing
                 * a date format. `scheduled_at` is in the payload and this element
                 * is what makes it reachable, which is asserted rather than assumed.
                 */}
                <p className={`truncate text-xs ${INK_SOFT}`}>
                    <time dateTime={booking.scheduled_at}>{booking.scheduled_on}</time>
                </p>

                <p className={`shrink-0 text-sm font-bold ${INK}`}>
                    {formatMoney(booking.price, booking.currency)}
                </p>
            </div>
        </>
    )

    if (href === null) {
        return <li className={`flex flex-col gap-2.5 p-4 ${CARD}`}>{body}</li>
    }

    return (
        <li className={CARD}>
            <a href={href} className={`flex flex-col gap-2.5 p-4 ${APPLE_PRESS}`}>
                {body}
            </a>
        </li>
    )
}

/**
 * The header's back control, the **third** copy in this folder.
 *
 * A `<button>` with a real label rather than an anchor, because on a static
 * export there is **no history to go back through**: every page here is a
 * separate document fetched over HTTP, and a person who arrived by typing the
 * address or by following a link from a search result has an empty back stack.
 * It is a button rather than a link so it is not announced as navigation.
 *
 * Three copies, and the duplication is the point: the booking screen's version is
 * `bg-white` on a ring and the matching screen's is `bg-[#F1F3FF]` with no ring,
 * because those are two different designs' surfaces. Extracting one shared control
 * would mean picking one of the two and shipping the wrong one on the other screen
 * — a shared `TabBar` and a shared `MockedDataNotice` were extracted because they
 * are genuinely identical, and these are not.
 */
function BackButton() {
    return (
        <button
            type="button"
            aria-label="Back to the dashboard"
            className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[#0F172A] ring-1 ring-[#F1F5F9] hover:bg-[#F8FAFC] dark:bg-[#111A2B] dark:text-[#EDF0FF] dark:ring-[#243350] dark:hover:bg-[#16213A] ${APPLE_PRESS}`}
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