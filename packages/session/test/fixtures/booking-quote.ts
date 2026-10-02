import type { BookingQuote } from '@fixmate/api-client'

/**
 * One booking quote, shaped exactly as `BookingQuoteController` answers.
 *
 * ## The dates are pinned here on purpose
 *
 * The controller computes its three days as `now()` plus zero, one and two, and
 * derives the weekday and the day label from those dates. **This fixture uses
 * fixed dates instead**, and the reason is that a fixture which recomputed itself
 * would make the one interesting assertion here untestable.
 *
 * The screen renders the word "TODAY" from `is_today`, and the design's frame says
 * "TODAY / 14 Oct", which cannot both be true. If the fixture's dates were today,
 * a screen that printed `date`'s weekday and *ignored* the flag would still look
 * right — and a screen that printed a stored "TODAY" string would look right too.
 * With `14 Oct` marked `is_today` on the fourteenth of some other month, the only
 * way to render "TODAY" is to read the flag. The screen's own docblock says the
 * same thing about why the word is not in the payload.
 *
 * `MockedCustomerEndpointsTest` asserts the other half on the server: that the
 * controller's dates really are three consecutive days from today and that exactly
 * one is flagged. Between the two, "TODAY" is true of the day it is drawn on.
 *
 * ## The technician is not one of the browsing technicians
 *
 * `Imran Qureshi` is on the booking; the three available to book are Ramesh,
 * Suresh and Mahesh. Reusing one would have meant a customer could book somebody
 * who is currently in a van.
 */
export const BOOKING_QUOTE: BookingQuote = {
    booking_id: 'BK-2041',
    category: 'Plumbing',
    service: 'Pipe Leakage Repair',
    technician: {
        id: 'WK-118',
        name: 'Imran Qureshi',
        trade: 'Expert Plumber',
        rating: 4.8,
        review_count: 120,
    },
    dates: [
        { date: '2026-11-14', weekday: 'Sat', day_label: '14 Nov', is_today: true },
        { date: '2026-11-15', weekday: 'Sun', day_label: '15 Nov', is_today: false },
        { date: '2026-11-16', weekday: 'Mon', day_label: '16 Nov', is_today: false },
    ],
    times: [
        { starts_at: '2026-11-14T09:00:00+05:30', label: '9:00 AM' },
        { starts_at: '2026-11-14T11:30:00+05:30', label: '11:30 AM' },
        { starts_at: '2026-11-14T14:00:00+05:30', label: '2:00 PM' },
    ],
    estimate: {
        heading: 'AI Estimated Price',
        badge: 'SECURE',
        lines: [
            { label: 'Base Service Fee', amount: 149 },
            { label: 'Estimated Labor (45 min)', amount: 250 },
            { label: 'Platform Charges', amount: 51 },
        ],
        total: 450,
        total_label: 'Total Payable',
        currency: 'INR',
        footnote: 'Actual price may vary slightly based on material used.',
    },
    payment_methods: [
        { id: 'upi', title: 'UPI / QR / Wallets', note: 'Google Pay, PhonePe, Paytm' },
        { id: 'card', title: 'Credit / Debit Cards', note: 'Visa, Mastercard, RuPay' },
        { id: 'cash', title: 'Cash After Service', note: 'Pay directly to the worker' },
    ],
}