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
 *
 * ## Why this route is exempt from `EnsurePasswordChanged`
 *
 * It used not to be, and the reason it changed is the reason the response
 * carries `must_change_password`.
 *
 * Renewal is the only way a session survives a page reload, because the access
 * token is held in memory. So refusing it meant that a person who signed in,
 * was routed to the change-password screen, and then refreshed — or whose
 * connection dropped — was signed out mid-form and told their account could not
 * be used. That is false, and it is the worst possible answer: the account is
 * fine, and the thing it needs is the form they were already looking at.
 *
 * The security argument for refusing does not survive contact with the rest of
 * the arrangement. A renewal mints an access token, and that token is refused
 * by `EnsurePasswordChanged` on every route except the change and sign-out, so
 * it can reach nothing. The rule is enforced on the token's use, not on its
 * existence, and a token nobody can use with is not a way around anything.
 *
 * `routes/api.php` carries the long version next to the exemption itself.
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

        return response()->json([
            'data' => [
                ...$issued->toArray(),
                // The same field the sign-in response reports, and for the same
                // reason: a client that has just restored a session from a
                // renewal token has no other way of learning that the account
                // must still choose a password. Without it the only signal would
                // be the 403 every other route returns, and acting on that means
                // matching on the back end's wording - which is a second place
                // where the meaning of that sentence is decided, and it changes
                // silently when somebody improves the phrasing.
                //
                // Advisory in exactly the way the sign-in copy of it is: the
                // refusal lives in `EnsurePasswordChanged`, and a client that
                // ignores this field still cannot reach anything. Read it to route
                // somebody to the screen that helps; do not treat it as the control.
                'must_change_password' => (bool) $account->must_change_password,
            ],
        ]);
    }
}
