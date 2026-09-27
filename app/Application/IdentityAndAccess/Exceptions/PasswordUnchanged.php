<?php

namespace App\Application\IdentityAndAccess\Exceptions;

use RuntimeException;

/**
 * The "new" password was the one the account already had.
 *
 * Without this check, "you must change your password" could be satisfied by typing
 * the shared password again — and the flag would be cleared with nothing changed.
 * That is the exact outcome story 21 exists to prevent, and it would be reported
 * to the person as a success.
 *
 * The comparison is on the plaintext, which the use case has in hand, rather than
 * on two hashes. Re-deriving the old hash from the old plaintext and comparing
 * hashes would compare plaintexts with extra steps, and would also fail the moment
 * the configured cost changed between the two calls.
 */
final class PasswordUnchanged extends RuntimeException
{
    public const MESSAGE = 'That is the password this account is already using. Choose one you have not used here before.';
}
