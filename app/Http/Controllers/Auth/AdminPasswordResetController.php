<?php

namespace App\Http\Controllers\Auth;

use App\Domain\IdentityAndAccess\ValueObjects\AccountType;

/**
 * The administrator application's password reset.
 *
 * Resets the `admins` store, and neither the super administrator store nor the
 * customer one. An administrator losing a password recovers their own account
 * and does not thereby become able to sign in to a different application.
 */
class AdminPasswordResetController extends PasswordResetController
{
    protected function accountType(): AccountType
    {
        return AccountType::Admin;
    }
}
