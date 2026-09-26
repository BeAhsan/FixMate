<?php

namespace App\Domain\IdentityAndAccess\Services;

use App\Domain\IdentityAndAccess\Entities\EndUser;

/**
 * Domain service for authentication business logic.
 * Contains pure domain rules with no framework dependencies.
 */
class AuthenticationService
{
    /**
     * Verify credentials against an end user entity.
     * This is a pure domain operation - no framework, no database.
     * Only checks password validity, not account status.
     */
    public function verifyCredentials(?EndUser $user, string $plainPassword): bool
    {
        // User not found
        if ($user === null) {
            return false;
        }

        // Verify password using PHP's password_verify (pure PHP, no framework)
        return password_verify($plainPassword, $user->passwordHash);
    }

    /**
     * Check if an account exists and is active.
     * Used for consistent error responses (prevents user enumeration).
     */
    public function isAccountActive(?EndUser $user): bool
    {
        return $user !== null && $user->canAuthenticate();
    }

    /**
     * Check if an account exists but is suspended.
     */
    public function isAccountSuspended(?EndUser $user): bool
    {
        return $user !== null && $user->isSuspended();
    }
}
