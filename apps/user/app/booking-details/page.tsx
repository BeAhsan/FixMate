'use client'

import { BookingDetails } from '@fixmate/session'
import { operations } from '@/lib/application'

/**
 * The booking quote, at `/booking-details/`.
 *
 * Pure delegation, like every other page in this application.
 *
 * ## Why the booking identifier is named here
 *
 * Every other customer screen reads an endpoint that takes no arguments, so this
 * is the only page that has to say *what* it is showing. Three places could have
 * supplied it and all three are worse for a different reason:
 *
 * - **A path segment** — `/booking-details/BK-2041/` — is what this would become
 *   the moment bookings are real, and it is impossible today: these are static
 *   exports, and a dynamic route segment is one of the mistakes
 *   `apps/user/test/static-export.test.ts` exists to fail. Next would have to
 *   enumerate every booking at build time, and this repository has no booking
 *   table to enumerate.
 * - **A query string** — `?booking=BK-2041` — needs `useSearchParams`, and that
 *   needs a `Suspense` boundary whose exported fallback is an empty page. The
 *   screen would then have to render client-side to show anything at all, which is
 *   the same cost as the path segment for less clarity.
 * - **The bookings list** — asking `operations.bookings()` which booking to open
 *   — is the honest answer and the one this becomes, but it is a second request
 *   whose result this page has nowhere to put: it would have to hold the
 *   identifier in state, resolve it in an effect, and render nothing until it
 *   arrives. That is application-level fetching logic, which is precisely what
 *   every other page in this application delegates away.
 *
 * So the identifier is a constant here, in the one file whose whole job is
 * configuration, and it is the only literal in any of these pages. When the
 * booking table lands, this becomes a path segment and the constant goes.
 *
 * `Confirm Booking` still books nothing. See the screen.
 */
export default function BookingDetailsPage() {
    return (
        <BookingDetails
            bookingId="BK-2041"
            loadQuote={(booking) => operations.bookingQuote(booking)}
        />
    )
}