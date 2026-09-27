<?php

namespace App\Domain\IdentityAndAccess\ValueObjects;

/**
 * The names of the abilities that exist on this platform.
 *
 * An ability is a claim about what a token may do, carried on the token itself
 * so that it travels with the request and cannot be widened in transit. Naming
 * them in one place is what makes "an administrator is refused the functions
 * that belong to a super administrator" a checkable fact rather than a
 * convention: the middleware requires a name from here, and the account type
 * either grants it or does not.
 *
 * The names are strings because Sanctum stores them as strings and compares them
 * as strings. Wrapping them in a type would be tidier at the edges and would put
 * a cast at every comparison, which is exactly where a subtle mismatch hides.
 * The constant is the type.
 */
final class Ability
{
    /**
     * The wildcard. Held only by super administrators.
     *
     * The one place in the platform where a token may do anything, and it is
     * deliberately a single account type rather than a role an administrator
     * can also be given — that is what keeps the most powerful account type
     * countable. `SignInSuperAdmin` is the only place that issues it, and
     * `AccountType::abilities()` is what decides it, so there is one decision
     * rather than four sign-in flows each making their own.
     */
    public const WILDCARD = '*';

    /**
     * Read every account across all four stores, with each one's status.
     *
     * Super administrator only. This is the ability that reaches past a
     * credential store, so it is the one that most needs to be a distinct claim
     * rather than a widening of an administrator's own.
     */
    public const ACCOUNTS_READ = 'accounts:read';

    /**
     * Suspend an account without deleting it.
     *
     * Super administrator only, and the reason an administrator is refused it is
     * not merely rank: an administrator who could suspend any account could
     * suspend a super administrator, and the narrowest account type would not
     * stay narrow.
     */
    public const ACCOUNTS_SUSPEND = 'accounts:suspend';

    /**
     * Promote an administrator to a super administrator.
     *
     * Super administrator only. Self-promotion is separately refused: without
     * that, this ability would let an administrator grant it to themselves and
     * the guard rail would be a speed bump.
     */
    public const ACCOUNTS_PROMOTE = 'accounts:promote';

    /**
     * The abilities that belong to a super administrator and to nobody else.
     *
     * Listed here so that a test can assert the separation directly — for each
     * of these, no account type below SuperAdmin grants it — rather than
     * inferring it from four separate sign-in flows.
     *
     * @return list<string>
     */
    public static function superAdministratorOnly(): array
    {
        return [
            self::ACCOUNTS_READ,
            self::ACCOUNTS_SUSPEND,
            self::ACCOUNTS_PROMOTE,
        ];
    }
}
