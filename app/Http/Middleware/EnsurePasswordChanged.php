<?php

namespace App\Http\Middleware;

use App\Domain\IdentityAndAccess\ValueObjects\AccountStatus;
use Closure;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Refuses every request from an account that must replace its password.
 *
 * The control behind story 21. The `must_change_password` flag in a sign-in
 * response is a courtesy — it lets a front end route to the change screen instead
 * of to a dashboard that will refuse everything — and a courtesy is not a
 * control. This is the control: a client that ignores the flag entirely still
 * cannot reach a single other endpoint, because its access token works and this
 * says no.
 *
 * That is the same split ticket 10 drew between an ability and an account type,
 * and it is why the flag alone would have been worse than nothing. A flag that is
 * set and never checked reads as protection on the record of every account created
 * by `fixmate:create-account` and protects nothing.
 *
 * ## Two routes are exempt, and both have to be
 *
 * **The change-password route**, or the account is locked out of the only thing
 * that would help. Exempted with `withoutMiddleware()` on the route rather than by
 * a path check in here, so the exemption is visible where the route is defined and
 * cannot be forgotten when a route is added.
 *
 * **Sign-out.** Somebody who must change their password is still allowed to end
 * the session. Refusing it would trap a person in a session they cannot use, on a
 * shared device, which is the situation the rule exists to protect. Signing out
 * revokes their own tokens, which is a strictly larger reduction in their access
 * than anything this middleware could do.
 *
 * Everything else in the `auth:sanctum` group is refused, **including renewal**.
 * A guard that only closed the access door would leave a renewal token in browser
 * storage that buys a fresh access token every fifteen minutes, and the
 * "must change your password" state would be undone by standing still. The renewal
 * route is inside the group, so it is covered without a second thought.
 *
 * The password *reset* flow is outside the group and therefore unaffected, which is
 * a real escape hatch: a person who cannot get through this can still use the link
 * that was emailed to them. Deliberate, and the reason this is a 403 rather than a
 * lock-out.
 *
 * ## Why 403 and not 401
 *
 * The token is valid. The account is active. Nothing about the credential has
 * expired or been revoked, and saying otherwise would send the front end back to
 * the sign-in screen — which would be a loop, because signing in again produces
 * the same flag and the same 403. The person is signed in and is being told what
 * to do, and a front end can act on that without inventing a state.
 */
class EnsurePasswordChanged
{
    public const ALIAS = 'password.changed';

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $account = $request->user();

        // No account: not this middleware's business. `auth:sanctum` runs first on
        // every route in the group and answers 401 for a missing or unusable
        // credential. Refusing here as well would mean two middlewares disagreeing
        // about a missing identity, and the one that ran second would be the one
        // whose message reached the person.
        if (! $account) {
            return $next($request);
        }

        // `true` on a column that is not there would be alarming and wrong, so the
        // attribute is read defensively: an account store without the column is a
        // deployment that has not been migrated, and that should be a loud 500 in
        // the log rather than a silent pass that lets every account through.
        if (! array_key_exists('must_change_password', $account->getAttributes())) {
            Log::error('The must_change_password column is missing. Run the migrations.', [
                'account_type' => $account::class,
                'path' => $request->path(),
            ]);

            abort(500, 'This account store is missing a required column. Run the migrations.');
        }

        if (! $account->getAttribute('must_change_password')) {
            return $next($request);
        }

        // A suspended account is refused by `account.can` with a message about
        // suspension, which is the more useful of the two facts. This one runs
        // earlier in the stack on some routes, so it checks for itself rather than
        // relying on ordering: telling somebody to change their password when their
        // account is suspended would send them to do something that will not help.
        if (! AccountStatus::fromString((string) $account->status)->isActive()) {
            return $next($request);
        }

        // `AuthorizationException`, the same exception `EnsureAccountCan` throws, so
        // both refusals on a route arrive at the front end as the same 403 with the
        // same body shape. A second status code here would be a state the client has
        // to learn about separately, and the only thing distinguishing it from a
        // suspension would be which message it carries.
        throw new AuthorizationException(
            'Choose a new password for this account before using it.'
        );
    }
}
