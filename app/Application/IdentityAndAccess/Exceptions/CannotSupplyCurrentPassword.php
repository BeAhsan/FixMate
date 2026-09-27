<?php

namespace App\Application\IdentityAndAccess\Exceptions;

use RuntimeException;

/**
 * The current password supplied to a password change was wrong.
 *
 * Distinct from every sign-in refusal on purpose. A sign-in failure is
 * deliberately indistinguishable between an unknown address, a wrong password and
 * a suspended account, because at that point the caller has proved nothing about
 * which addresses exist. Here they already hold a working session for this
 * account, so there is nothing to protect by being vague: they know the account
 * exists, and telling them the current password was wrong tells them nothing new.
 *
 * A vague answer here would be worse than useless. The person has just been told
 * by the sign-in screen that they must change their password, and "something was
 * wrong with your details" sends them back to guessing which of the two fields
 * they filled in.
 */
final class CannotSupplyCurrentPassword extends RuntimeException
{
    public const MESSAGE = 'That is not the password this account is currently using.';

    /**
     * The variant for an account that could not be resolved at all.
     *
     * Unreachable through the API — the account comes from the authenticated token,
     * so if the session is valid the account exists. It exists because the day a
     * path arrives where it *is* reachable, the honest answer is that the session is
     * the problem, and "that is not the password" would be a confident lie.
     */
    public static function forUnknownAccount(): self
    {
        return new self(
            'This session does not belong to an account that exists any more. Sign in again.'
        );
    }
}
