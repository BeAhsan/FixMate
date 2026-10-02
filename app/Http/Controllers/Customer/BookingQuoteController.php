<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Everything one booking's confirmation screen draws: who is coming, when they
 * could come, what it costs broken down, and how it could be paid for.
 * **All of it mocked.**
 *
 * ## The only conditional in this file is a `404`
 *
 * Every other value is a literal. An identifier this repository does not have an
 * example for is refused rather than answered with somebody else's booking —
 * which is the one behaviour here that is worth implementing, because it is the
 * one that would be a real defect in the version this stands in for. Answering
 * `BK-9999` with `BK-2041`'s technician is what an endpoint that forgot to look
 * anything up looks like, and the screen would render it without complaint.
 *
 * ## The dates and times are computed, and that is the point
 *
 * The design's frame reads "TODAY / 14 Oct", "TUE / 15 Oct" and "WED / 16 Oct" —
 * a design that has drifted, because today and the fourteenth cannot both be
 * right. Every literal endpoint in this directory would have had to pick a side,
 * and picking the fourteenth would make the screen lie every day that is not the
 * fourteenth.
 *
 * So the days are `now()` plus zero, one and two, and the weekday and the day
 * label are derived from those dates rather than typed in beside them. **The
 * contradiction is resolved by arithmetic instead of by prose.** A static export
 * is built once and served until it is rebuilt, which is the real reason this
 * matters: an export built on the fourteenth would still say "TODAY" on the
 * twentieth.
 *
 * The same applies to `IndexBookingsController`, which computes its timestamps
 * the same way for the same reason.
 *
 * ## The estimate is the most consequential literal here
 *
 * Three lines that add up to ₹450, presented as a quote a person can accept.
 * **Nothing computed them, nothing will charge them, and no technician would
 * turn up expecting to be paid that amount.** The lines are not a price: they are
 * the shape of a price, and the three of them are named in the honesty record the
 * customer's screens carry.
 *
 * The lines are sent as label-and-amount pairs rather than as a rendered string
 * so the screen formats the rupees itself. Four front ends each draw prices, and
 * a server that pre-formatted them would be choosing a locale for all four.
 *
 * ## `payment_methods` is a list of ways to pay that nothing can take
 *
 * There is no gateway, no checkout, no order and no payment intent anywhere in
 * this repository. These are three radio inputs that select a local piece of
 * state, above a "Confirm Booking" button that books nothing. It is the largest
 * gap on any customer screen and the screen's own docblock says it is first to
 * build.
 */
class BookingQuoteController extends Controller
{
    public function __invoke(Request $request, string $booking): JsonResponse
    {
        $example = CustomerFixture::exampleBooking();

        if ($booking !== $example['id']) {
            return response()->json([
                'message' => 'No such booking.',
            ], 404);
        }

        $today = now();

        return response()->json([
            'booking_id' => $example['id'],
            'category' => $example['category'],
            'service' => $example['service'],

            'technician' => CustomerFixture::assignedTechnician(),

            /*
             * `is_today` is a flag rather than the word "TODAY", for the same
             * reason the dates are arithmetic rather than literals: a screen that
             * printed a stored "TODAY" would be asserting that a day captured at
             * some point in the past is still today. The screen renders the word
             * from the flag, so the word is always true of the day it is drawn on
             * and the flag is the thing that can be wrong.
             */
            'dates' => [
                $this->day($today),
                $this->day($today->copy()->addDay()),
                $this->day($today->copy()->addDays(2)),
            ],

            'times' => [
                $this->slot('09:00'),
                $this->slot('11:30'),
                $this->slot('14:00'),
            ],

            'estimate' => [
                'heading' => 'AI Estimated Price',
                'badge' => 'SECURE',
                'lines' => [
                    ['label' => 'Base Service Fee', 'amount' => 149],
                    ['label' => 'Estimated Labor (45 min)', 'amount' => 250],
                    ['label' => 'Platform Charges', 'amount' => 51],
                ],
                'total' => 450,
                'total_label' => 'Total Payable',
                'currency' => 'INR',
                'footnote' => 'Actual price may vary slightly based on material used.',
            ],

            'payment_methods' => [
                ['id' => 'upi', 'title' => 'UPI / QR / Wallets', 'note' => 'Google Pay, PhonePe, Paytm'],
                ['id' => 'card', 'title' => 'Credit / Debit Cards', 'note' => 'Visa, Mastercard, RuPay'],
                ['id' => 'cash', 'title' => 'Cash After Service', 'note' => 'Pay directly to the worker'],
            ],
        ], 200);
    }

    /**
     * One offered day, derived from its date rather than typed beside it.
     *
     * @param  Carbon  $date
     * @return array{date: string, weekday: string, day_label: string, is_today: bool}
     */
    private function day($date): array
    {
        return [
            'date' => $date->toDateString(),
            'weekday' => $date->format('D'),
            'day_label' => $date->format('d M'),
            'is_today' => $date->isToday(),
        ];
    }

    /**
     * One offered time window.
     *
     * `label` is the design's "09:00 AM" and `starts_at` is the same time on the
     * booking's date. The label is sent because the design's twelve-hour casing is
     * a rendering decision four front ends should each make for themselves, and
     * the timestamp is sent because a real slot would be one and a screen with
     * only a string cannot show anybody when they are actually booked.
     *
     * Both refer to **today**, which is what the first day's date is. That is the
     * one thing here that is genuinely wrong for a screen offering three
     * consecutive days, and it is wrong in the direction that is visible: every
     * offered slot claims to be today. A real endpoint would join the slot to the
     * day the person has chosen, and this one cannot know which day that is,
     * because nothing is chosen — the day and the slot are both local state on a
     * screen whose only button books nothing.
     *
     * @return array{starts_at: string, label: string}
     */
    private function slot(string $time): array
    {
        $startsAt = now()->startOfDay()->setTimeFromTimeString($time);

        return [
            'starts_at' => $startsAt->toIso8601String(),
            'label' => $startsAt->format('g:i A'),
        ];
    }
}
