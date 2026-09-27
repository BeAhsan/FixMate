<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Infrastructure\IdentityAndAccess\AccountTypeRegistry;
use App\Infrastructure\IdentityAndAccess\SessionTokenIssuer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Exchange a renewal token for a new access token, and a new renewal token.
 *
 * One controller serves all four applications. The route decides which door was
 * knocked on, and the `session.can` middleware has already established that the
 * caller holds a renewal token for that account type — so by the time this runs
 * there is nothing left to branch on. Four near-identical controllers would be
 * four places for the rotation to be subtly different, and the difference would
 * show up as a renewal token that is worth two uses in one store and one in
 * another.
 *
 * The abilities on the replacement access token are read from the *account
 * type*, not from the presented token. The renewal token deliberately carries
 * no abilities of its own, so there is nothing there to copy — and if the
 * abilities were ever taken from the token instead, a renewal token's ability
 * list would become a way to choose what the next access token can do.
 */
class RenewSessionController extends Controller
{
    public function __construct(private SessionTokenIssuer $tokens) {}

    public function __invoke(Request $request): JsonResponse
    {
        $account = $request->user();
        $presented = $account->currentAccessToken();

        $issued = $this->tokens->rotate(
            $account,
            $presented,
            // From the account type, never from the presented token — see the
            // class docblock. `AccountType::abilities()` is the same single
            // decision the four sign-in use cases make, so a renewal cannot
            // hand back a token with different reach than signing in would.
            AccountTypeRegistry::for($account)->abilities(),
        );

        return response()->json(['data' => $issued->toArray()]);
    }
}
