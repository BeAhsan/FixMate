<?php

namespace App\Domain\IdentityAndAccess\ValueObjects;

/**
 * Value object representing a user identifier.
 * Provides type safety for user IDs across the domain.
 */
readonly class UserId
{
    public function __construct(public int $value)
    {
        if ($value <= 0) {
            throw new \InvalidArgumentException('User ID must be a positive integer');
        }
    }

    public function __toString(): string
    {
        return (string) $this->value;
    }

    public function equals(UserId $other): bool
    {
        return $this->value === $other->value;
    }
}
