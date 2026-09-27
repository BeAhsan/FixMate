<?php

namespace App\Application\IdentityAndAccess\DTOs;

use DateTimeImmutable;

/**
 * The two credentials a session is made of, as plain values.
 *
 * A DTO rather than a Sanctum model so that nothing above the infrastructure
 * layer has to know what a token is made of. The two are kept together because
 * they are always issued together and always rotated together, and a caller
 * that could receive one without the other is a caller that will eventually
 * store an access token somewhere it should not be.
 */
final class IssuedTokens
{
    public function __construct(
        /** Short-lived, held in memory, never written to storage. */
        public readonly string $accessToken,
        /** Longer-lived, held in browser storage, mints one more access token. */
        public readonly string $renewalToken,
        public readonly DateTimeImmutable $accessTokenExpiresAt,
        public readonly DateTimeImmutable $renewalTokenExpiresAt,
    ) {}

    /**
     * @return array{access_token: string, renewal_token: string, access_token_expires_at: string, renewal_token_expires_at: string}
     */
    public function toArray(): array
    {
        return [
            'access_token' => $this->accessToken,
            'renewal_token' => $this->renewalToken,
            'access_token_expires_at' => $this->accessTokenExpiresAt->format(DATE_ATOM),
            'renewal_token_expires_at' => $this->renewalTokenExpiresAt->format(DATE_ATOM),
        ];
    }

    /**
     * The same pair, named the way a sign-in response names it.
     *
     * `token` rather than `access_token`, because that is the key the four
     * sign-in responses have always used and changing it would break every
     * front end for no gain. The renewal route, which has no history to keep,
     * uses {@see self::toArray()} and is explicit about which token is which.
     */
    public function toSignInArray(): array
    {
        return array_merge($this->toArray(), ['token' => $this->accessToken]);
    }
}
