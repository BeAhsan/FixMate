<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

/**
 * The AI diagnosis behind the diagnosis screen. **Mocked, and nothing classifies
 * anything.**
 *
 * The controller takes no input. That is deliberate and is the whole of what
 * needs saying: there is no description, no image and no question in the
 * request, so there is no model, estimator or classifier behind this. It answers
 * the same literal for every caller forever, and `confidence` on the suggestions
 * endpoint is a typed number nobody scored.
 *
 * It exists so the screen has a shape to be written and reviewed against. The
 * alternative — the screen reading from a component-local constant — is a shape
 * that nothing validates, so when the real estimator lands and its response
 * differs, the screen breaks in a browser rather than in a test. A route is
 * somewhere a mismatch can be caught.
 *
 * Prices are rupee amounts as integers. **No symbol is carried in the payload**,
 * because a formatted string cannot be formatted again at the point of display
 * and four front ends would each grow their own `₹` format string.
 */
class DiagnosisController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'diagnosis' => [
                'problem' => 'Kitchen sink pipe leaking under the basin',
                'severity' => 'medium',
                'possible_causes' => [
                    'Loose compression joint',
                    'Failed washer on the trap',
                    'Cracked joint under the basin',
                ],
                'recommended_solution' => 'Replace the failed washer and reseal the compression joint, then run the tap for two minutes to confirm.',
                'estimated_time' => '30-45 minutes',
                'price_estimate' => [
                    'min' => 400,
                    'max' => 900,
                    'currency' => 'INR',
                ],
                'tools_needed' => [
                    'Adjustable spanner',
                    'Thread seal tape',
                    'Bucket',
                ],
            ],
        ], 200);
    }
}
