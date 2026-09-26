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
     * Create from a stored value, defaulting to Suspended for anything unknown.
     *
     * This fails closed deliberately. A status this code does not recognise —
     * because the row was corrupted, or because a value was added to the column
     * that this code has not been taught about — must not be treated as Active.
     * An unrecognised status denies access; it never grants it.
     */
    public static function fromString(string $value): self
    {
        $normalized = strtolower(trim($value));

        return self::tryFrom($normalized) ?? self::Suspended;
    }
}
