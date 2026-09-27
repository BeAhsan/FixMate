<?php

namespace App\Application\IdentityAndAccess\Exceptions;

use RuntimeException;

/**
 * A super administrator tried to promote the account they are signed in with.
 *
 * Promotion creates a *second* record in the super_admins table, so promoting
 * oneself would leave one person holding two super administrator accounts with
 * two identifiers and two token sets — a way to be signed out of one account and
 * still signed in through the other, which is precisely the state a suspension is
 * supposed to be able to close. The rule exists to keep one person to one record.
 *
 * Distinct from {@see CannotSuspendSelf} rather than a shared exception with a
 * parameterised message, because the two answer different questions to the person
 * who tripped them, and a caller that catches this one by type is stating which
 * rule it thinks it is enforcing.
 */
final class CannotPromoteSelf extends RuntimeException
{
    public const MESSAGE = 'You cannot promote the account you are signed in with. You already hold this role.';
}
