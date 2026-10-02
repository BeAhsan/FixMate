<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

/**
 * The answer to a search: what was searched for, what came back, and the two
 * numbers the design summarises it with. **All of it mocked.**
 *
 * ## The sentence in `summary` is the most dangerous string on this endpoint
 *
 * "Based on your request, we matched 3 master technicians with rapid dispatch
 * toolsets" is a claim about work that has happened — a request received, a
 * matching run, three people assessed against it and found suitable. **None of
 * that happened.** This controller read an array of literals and returned the
 * first element's `summary`.
 *
 * The screen's own honesty record names it, and so does this docblock, because a
 * string that describes a system doing something is more persuasive than one that
 * describes a number. It is kept rather than reworded because the design's frame
 * contains it and a screen that quietly dropped the sentence would be a screen
 * nobody had looked at closely.
 *
 * ## `found_count` and `technicians` disagree, on purpose
 *
 * `found_count` is 24 and three technicians are returned. That is what the design
 * draws — "24 Found" above a list of three — and reproducing the arithmetic
 * instead (saying 3, or padding the list to 24) would have quietly rewritten the
 * frame to be self-consistent. **The disagreement is the honest part**: a real
 * endpoint would return every match or page them, and neither of those is here.
 * A screen therefore cannot use `found_count` to know how many cards to draw,
 * because it is not the number of cards.
 *
 * ## `filters` arrive from the server and still do nothing
 *
 * The four chips are sent here rather than left in the screen so that their
 * inertness is visible in one place: a server is offering to sort these results
 * and the list is in the order this controller wrote it. They have identifiers and
 * labels and no behaviour. The screen's docblock says so at the component that
 * draws them.
 *
 * Taking a `query` and sorting by it would be the alternative, and it would be a
 * feature: there is no index of technicians, no distance to compute from, no
 * prices to compare and no reviews to rank. This endpoint ignores its query
 * parameter entirely, and `MockedCustomerEndpointsTest` asserts that it does.
 */
class MatchingController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $plumbers = CustomerFixture::plumbers();

        return response()->json([
            'query' => 'Plumber',
            'area' => 'Sector 48, Gurugram',
            'found_count' => 24,
            'summary' => 'Based on your “Leaky Pipe Under Sink” request, we matched 3 master technicians with rapid dispatch toolsets.',
            'average_arrival_minutes' => 22,
            'estimated_cost' => ['min' => 350, 'max' => 500, 'currency' => 'INR'],
            'filters' => [
                ['id' => 'ai-best-match', 'label' => 'AI Best Match'],
                ['id' => 'near-me', 'label' => 'Near Me'],
                ['id' => 'price-low-high', 'label' => 'Price: Low to High'],
                ['id' => 'top-rated', 'label' => 'Top Rated'],
            ],

            /*
             * `array_map` over the shared roster, in the roster's order, so the
             * three cards come back in the order the fixture declares. The order is
             * not a ranking: the "AI Best Match" chip is unpressed-by-here — the
             * screen draws it selected because the design does — and the list is
             * not sorted by rating, distance or price. `Mahesh Chandra` is rated
             * highest at 4.9 and is listed last, which is the clearest proof in
             * the payload that nothing here ranked anything.
             */
            'technicians' => array_map($this->match(...), $plumbers),
        ], 200);
    }

    /**
     * One result card's worth of a plumber.
     *
     * `availability` nests the label beside the flag deliberately. The label is
     * what the card prints and the flag is what decides whether its button offers
     * to book; a card that had only the flag would make the screen invent
     * "Available Now", and a card that had only the label would make the screen
     * compare strings to decide whether somebody can be booked.
     *
     * @param  array{id: string, name: string, trade: string, years_experience: int, rating: float, review_count: int, base_fee: int, distance_km: float, availability_label: string, available_now: bool, best_match: bool}  $plumber
     * @return array{id: string, name: string, trade: string, years_experience: int, base_fee: int, currency: string, rating: float, review_count: int, distance_km: float, availability: array{label: string, available_now: bool}, best_match: bool}
     */
    private function match(array $plumber): array
    {
        return [
            'id' => $plumber['id'],
            'name' => $plumber['name'],
            'trade' => $plumber['trade'],
            'years_experience' => $plumber['years_experience'],
            'base_fee' => $plumber['base_fee'],
            'currency' => 'INR',
            'rating' => $plumber['rating'],
            'review_count' => $plumber['review_count'],
            'distance_km' => $plumber['distance_km'],
            'availability' => [
                'label' => $plumber['availability_label'],
                'available_now' => $plumber['available_now'],
            ],
            'best_match' => $plumber['best_match'],
        ];
    }
}
