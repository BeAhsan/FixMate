<?php

namespace App\Http\Middleware;

use App\Domain\IdentityAndAccess\ValueObjects\Ability;
use App\Domain\IdentityAndAccess\ValueObjects\AccountStatus;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;
use App\Infrastructure\IdentityAndAccess\AccountTypeRegistry;
use Closure;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * The control that makes a front end's hidden navigation a convenience rather
 * than the protection.
 *
 * A route guarded by this middleware names two things: the account type the
 * route belongs to, and — optionally — one ability the request must carry. Both
 * are checked, because either alone is insufficient and the gap between them is
 * the interesting part:
 *
 * - The *type* check is what stops a customer's token opening a worker's door.
 *   It cannot be expressed as an ability, because every account type is issued
 *   *some* ability, and a check that only compared abilities would have to
 *   enumerate what each type does not have — a list a fifth account type could
 *   forget to be subject to.
 * - The *ability* check is what stops an administrator reaching a function that
 *   belongs to a super administrator, and it is read from the token's own claims
 *   rather than recomputed, so that widening a token's reach in transit changes
 *   nothing: the claim list is what the sign-in door issued.
 *
 * **The order of the two checks is deliberate, and it differs by whether the
 * route named an ability.** When it did, the ability is checked first, so an
 * administrator calling a super administrator's function is told the function is
 * not theirs rather than being told to go and sign in somewhere else — the first
 * is the true reason and the second would be misleading advice. When the route
 * named no ability, the type is all there is to check.
 *
 * Both refusals are 403 and both carry a `message`, which is the shape every
 * other refusal on this API already uses. A clear answer is the requirement: the
 * alternative is a 500 or a stack trace, which tells an attacker about the
 * deployment and tells the person nothing about what to do next.
 *
 * A suspended account is refused here rather than at sign-in, which is what makes
 * a suspension take effect at once instead of at the holder's next sign-in. That
 * matters because an access token outlives the decision that issued it: without
 * this check, withdrawing someone's access would not actually withdraw it until
 * their token expired.
 *
 * This middleware reads Eloquent through {@see AccountTypeRegistry}, which is
 * the one place in the application that maps a model to a credential store. It
 * does so deliberately: the domain must not know that Eloquent models exist, so
 * the map cannot live on the enum, and the HTTP layer is where a request's
 * authenticated model is a framework object in the first place. Keeping the map
 * in one registry is what stops this and the password reset URL builder from
 * each carrying their own copy.
 */
class EnsureAccountCan
{
    /**
     * The middleware parameter naming an account type that does not exist.
     *
     * A route that names a fifth account type before the enum knows about it is a
     * typo that would otherwise become a 403 for every request to a route that
     * ought to work — a silent, total failure that looks like a permissions
     * problem and is not one. Refusing to boot the route is louder and cheaper.
     */
    private const UNKNOWN_ACCOUNT_TYPE = 'The route %s requires the account type "%s", which this application does not have. Add it to AccountType before guarding a route with it.';

    public function handle(Request $request, Closure $next, string $accountType, ?string $ability = null): Response
    {
        $account = $request->user();

        // No token, or a token whose owner has since been deleted. 401 rather
        // than 403: there is no identity to refuse, so "sign in" is the honest
        // instruction, and the distinction keeps a front end able to tell "your
        // session ended" from "your account may not do this".
        if (! $account) {
            throw new AuthenticationException;
        }

        $expected = AccountType::tryFrom($accountType);

        if (! $expected) {
            abort(500, sprintf(self::UNKNOWN_ACCOUNT_TYPE, $request->path(), $accountType));
        }

        $actual = AccountTypeRegistry::for($account);

        $token = $account->currentAccessToken();
        $abilities = $token?->abilities ?? [];

        // A renewal token is refused here, before anything else is considered,
        // and this is the rule that makes it safe to keep one in browser
        // storage.
        //
        // A renewal token is a Sanctum token like any other, so `auth:sanctum`
        // has already resolved the account and everything below would let it
        // through on a route that named no ability. It lives in storage where
        // injected script can read it, so unlike the access token it cannot be
        // trusted to be worth little on its own — the restriction has to be
        // enforced by the server, not by the client declining to use it.
        //
        // It is refused as a *forbidden* rather than unauthenticated because the
        // caller does hold a working credential; it simply is not one this route
        // accepts. The message says so plainly, because a front end holding one
        // of these by mistake needs to be told to renew rather than to sign in.
        if (in_array(Ability::SESSION_RENEW, $abilities, true)) {
            throw new AuthorizationException('This token may only be used to renew a session. It cannot be used to call this endpoint.');
        }

        // Ability first, where the route named one. See the class docblock.
        if ($ability !== null && ! $expected->may($abilities, $ability)) {
            throw new AuthorizationException($this->notPermitted());
        }

        if ($actual !== $expected) {
            throw new AuthorizationException($this->wrongDoor($actual, $expected));
        }

        // Deliberately last. A request that is already going to be refused for
        // being the wrong kind of account is told that, and not also that its
        // status is wrong: two reasons in one response is two facts about an
        // account handed to whoever asked, and the first one is the one they
        // need. `fromString` fails closed, so an unrecognised status denies
        // access here rather than granting it.
        if (! AccountStatus::fromString((string) $account->status)->isActive()) {
            Log::info('Refused a suspended account.', [
                'account_type' => $actual->value,
                'account_id' => $account->getKey(),
                'path' => $request->path(),
            ]);

            throw new AuthorizationException('Your account has been suspended. Please contact an administrator to have it restored.');
        }

        return $next($request);
    }

    /**
     * The refusal for a valid token that lacks the ability the route requires.
     *
     * Deliberately does not say which ability was missing or what it would have
     * unlocked. Naming it would turn a 403 into an oracle: an account could read
     * the access model of the platform off a series of refused requests, which
     * is the same mistake as confirming which addresses exist in a credential
     * store, one layer up.
     */
    private function notPermitted(): string
    {
        return 'Your account is not permitted to perform this action.';
    }

    /**
     * The refusal for a token of the wrong account type, at a door that belongs
     * to another one.
     *
     * This one *does* name both types, and that is safe where the ability
     * refusal is not, because the caller already proved they hold a valid token:
     * the information is about a credential they are already holding, so it
     * tells them nothing about anyone else's. It is also the answer they need —
     * a person who signed in at the right door and arrived at the wrong one
     * needs to be told which door to use, not told their password was wrong.
     */
    private function wrongDoor(AccountType $actual, AccountType $expected): string
    {
        return 'This token is for '.$actual->label().' account, not '
            .$expected->label().' account. Sign in at the '
            .$expected->label().' application to use this endpoint.';
    }
}
