<?php

namespace App\Http\Controllers\Auth;

use App\Domain\IdentityAndAccess\ValueObjects\AccountType;

/**
 * The worker application's password reset.
 *
 * Resets the `workers` store. The worker door is not the customer door with a
 * different URL: a worker who is also a customer has two accounts and two
 * passwords, and recovering one of them must leave the other signable.
 */
class WorkerPasswordResetController extends PasswordResetController
{
    protected function accountType(): AccountType
    {
        return AccountType::Worker;
    }
}
