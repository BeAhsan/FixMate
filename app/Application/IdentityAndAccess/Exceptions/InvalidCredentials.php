<?php

namespace App\Application\IdentityAndAccess\Exceptions;

/**
 * The sign-in attempt did not produce a usable set of credentials.
 *
 * This one exception covers every case that must stay indistinguishable: an
 * address with no account, a wrong password, an address that belongs to a
 * different account type, and an account in a state that is neither active nor
 * suspended. The message is written to name neither which part was wrong nor
 * whether the address exists, so it is safe to send verbatim.
 */
final class InvalidCredentials extends SignInRefused
{
    public const MESSAGE = 'These credentials do not match our records.';
}
