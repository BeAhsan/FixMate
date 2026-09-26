<?php

namespace App\Domain\IdentityAndAccess\Entities;

use App\Domain\IdentityAndAccess\ValueObjects\AccountStatus;
use App\Domain\IdentityAndAccess\ValueObjects\Email;
use App\Domain\IdentityAndAccess\ValueObjects\UserId;

/**
 * Admin entity representing a staff account with administrative access.
 *
 * An administrator is not a customer with a flag, and deliberately not a
 * super administrator with a flag either. Super administrators live in their own
 * table (see SuperAdmin), so promoting someone moves a record rather than
 * changing one, and the most powerful account type stays a small countable set
 * rather than a flag on a table anyone can reach.
 *
 * The attributes below are the identity and status fields a sign-in needs. What
 * an administrator is allowed to *do* is an ability, not a column, so that the
 * answer to "what may this account do" is the same question for all four account
 * types.
 *
 * Like EndUser and Worker, this is a pure domain entity with no framework
 * dependencies.
 */
readonly class Admin
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
     * Create an Admin from persistence data.
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
