<?php

namespace App\Infrastructure\IdentityAndAccess;

use App\Application\IdentityAndAccess\DTOs\IssuedTokens;
use App\Domain\IdentityAndAccess\ValueObjects\Ability;
use DateTimeImmutable;
use Illuminate\Database\Eloquent\Model;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * The only code in the application that knows Sanctum exists.
 *
 * Everything about a session's lifetime is decided here, in one file, because
 * the two credentials have opposite trade-offs and it is very easy to get them
 * the wrong way round:
 *
 * - The **access token** is short-lived and goes into memory. It is worth
 *   little on its own, which is what makes it safe to hand to a browser.
 * - The **renewal token** is longer-lived and goes into browser storage, where
 *   injected script can read it. It is worth almost nothing: it can only mint a
 *   new access token, and it is spent the moment it does.
 *
 * A renewal token is a Sanctum token like any other, which means `auth:sanctum`
 * would otherwise accept it everywhere. What stops that is its ability list:
 * it carries `session:renew` and nothing else, and `EnsureAccountCan` refuses
 * any token carrying that ability. So the restriction is enforced by the same
 * middleware that enforces the business abilities, rather than by a second
 * mechanism that could disagree with the first.
 */
final class SessionTokenIssuer
{
    /**
     * The name given to an access token.
     *
     * Diagnostic only — nothing branches on it. The ability list is what is
     * enforced, because a name is not a claim.
     */
    private const ACCESS_TOKEN_NAME = 'access';

    /**
     * The name given to a renewal token. See {@see self::ACCESS_TOKEN_NAME}:
     * this one is for a human reading a database row, not for the code.
     */
    private const RENEWAL_TOKEN_NAME = 'renewal';

    public function __construct(
        private readonly int $accessLifetimeMinutes,
        private readonly int $renewalLifetimeMinutes,
    ) {}

    /**
     * Mint a fresh pair of tokens for an account that has just proved itself.
     *
     * @param  list<string>  $abilities  The account type's abilities, so the access
     *                                   token carries exactly what the sign-in door issued.
     */
    public function issue(Model $account, array $abilities): IssuedTokens
    {
        $accessExpiresAt = $this->accessExpiry();
        $renewalExpiresAt = $this->renewalExpiry();

        $access = $account->createToken(self::ACCESS_TOKEN_NAME, $abilities, $accessExpiresAt);

        // A renewal token gets exactly one ability, and it is not one of the
        // account type's. If it carried `users:*` it would be a second access
        // token with a longer life, stored somewhere readable — which is the
        // thing this whole arrangement exists to avoid.
        $renewal = $account->createToken(
            self::RENEWAL_TOKEN_NAME,
            [Ability::SESSION_RENEW],
            $renewalExpiresAt,
        );

        return new IssuedTokens(
            accessToken: $access->plainTextToken,
            renewalToken: $renewal->plainTextToken,
            accessTokenExpiresAt: $accessExpiresAt,
            renewalTokenExpiresAt: $renewalExpiresAt,
        );
    }

    /**
     * Exchange a renewal token for a new pair, spending the one presented.
     *
     * The revocation happens before the new pair is minted, and it is the whole
     * point: a renewal token is worth exactly one use. If it is stolen, the
     * legitimate holder's next renewal fails and the thief's succeeds, and
     * whichever happens second fails too — so the copy is detectably spent
     * rather than quietly reusable.
     *
     * There is no grace period and no "still valid if you present it once more"
     * rule, because either would hand the property that rotation is for back to
     * an attacker who has a copy.
     */
    public function rotate(
        Model $account,
        PersonalAccessToken $presentedRenewalToken,
        array $abilities,
    ): IssuedTokens {
        $presentedRenewalToken->delete();

        return $this->issue($account, $abilities);
    }

    /**
     * End every session this account has, in every application at once.
     *
     * All of them, not the one making the request. A person who signs out of
     * the worker application while signed in to the user application expects to
     * be signed out of both, and the only way to guarantee that is to revoke
     * every token the account holds — the access tokens the other applications
     * are holding in memory included. Revoking the renewal tokens as well means
     * a reload cannot resurrect the session from storage.
     */
    public function revokeAllFor(Model $account): void
    {
        $account->tokens()->delete();
    }

    private function accessExpiry(): DateTimeImmutable
    {
        return new DateTimeImmutable('@'.time() + $this->accessLifetimeMinutes * 60);
    }

    private function renewalExpiry(): DateTimeImmutable
    {
        return new DateTimeImmutable('@'.time() + $this->renewalLifetimeMinutes * 60);
    }
}
