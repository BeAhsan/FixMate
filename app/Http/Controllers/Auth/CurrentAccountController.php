<?php

namespace App\Http\Controllers\Auth;

use App\Application\IdentityAndAccess\UseCases\DescribeCurrentAccount;
use App\Http\Controllers\Controller;
use App\Http\Resources\Auth\CurrentAccountResource;
use App\Infrastructure\IdentityAndAccess\AccountTypeRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * "Who am I", one door per application.
 *
 * There are four of these routes and one controller, because the answer is the
 * same shape for all four account types and the difference between them is which
 * door was knocked on — and that difference is enforced before this controller
 * runs, by the `account.can` middleware. Registering four routes rather than one
 * shared `/me` is what makes "an end user is refused entry to the worker
 * application" a fact about a real address instead of a claim about a
 * convention: each application calls its own door, and the wrong token at the
 * wrong door is refused with a message saying which door it belongs at.
 *
 * The account type is asked of the registry rather than taken from the route, so
 * that this endpoint reports what the token actually is. A response that took
 * the account type from the route would echo the caller's assumption back at
 * them, which is exactly the kind of answer that lets a front end render an empty
 * dashboard instead of noticing it has the wrong token.
 */
class CurrentAccountController extends Controller
{
    public function __construct(private DescribeCurrentAccount $describeCurrentAccount) {}

    public function __invoke(Request $request): JsonResponse
    {
        $account = $request->user();

        // The middleware has already established that there is an account and
        // that it is the right type, so this is not a re-check — it is where
        // the endpoint learns which type it is talking about.
        $accountType = AccountTypeRegistry::for($account);

        $current = $this->describeCurrentAccount->execute(
            $accountType,
            $account,
            // The token's own claims, not a recomputed set. The middleware has
            // just compared this same list against what the route requires, so
            // echoing it reports the reach this request was actually granted
            // rather than a second, independent opinion about it.
            $account->currentAccessToken()?->abilities ?? [],
        );

        return (new CurrentAccountResource($current))
            ->response()
            ->setStatusCode(200);
    }
}
