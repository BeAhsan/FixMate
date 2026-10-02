'use client'

import { CustomerBookings } from '@fixmate/session'
import { operations } from '@/lib/application'

/**
 * The customer's bookings, at `/bookings/`.
 *
 * Delegation only, for the same reason every other page in this application is
 * one: a screen that drew its own header would be the shape a copied shell takes,
 * and `FrontEndApplicationsTest` fails any `<header` written under an
 * application's `app/`.
 *
 * ## Why this is a list and not the booking screen
 *
 * The tab bar's middle tab reads **Bookings** — a plural — and until this page
 * existed it pointed at `/booking-details/`, which shows one booking. `has_quote`
 * on each row is what lets the list point only the rows that have a page behind
 * them; see `packages/session/src/react/customer/booking-list.tsx`.
 *
 * `loadBookings` is handed over rather than called here so the screen decides when
 * to fetch, which is also what makes it testable: given a function, all three of
 * its states render with no network at all.
 */
export default function BookingsPage() {
    return <CustomerBookings loadBookings={() => operations.bookings()} />
}