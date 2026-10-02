<?php

namespace App\Http\Controllers\Customer;

/**
 * The literals behind the mocked customer endpoints, in one place.
 *
 * ## Why a shared fixture and not a constant per controller
 *
 * Discovery, matching and the booking quote all draw the same handful of people,
 * and before this file existed each controller named its own. They drifted
 * immediately and visibly: `Ramesh Kumar` was `4.8` with `120` reviews in one
 * response and `4.6` with `84` in another, because the two literals were written
 * a week apart from two different designs. A person opening the three screens in
 * turn would have seen a technician change their own history between pages.
 *
 * So the roster is written once and every endpoint projects from it. That makes
 * the agreement a property of the code rather than a thing a reviewer has to
 * notice. `MockedCustomerEndpointsTest` asserts the endpoints agree, so this file
 * cannot drift from them either — the three assertions point in a circle and the
 * circle only closes if it is true.
 *
 * ## Nothing here is data
 *
 * There is no worker table, no booking table, no review table and no pricing
 * table in this repository. Every value below was typed in to make a screen look
 * finished. **No method here reads storage and no method here should be
 * mistaken for one that could** — a `404` from the quote endpoint is the only
 * conditional in this class, and it is there so an unknown identifier fails
 * honestly rather than answering with somebody else's booking.
 */
final class CustomerFixture
{
    /**
     * The three plumbers the discovery and matching screens draw between them.
     *
     * `available_now` is separate from `availability_label` because the two
     * answer different questions and only one of them is a fact. The label is
     * copy — "In 20 mins", "Available: Today, 4:00 PM" — and it is what the
     * screen draws. The flag is what the screen *decides* with: it is what makes
     * a card's action read "Book Now" instead of "View Profile". Sending the
     * label alone would put a design decision in a controller, and sending the
     * flag alone would make a screen invent a sentence.
     *
     * `best_match` marks the one the design badges, and it is the only field here
     * that exists to reproduce a design's emphasis rather than to describe a
     * person. There is no matching in this repository — no ranking, no score, no
     * comparison of these three against anything — so the badge is a position in
     * an array that the fixture puts there on purpose.
     *
     * @return list<array{id: string, name: string, trade: string, years_experience: int, rating: float, review_count: int, base_fee: int, distance_km: float, availability_label: string, available_now: bool, best_match: bool}>
     */
    public static function plumbers(): array
    {
        return [
            [
                'id' => 'WK-301',
                'name' => 'Ramesh Kumar',
                'trade' => 'Master Plumber',
                'years_experience' => 12,
                'rating' => 4.8,
                'review_count' => 120,
                'base_fee' => 149,
                'distance_km' => 1.2,
                'availability_label' => 'Available Now',
                'available_now' => true,
                'best_match' => true,
            ],
            [
                'id' => 'WK-302',
                'name' => 'Suresh Yadav',
                'trade' => 'Plumbing & General Fix',
                'years_experience' => 8,
                'rating' => 4.6,
                'review_count' => 84,
                'base_fee' => 129,
                'distance_km' => 2.8,
                'availability_label' => 'Available: Today, 4:00 PM',
                'available_now' => false,
                'best_match' => false,
            ],
            [
                'id' => 'WK-303',
                'name' => 'Mahesh Chandra',
                'trade' => 'Master Pipe & Sanitary',
                'years_experience' => 15,
                'rating' => 4.9,
                'review_count' => 240,
                'base_fee' => 179,
                'distance_km' => 1.8,
                'availability_label' => 'In 20 mins',
                'available_now' => false,
                'best_match' => false,
            ],
        ];
    }

    /**
     * The technician on the one booking this repository has an example of.
     *
     * **Deliberately not one of {@see self::plumbers()}.** This is the person
     * already on a job, so a person browsing the discovery screen sees the
     * available technicians *and* the one they are already booked with, which is
     * the situation the dashboard's job card is drawn in. Reusing a browsing
     * technician would have meant the customer could book somebody who is
     * currently in a van — a contradiction a screen reader would never catch and
     * a person very quickly would.
     *
     * @return array{id: string, name: string, trade: string, rating: float, review_count: int}
     */
    public static function assignedTechnician(): array
    {
        return [
            'id' => 'WK-118',
            'name' => 'Imran Qureshi',
            'trade' => 'Expert Plumber',
            'rating' => 4.8,
            'review_count' => 120,
        ];
    }

    /**
     * The booking the quote endpoint will answer for.
     *
     * `BK-2041` because `IndexBookingsController` already lists a booking under
     * that identifier with the same technician, so the list and the detail agree
     * about who is doing what. Two endpoints describing one booking as two
     * different jobs would be the exact defect this class exists to prevent.
     *
     * @return array{id: string, category: string, service: string}
     */
    public static function exampleBooking(): array
    {
        return [
            'id' => 'BK-2041',
            'category' => 'Plumbing',
            'service' => 'Pipe Leakage Repair',
        ];
    }
}
