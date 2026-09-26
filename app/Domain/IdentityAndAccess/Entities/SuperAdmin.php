<?php

namespace App\Domain\IdentityAndAccess\Entities;

use App\Domain\IdentityAndAccess\ValueObjects\AccountStatus;
use App\Domain\IdentityAndAccess\ValueObjects\Email;
use App\Domain\IdentityAndAccess\ValueObjects\UserId;

/**
 * SuperAdmin entity representing a staff account with unrestricted access.
 *
 * A separate entity in a separate table, not an Admin with a flag. The spec
 * accepts the cost of that explicitly: promoting someone moves a record rather
 * than setting a column, so this table stays a short list that can be counted,
 * audited and reviewed, and no amount of writing to the admins table can mint
 * one of these. Super administrators hold the wildcard ability, and the wildcard
 * is granted sparingly and visibly - which it cannot be if it is a value in a
 * column on the most widely written table in the system.
 *
 * The credential shape is identical to Admin's on purpose: what differs between
 * the two is what they may do, not how they prove who they are.
 */
readonly class SuperAdmin
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
     * Create a SuperAdmin from persistence data.
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
