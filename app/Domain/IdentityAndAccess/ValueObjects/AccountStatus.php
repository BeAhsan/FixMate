<?php

namespace App\Domain\IdentityAndAccess\ValueObjects;

/**
 * Value object representing an account status.
 * Encapsulates the business rules for account status.
 */
enum AccountStatus: string
{
    case Active = 'active';
    case Suspended = 'suspended';
    case Pending = 'pending';

    public function isActive(): bool
    {
        return $this === self::Active;
    }

    public function isSuspended(): bool
    {
        return $this === self::Suspended;
    }

    public function isPending(): bool
    {
        return $this === self::Pending;
    }

    /**
     * Create from string, defaulting to Active for unknown values.
     */
    public static function fromString(string $value): self
    {
        $normalized = strtolower($value);

        return self::tryFrom($normalized) ?? self::Active;
    }
}
