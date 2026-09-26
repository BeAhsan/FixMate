<?php

namespace App\Domain\IdentityAndAccess\Services;

use App\Domain\IdentityAndAccess\ValueObjects\AccountStatus;

/**
 * Domain service for authentication business logic.
 * Contains pure domain rules with no framework dependencies.
 *
 * The methods take the two things every account type has - a password hash and
 * an account status - rather than a particular entity. Typing them to one
 * entity would mean copying this service for each of the four account types;
 * typing them to the shared value object means one implementation serves all
 * four, and neither end of the coupling knows which account type it is
 * authenticating.
 */
final class AuthenticationService
{
    /**
     * Decoy hashes, memoised per bcrypt cost.
     *
     * A hash is expensive to compute on purpose, and that expense is the reason
     * comparing a password takes a predictable, measurable amount of time. So a
     * comparison that is skipped is a comparison whose absence is measurable
     * too. These decoys are what stops the refusal for an unknown address from
     * being faster than the refusal for a wrong password.
     *
     * Keyed by cost, because a decoy is only an equaliser if it was produced at
     * the same cost as the real hashes it stands in for. One hardcoded decoy
     * would silently stop working the moment the configured cost changed.
     *
     * @var array<int, string>
     */
    private static array $decoyHashes = [];

    public function __construct(private readonly int $bcryptCost) {}

    /**
     * Verify credentials against an account's password hash.
     *
     * The comparison is performed whether or not the address is registered, and
     * the result is discarded when there is no account. The return value is
     * `false` in every case that is not a registered address with a matching
     * password, so no caller can tell those cases apart by looking here.
     *
     * This is a pure domain operation - no framework, no database.
     * Only checks password validity, not account status.
     */
    public function verifyCredentials(?string $passwordHash, string $plainPassword): bool
    {
        $hash = $passwordHash ?? $this->decoyHash();

        $passwordMatches = password_verify($plainPassword, $hash);

        return $passwordHash !== null && $passwordMatches;
    }

    /**
     * Check if an account exists and is active.
     * Used for consistent error responses (prevents user enumeration).
     */
    public function isAccountActive(?AccountStatus $status): bool
    {
        return $status !== null && $status->isActive();
    }

    /**
     * Check if an account exists but is suspended.
     */
    public function isAccountSuspended(?AccountStatus $status): bool
    {
        return $status !== null && $status->isSuspended();
    }

    /**
     * A throwaway hash at the application's configured bcrypt cost.
     *
     * The plaintext behind it is random and never leaves this process, so it
     * cannot be guessed from outside; its only job is to make `password_verify`
     * do the same work it would have done for a real account.
     */
    private function decoyHash(): string
    {
        return self::$decoyHashes[$this->bcryptCost] ??= password_hash(
            bin2hex(random_bytes(32)),
            PASSWORD_BCRYPT,
            ['cost' => $this->bcryptCost],
        );
    }
}
