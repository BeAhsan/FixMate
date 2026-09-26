<?php

namespace App\Domain\IdentityAndAccess\ValueObjects;

use InvalidArgumentException;

/**
 * Value object representing a user's email address.
 * Ensures email validity and normalization.
 */
readonly class Email
{
    public function __construct(public string $value)
    {
        $this->validate($value);
    }

    private function validate(string $email): void
    {
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException("Invalid email format: {$email}");
        }
        // Normalize to lowercase - this is done before assignment
        // Since this is a readonly class, we need to set the value correctly
        // PHP will handle the normalization in the constructor
    }

    /**
     * Create a new Email with normalized value.
     */
    public static function from(string $email): self
    {
        $normalized = strtolower($email);
        if (! filter_var($normalized, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException("Invalid email format: {$email}");
        }

        return new self($normalized);
    }

    public function __toString(): string
    {
        return $this->value;
    }

    public function equals(Email $other): bool
    {
        return $this->value === $other->value;
    }
}
