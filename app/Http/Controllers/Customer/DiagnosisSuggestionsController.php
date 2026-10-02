<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

/**
 * The categories a mocked diagnosis can be one of. **Mocked, and not ranked.**
 *
 * A fixed list of three, plus a `recommended` naming one of them by `id` rather
 * than by position — so a client cannot read the wrong entry once the list is
 * reordered, which is a real failure mode when a payload is indexed by
 * convention and the convention is the only thing tying it together.
 *
 * **`confidence` is not a probability.** Nothing was scored, so the number
 * describes the order these three were written down in. It is typed as a number
 * and rendered, and the screen that renders it says so, because a validated
 * `confidence` is exactly the thing that makes a reader believe there is a model
 * behind it.
 *
 * Separate from `DiagnosisController` rather than folded into it, so a screen can
 * show the categories — which are the part a person chooses between — without
 * also committing to a diagnosis they have not picked.
 */
class DiagnosisSuggestionsController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'suggestions' => [
                [
                    'id' => 'leak',
                    'title' => 'Leak or dripping pipe',
                    'description' => 'Water escaping from a joint, tap or the base of a fixture',
                    'confidence' => 0.92,
                    'price_range' => ['min' => 400, 'max' => 900, 'currency' => 'INR'],
                ],
                [
                    'id' => 'blockage',
                    'title' => 'Blocked drain or sink',
                    'description' => 'Slow or standing water, or a drain that will not clear',
                    'confidence' => 0.81,
                    'price_range' => ['min' => 300, 'max' => 700, 'currency' => 'INR'],
                ],
                [
                    'id' => 'power',
                    'title' => 'Electrical fault',
                    'description' => 'Sparking, a tripped breaker, or a socket that has stopped working',
                    'confidence' => 0.74,
                    'price_range' => ['min' => 500, 'max' => 1400, 'currency' => 'INR'],
                ],
            ],
            'recommended' => 'leak',
        ], 200);
    }
}
