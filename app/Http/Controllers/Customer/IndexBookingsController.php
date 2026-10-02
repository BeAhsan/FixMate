<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

/**
 * The signed-in customer's bookings. **All of them mocked.**
 *
 * Two fixed bookings come back for every caller, with the timestamps computed
 * relative to the moment of the request so a screen shows something plausible
 * however long after boot it is opened. Nothing in the list belongs to the
 * account whose token presented it — that is the half that matters, and it is
 * why the field the real response will hinge on is the one thing absent here.
 *
 * **This is a fixture with a route on it, not a feature.** Nothing reads the
 * accounts table, and nobody should infer from a `200` that any of this was
 * looked up. The screen it feeds is `CustomerBookings` in the session package.
 *
 * ## Three fields the screen cannot honestly produce for itself
 *
 * `status`, `scheduled_at` and the presence of a detail page are all facts about
 * a booking, and all three would have been a decision handed to whichever screen
 * happened to render this list. Each is sent as a value beside the machine one
 * rather than instead of it, so a caller can still branch on `status` and nobody
 * has to reverse-engineer a word from an underscore:
 *
 * - `status_label` — `in_progress` is a database value. A screen that printed it
 *   would either show the underscores or strip them and print "in progress", and
 *   the second one is still a machine's idea of a phrase.
 * - `scheduled_on` — a locale-formatted date beside the ISO string. Four front
 *   ends should not each invent a date format, and the same reasoning already put
 *   `day_label` on the quote's three dates.
 * - `has_quote` — **the one that decides what a row does.** See below.
 *
 * ## Why `has_quote` is a fact about a booking and not about this repository
 *
 * Only `BK-2041` has a `GET /users/bookings/{booking}/quote`, and that is not an
 * omission in the fixture — it is what a quote *is*. A quote is what somebody is
 * quoted before agreeing to a price; a booking that has been completed has a
 * receipt, not a quote, and this repository has no receipt endpoint. So the flag
 * is true for `BK-2041` and false for the completed one, and it will still be a
 * true statement about a real booking after the fixtures are gone.
 *
 * The alternative was a screen deciding for itself which rows it could open, and
 * every such version of that decision ends up as a literal booking identifier in
 * a component — the same `BK-2041` that `apps/user/app/booking-details/page.tsx`
 * already has to carry, written a second time in a place that has no way to be
 * told it is wrong.
 *
 * `bookings` is always an array and never `null`, so a caller renders a list in
 * both the populated and the empty case and never has to treat "no bookings" as a
 * failure. That is why the status is set explicitly: `200` on an empty list is a
 * stated decision here rather than an inherited default.
 */
class IndexBookingsController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $active = now()->addMinutes(12);
        $completed = now()->subDays(3);

        return response()->json([
            'bookings' => [
                [
                    'id' => 'BK-2041',
                    'service' => 'Plumbing',
                    'status' => 'in_progress',
                    'status_label' => 'In progress',
                    'worker_name' => 'Imran Qureshi',
                    'scheduled_at' => $active->toIso8601String(),
                    'scheduled_on' => $active->format('j M Y, g:i A'),

                    /*
                     * **450 and not 850**, because `BookingQuoteController` opens
                     * this same booking with three lines that add up to 450. The
                     * two endpoints describe one booking, and a customer opening
                     * the list and then the detail would otherwise read two
                     * different prices for the same visit — a discrepancy no
                     * screen can reconcile, because neither of them invented it.
                     *
                     * `MockedCustomerEndpointsTest` asserts the agreement rather
                     * than this number, so changing both ends together is a test
                     * that stays green and a change to only one of them is a test
                     * that goes red.
                     */
                    'price' => 450,
                    'currency' => 'INR',

                    'has_quote' => true,
                ],
                [
                    'id' => 'BK-1988',
                    'service' => 'Electrical',
                    'status' => 'completed',
                    'status_label' => 'Completed',
                    'worker_name' => 'Sunita Deshmukh',
                    'scheduled_at' => $completed->toIso8601String(),
                    'scheduled_on' => $completed->format('j M Y, g:i A'),
                    'price' => 1200,
                    'currency' => 'INR',

                    /*
                     * False, and the reason is above: a finished job is not quoted.
                     * A row the screen renders as an anchor here would open a
                     * detail page for a booking that has none.
                     */
                    'has_quote' => false,
                ],
            ],
        ], 200);
    }
}
