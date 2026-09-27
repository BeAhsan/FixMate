<?php

namespace App\Application\IdentityAndAccess\Exceptions;

use RuntimeException;

/**
 * Somebody being promoted already has a super administrator account.
 *
 * A real case rather than a theoretical one: an administrator can be promoted,
 * have the promotion reversed by suspending the new record, and then be promoted
 * again — and the address is still in `super_admins`. It can also happen by
 * accident, when somebody is both an administrator and a super administrator
 * already.
 *
 * The database would refuse the insert on its unique index. Left alone, that
 * surfaces as a 500, which tells the person driving the interface that the
 * platform is broken and tells them nothing about the account they were looking
 * at. This turns it into a 409 and a sentence about the address.
 */
final class SuperAdminAlreadyExists extends RuntimeException
{
    public const MESSAGE = 'That address already has a super administrator account. Sign in as that account instead of promoting again.';
}
