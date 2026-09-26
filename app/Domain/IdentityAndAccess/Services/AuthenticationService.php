<?php

namespace App\Domain\IdentityAndAccess\Services;

use App\Domain\IdentityAndAccess\ValueObjects\AccountStatus;

/**
 * Domain service for authentication business logic.
 * Contains pure domain rules with no framework dependencies.
 *
 * The methods take the two things every account type has - a password hash and
 * an account status - rather than a particular entity. Typing them to EndUser
 * would mean copying this service for each of the other three account types;
 * typing them to the shared value object means one implementation serves all
 * four, and neither end of the coupling knows which account type it is
 * authenticating.
 */
class AuthenticationService
{
    /**
     * Verify credentials against an account's password hash.
     * This is a pure domain operation - no framework, no database.
     * Only checks password validity, not account status.
     */
    public function verifyCredentials(?string $passwordHash, string $plainPassword): bool
    {
        // Account not found - no hash to compare against
        if ($passwordHash === null) {
            return false;
        }

        // Verify password using PHP's password_verify (pure PHP, no framework)
        return password_verify($plainPassword, $passwordHash);
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
}
