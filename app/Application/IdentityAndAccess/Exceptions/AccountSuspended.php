<?php

namespace App\Application\IdentityAndAccess\Exceptions;

/**
 * The credentials were correct and the account is suspended.
 *
 * This is the one refusal that deliberately differs from
 * {@see InvalidCredentials}, and it is only ever reached *after* the password
 * has been verified. That ordering is the whole of its safety: an attacker who
 * does not hold the correct password can never reach this exception, so
 * learning that an account is suspended is not something they can obtain by
 * guessing addresses.
 *
 * Once the password is known to be correct there is no enumeration left to
 * protect — the person is already authenticated — and a truthful message with a
 * real next step is more useful than a generic one.
 */
final class AccountSuspended extends SignInRefused
{
    public const MESSAGE = 'Your account has been suspended. Please contact an administrator to have it restored.';
}
