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
     * Create an EndUser from persistence data.
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
