<?php

namespace App\Domain\IdentityAndAccess\Entities;

use App\Domain\IdentityAndAccess\ValueObjects\AccountStatus;
use App\Domain\IdentityAndAccess\ValueObjects\Email;
use App\Domain\IdentityAndAccess\ValueObjects\UserId;

/**
 * Worker entity representing a supplier account.
 *
 * A worker is not an end user with a flag. The commercial attributes that make a
 * worker bookable - skills, rates, availability - belong on this record, and the
 * booking context adds them here. They are deliberately absent for now because
 * the booking context is out of scope for the platform foundation; the identity
 * and status fields below are all a sign-in needs.
 *
 * Like EndUser, this is a pure domain entity with no framework dependencies.
 */
readonly class Worker
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
     * Create a Worker from persistence data.
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
