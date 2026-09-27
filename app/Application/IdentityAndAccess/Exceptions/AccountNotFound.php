<?php

namespace App\Application\IdentityAndAccess\Exceptions;

use RuntimeException;

/**
 * No account with that identifier exists.
 *
 * Distinct from every refusal about what a caller may do, and reachable only
 * once they have been allowed to look. That ordering is the point: the middleware
 * has already refused anyone without the ability before the identifier is
 * resolved at all, so "no such account" and "not yours" are never the same
 * answer to an unauthorised caller — otherwise the difference between a 403 and
 * a 404 would let anyone walk the identifier space of the admins table and learn
 * which administrator records exist.
 */
final class AccountNotFound extends RuntimeException
{
    public const MESSAGE = 'That account does not exist.';
}
