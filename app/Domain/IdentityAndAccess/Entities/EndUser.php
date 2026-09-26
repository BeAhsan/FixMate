<?php

namespace App\Domain\IdentityAndAccess\Entities;

use App\Domain\IdentityAndAccess\ValueObjects\AccountStatus;
use App\Domain\IdentityAndAccess\ValueObjects\Email;
use App\Domain\IdentityAndAccess\ValueObjects\UserId;

/**
 * End user entity representing a customer account.
 *
 * This is a pure domain entity with no framework dependencies.
 * It contains the business rules for an end user account.
 */
readonly class EndUser
{
    public function __construct(
        public UserId $id,
        public string $name,
        public Email $email,
        public string $passwordHash,
        public AccountStatus $status,
    ) {}

    /**
     * Check if the account is active and can authenticate.
     */
    public function canAuthenticate(): bool
    {
        return $this->status->isActive();
    }

    /**
     * Check if the account is suspended.
     */
    public function isSuspended(): bool
    {
        return $this->status->isSuspended();
    }

    /**
     * Create an EndUser from persistence data.
     */
    public static function fromPersistence(
        int $id,
        string $name,
        string $email,
        string $passwordHash,
        string $status,
    ): self {
        return new self(
            id: new UserId($id),
            name: $name,
            email: Email::from($email),
            passwordHash: $passwordHash,
            status: AccountStatus::fromString($status),
        );
    }
}
