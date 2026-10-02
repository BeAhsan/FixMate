<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

/**
 * What the customer's landing screen offers: the kinds of work, and two
 * technicians to start with. **Both lists mocked.**
 *
 * ## Why this is one response and not two
 *
 * The dashboard draws a grid of service categories and a carousel of technicians
 * directly beneath one another, and both are needed to render the screen at all.
 * Two endpoints would mean the screen has two loading states and two ways to be
 * half-drawn, for two lists that are always read together and describe one
 * question — "what can I book here, and who". The split would be defensible if
 * the carousel were a separate destination; it is not, it is a section.
 *
 * ## What is real about the prices
 *
 * `price_from` is an integer in rupees and `currency` is `INR`. Neither is read
 * from a pricing table, because there is none, and **the screen must not present
 * them as an offer.** A "from ₹149" that no pricing system computed is a price
 * somebody might rely on, which is why these are the values this repository would
 * most like to be wrong about — and the estimate in the booking quote is the
 * figure they roll up into.
 *
 * The design's `tone` — the sky, amber and orange tints on the three cards — is
 * **deliberately absent.** It is a colour, not a fact about a service, and a
 * server that named one would be asserting that plumbing is the colour of the sky.
 * The screen keys the tint off the category's own identifier instead, and falls
 * back to a neutral card for anything it has not seen.
 */
class DiscoveryController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $featured = CustomerFixture::plumbers();

        return response()->json([
            'categories' => [
                ['id' => 'plumbing', 'label' => 'Plumbing', 'price_from' => 149, 'currency' => 'INR'],
                ['id' => 'electrical', 'label' => 'Electrical', 'price_from' => 129, 'currency' => 'INR'],
                ['id' => 'carpentry', 'label' => 'Carpentry', 'price_from' => 199, 'currency' => 'INR'],
            ],

            /*
             * Two of the three, not all of them.

             * The screen draws a horizontal carousel, and a carousel that cannot
             * scroll is a list wearing a costume — so the count is a decision and
             * not an accident. Two entries make it scroll on a 360px screen and
             * not on a tablet, which is what the design's frames are.
             *
             * Both are drawn from the same roster the matching screen offers, so
             * somebody who taps through to matching finds these two people again
             * with the same ratings and the same base fees. A dashboard that
             * advertised 4.9 and matching that offered 4.6 for the same person
             * would be the kind of inconsistency that reads as a different
             * technician rather than as a bug.
             */
            'featured_technicians' => [
                $this->featured($featured[0]),
                $this->featured($featured[2]),
            ],
        ], 200);
    }

    /**
     * The carousel's shape of a technician — a subset of {@see CustomerFixture::plumbers()}.
     *
     * Fewer fields than matching offers, deliberately. The carousel card shows a
     * name, a trade, a rating and a completed-jobs count, and a field the card
     * does not draw is a field a future one might draw by accident. `distance_km`
     * and `base_fee` are the two left out: a carousel with a distance on it
     * invites the comparison the "Near Me" filter is supposed to drive, and that
     * comparison does not exist here.
     *
     * @param  array{id: string, name: string, trade: string, years_experience: int, rating: float, review_count: int, base_fee: int, distance_km: float, availability_label: string, available_now: bool, best_match: bool}  $plumber
     * @return array{id: string, name: string, trade: string, rating: float, completed_jobs: int}
     */
    private function featured(array $plumber): array
    {
        return [
            'id' => $plumber['id'],
            'name' => $plumber['name'],
            'trade' => $plumber['trade'],
            'rating' => $plumber['rating'],
            'completed_jobs' => $plumber['review_count'],
        ];
    }
}
