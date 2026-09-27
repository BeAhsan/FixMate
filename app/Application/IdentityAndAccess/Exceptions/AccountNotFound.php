<?php

namespace App\Application\IdentityAndAccess\Exceptions;

use RuntimeException;

/**
 * The record the caller asked for does not exist.
 *
 * A separate class rather than a fourth `NotPermitted` because it is a different
 * answer to a different question, and that difference is the point. `NotPermitted`
 * says "you may not"; this says "there is nothing there". Handing the 404 back as
 * a 403 would be a small lie to anyone holding a token that is allowed to ask —
 * and a super administrator who mistypes an identifier would be told to go and
 * sign in somewhere else, which is not a thing they can do.
 *
 * It is only ever raised to a caller who has already been authorised to read
 * *every* account in the store, so unlike the ownership refusal it reveals
 * nothing about which identifiers exist. That ordering is not a property of this
 * class; it is the property of `DescribeAdministrator`, which decides whether the
 * caller may ask at all before it looks anything up. Put another caller in front
 * of this exception and it becomes an enumeration oracle in one line, which is
 * why it is not reachable from a route that only checks an account type.
 *
 * The code is a constant where `NotPermitted` carries one as a property, and
 * that is the whole of the reason: there is exactly one way to be told a record
 * is missing, so there is nothing to pass in and nothing to get wrong. See the
 * note on `NotPermitted` for why that property is not called `code`.
 */
class AccountNotFound extends RuntimeException
{
    public const CODE = 'not_found';

    public function __construct(
        string $message = 'No account in this store has that identifier.',
        public readonly array $details = [],
    ) {
        parent::__construct($message);
    }
}
