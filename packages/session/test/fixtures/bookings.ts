import type { BookingList } from '@fixmate/api-client'

/**
 * The bookings list, copied from `IndexBookingsController`.
 *
 * ## Why the timestamps are pinned rather than computed
 *
 * `scheduled_at` is `now()`-relative in the controller and the screen prints
 * `scheduled_on` beside it. A fixture that recomputed the date would make every
 * assertion about the printed string wrong tomorrow, and a fixture that pinned
 * only `scheduled_on` would leave `scheduled_at` untested — which is the half
 * that ends up in the `datetime` attribute.
 *
 * So both are pinned here to the same day, and `bookings.test.ts` asserts the two
 * agree **within the fixture**, which is what the screen's `<time>` element
 * depends on. The controller's own arithmetic is asserted by
 * `MockedCustomerEndpointsTest` rather than duplicated here.
 *
 * ## The two bookings are deliberately different in three ways
 *
 * `BK-2041` is in progress, has a quote and is the one the detail page can show.
 * `BK-1988` is completed, has no quote and has no page. If all three bookings
 * agreed, a screen that ignored `has_quote` and linked every row would render
 * identically and pass — which is the whole failure this pair exists to catch.
 */
export const BOOKINGS: BookingList = {
    bookings: [
        {
            id: 'BK-2041',
            service: 'Plumbing',
            status: 'in_progress',
            status_label: 'In progress',
            worker_name: 'Imran Qureshi',
            scheduled_at: '2026-11-14T09:12:00+05:30',
            scheduled_on: '14 Nov 2026, 9:12 AM',
            price: 450,
            currency: 'INR',
            has_quote: true,
        },
        {
            id: 'BK-1988',
            service: 'Electrical',
            status: 'completed',
            status_label: 'Completed',
            worker_name: 'Sunita Deshmukh',
            scheduled_at: '2026-11-11T16:40:00+05:30',
            scheduled_on: '11 Nov 2026, 4:40 PM',
            price: 1200,
            currency: 'INR',
            has_quote: false,
        },
    ],
}

/**
 * The booking the detail page shows, as a constant the tests can name.
 *
 * Written out here rather than reached for through `BOOKINGS.bookings[0]`, so a
 * reorder of the fixture — which nothing forbids — cannot silently move the
 * assertion onto the completed booking and make a test about the bookable one
 * pass for the wrong reason.
 */
export const BOOKABLE_BOOKING_ID = 'BK-2041'