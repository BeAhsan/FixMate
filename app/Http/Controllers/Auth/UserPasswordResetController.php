<?php

namespace App\Http\Controllers\Auth;

use App\Domain\IdentityAndAccess\ValueObjects\AccountType;

/**
 * The customer application's password reset.
 *
 * Resets the `users` store and nothing else. A person may also hold a worker,
 * an administrator or a super administrator account at the same address; this
 * door touches the customer record and leaves the other three exactly as they
 * were.
 */
class UserPasswordResetController extends PasswordResetController
{
    protected function accountType(): AccountType
    {
        return AccountType::User;
    }
}
