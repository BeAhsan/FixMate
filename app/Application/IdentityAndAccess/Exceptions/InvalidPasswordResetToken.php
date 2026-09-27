<?php

namespace App\Application\IdentityAndAccess\Exceptions;

use RuntimeException;

/**
 * A password reset could not be completed.
 *
 * One exception for every refusal the broker can return, because the caller must
 * not be able to tell them apart: a token that was never issued, a token that
 * has already been used, a token past its expiry, and an address no store holds
 * are four different facts and all of them are the same thing to the person
 * holding the link — it no longer works, and the only next step is to ask for a
 * new one.
 *
 * They are also the same thing to an attacker, which is the reason they share a
 * message. A reset endpoint that answered "unknown address" for one of them
 * would confirm which addresses hold accounts, and the four stores would start
 * leaking into each other through the reset flow — the exact thing the sign-in
 * paths are built not to do.
 */
class InvalidPasswordResetToken extends RuntimeException
{
    /**
     * The one message every refusal is reported as.
     */
    public const MESSAGE = 'This password reset link is no longer valid. Request a new one.';

    public function __construct(string $message = self::MESSAGE)
    {
        parent::__construct($message);
    }
}
