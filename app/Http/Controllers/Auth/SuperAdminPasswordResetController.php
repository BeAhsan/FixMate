<?php

namespace App\Http\Controllers\Auth;

use App\Domain\IdentityAndAccess\ValueObjects\AccountType;

/**
 * The super administrator application's password reset.
 *
 * Resets the `super_admins` store. This is a separate door from the
 * administrator one for the same reason sign-in is: the widest ability in the
 * platform is issued here and nowhere else, and a recovery flow is a way to
 * reach an account, so it does not get a wider key than the door does.
 */
class SuperAdminPasswordResetController extends PasswordResetController
{
    protected function accountType(): AccountType
    {
        return AccountType::SuperAdmin;
    }
}
