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
 * The rule for the one route a renewal token may call.
 *
 * This is the mirror image of {@see EnsureAccountCan}, and the two are
 * deliberately separate classes rather than one middleware with a flag. Between
 * them they draw the whole boundary of what a renewal token can do, and a
 * single class with a boolean parameter would make the safe case — "this token
 * is the wrong kind for this route" — depend on reading the route file
 * correctly. Two classes means each route's rule is visible from its own name.
 *
 * A renewal token is worth almost nothing: it mints one new access token and is
 * spent. What it must never be is a second, longer-lived access token. Three
 * things enforce that, and all three are here or in its counterpart:
 *
 *   - it carries only `session:renew`, never an account type's own abilities;
 *   - {@see EnsureAccountCan} refuses any token carrying that ability, so it
 *     cannot reach a single business route;
 *   - this middleware refuses anything that is *not* carrying it, so an access
 *     token cannot be used to renew. That direction matters as much: an access
 *     token is the more valuable credential, and letting it drive renewal would
 *     hand out extra access tokens to anyone holding one.
 *
 * The account's status is checked here for the same reason it is checked on
 * business routes: a suspension has to take effect at once. Without it, a
 * suspended person keeps a working session by never reloading, which is exactly
 * the window a suspension is supposed to close.
 */
class EnsureSessionCan
{
    private const UNKNOWN_ACCOUNT_TYPE = 'The route %s requires the account type "%s", which this application does not have. Add it to AccountType before guarding a route with it.';

    public function handle(Request $request, Closure $next, string $accountType): Response
    {
        $account = $request->user();

        // A 401 rather than a 403: there is no identity, so "sign in" is the
        // honest instruction. It is also the answer a front end needs in order
        // to tell "your session has ended, sign in again" apart from "your
        // account may not do this", and the difference is a whole screen.
        if (! $account) {
            throw new AuthenticationException;
        }

        $expected = AccountType::tryFrom($accountType);

        if (! $expected) {
            abort(500, sprintf(self::UNKNOWN_ACCOUNT_TYPE, $request->path(), $accountType));
        }

        $actual = AccountTypeRegistry::for($account);
        $abilities = $account->currentAccessToken()?->abilities ?? [];

        // Renewal-scoped, or refused. Checked before the account type so that a
        // token presented at the wrong door is told the thing that is actually
        // wrong with it.
        if (! in_array(Ability::SESSION_RENEW, $abilities, true)) {
            throw new AuthorizationException('This endpoint accepts a renewal token only. An access token cannot be used to renew a session.');
        }

        if ($actual !== $expected) {
            throw new AuthorizationException(
                'This token is for '.$actual->label().' account, not '
                .$expected->label().' account. Sign in at the '
                .$expected->label().' application to use this endpoint.'
            );
        }

        if (! AccountStatus::fromString((string) $account->status)->isActive()) {
            Log::info('Refused to renew a session for a suspended account.', [
                'account_type' => $actual->value,
                'account_id' => $account->getKey(),
                'path' => $request->path(),
            ]);

            throw new AuthorizationException('Your account has been suspended. Please contact an administrator to have it restored.');
        }

        return $next($request);
    }
}
