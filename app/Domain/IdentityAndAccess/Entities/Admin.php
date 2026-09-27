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
        public bool $mustChangePassword = false,
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
     * A copy of this administrator with a different status.
     *
     * The entity is `readonly`, so a status change cannot be a mutation — it is a
     * different administrator as far as this object is concerned, and the old one
     * stays valid. That is not a limitation worked around; it is why the status
     * cannot be changed by accident from somewhere that merely holds a reference.
     * A caller that wants to suspend somebody says so here, explicitly, and the
     * returned value is what gets saved.
     *
     * Whether the caller is *allowed* to is not decided here. A domain entity
     * has no idea who is asking, and an entity that checked permissions would put
     * an authorisation rule somewhere no reviewer looks for it. The rule belongs
     * to the use case, which knows both the subject and the caller.
     */
    public function withStatus(AccountStatus $status): self
    {
        return new self(
            id: $this->id,
            name: $this->name,
            email: $this->email,
            passwordHash: $this->passwordHash,
            status: $status,
        );
    }

    /**
     * A copy of this account with a different password hash.
     *
     * The entity is `readonly`, so a password change is a different account as far
     * as this object is concerned and the old one stays valid — the same reasoning
     * as `withStatus`, and for the same reason: a credential cannot be changed by
     * accident from somewhere that merely holds a reference.
     *
     * Whether the caller is *allowed* to is not decided here. An entity has no idea
     * who is asking.
     */
    /**
     * A copy of this account with the "must change password" flag set or cleared.
     *
     * Separate from `withPassword` and `withStatus` so a caller has to be explicit
     * about which of the three it means. Changing a password and clearing this
     * flag almost always happen together, which is exactly why they are two
     * methods: the pairing is a decision made in the use case, where it can be
     * explained, rather than an accident of a single setter that does both.
     */
    public function withMustChangePassword(bool $mustChangePassword): self
    {
        return new self(
            id: $this->id,
            name: $this->name,
            email: $this->email,
            passwordHash: $this->passwordHash,
            status: $this->status,
            mustChangePassword: $mustChangePassword,
        );
    }

    public function withPassword(string $passwordHash): self
    {
        return new self(
            id: $this->id,
            name: $this->name,
            email: $this->email,
            passwordHash: $passwordHash,
            status: $this->status,
            mustChangePassword: $this->mustChangePassword,
        );
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
        bool $mustChangePassword = false,
    ): self {
        return new self(
            id: new UserId($id),
            name: $name,
            email: Email::from($email),
            passwordHash: $passwordHash,
            status: AccountStatus::fromString($status),
            mustChangePassword: $mustChangePassword,
        );
    }
}
