<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

/**
 * Where a technician is on the way to a booking. **Mocked, and it is the most
 * misleading thing on this API.**
 *
 * `location`, `distance_km` and `eta_minutes` describe a journey that is not
 * happening. The two coordinates are fixed points, the distance and the ETA are
 * literals, and nothing polls this endpoint or moves anything between calls. A
 * screen that draws a map from these numbers shows a technician standing still in
 * one place forever, and — this is the part that matters — **it looks correct**,
 * because a map with a marker on it is indistinguishable from a map with a
 * moving marker on it in a screenshot, in a demo, and in review.
 *
 * So the timestamps in `stages` are computed relative to the request, which
 * keeps the timeline looking current rather than looking stale, and that is a
 * deliberate cosmetic choice and not an accident worth reporting as movement.
 *
 * `status` is one string and `stages` repeats each stage with its own
 * `completed` flag, so a client never has to derive one from the other and the
 * two cannot disagree inside a single payload. That part is a real design
 * decision even though the values are not.
 */
class LiveTrackingController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'booking_id' => 'BK-2041',
            'status' => 'on_the_way',
            // What the technician is travelling to fix. Added because a tracker
            // that cannot say what the job is cannot be read by the person waiting
            // for it — "On the way" with no job attached is a progress bar.
            'service' => 'Kitchen sink leak',
            'worker' => [
                'id' => 'WK-118',
                'name' => 'Imran Qureshi',
                'phone' => null,
                'rating' => 4.8,
                'photo_url' => null,
            ],
            'location' => [
                'worker_lat' => 12.9719,
                'worker_lng' => 77.5946,
                'destination_lat' => 12.9784,
                'destination_lng' => 77.5912,
                'distance_km' => 0.8,
                'eta_minutes' => 5,
            ],
            'stages' => [
                ['name' => 'Accepted', 'completed' => true, 'timestamp' => now()->subMinutes(18)->toIso8601String()],
                ['name' => 'On the way', 'completed' => true, 'timestamp' => now()->subMinutes(9)->toIso8601String()],
                ['name' => 'Arriving now', 'completed' => false, 'timestamp' => null],
                ['name' => 'Work completed', 'completed' => false, 'timestamp' => null],
            ],
        ], 200);
    }
}
