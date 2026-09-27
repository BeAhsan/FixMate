<?php

namespace App\Application\IdentityAndAccess\DTOs;

use App\Domain\IdentityAndAccess\ValueObjects\AccountStatus;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;

/**
 * One account as the account-management surface describes it.
 *
 * A separate DTO from {@see CurrentAccount} on purpose, even though the fields
 * look much the same. The two answer different questions to different audiences:
 * this one is what a super administrator sees when looking at *someone else*, and
 * the spec asks for each account type to see a different representation of the
 * same person. Sharing one DTO would make that a matter of who remembered to
 * unset a field, rather than a type that cannot be used the wrong way — and the
 * moment a fifth field lands on a staff record, "unset it unless you are a super
 * administrator" is the shape of a leak.
 */
readonly class AdminAccount implements AccountSummary
{
    public function __construct(
        public int $id,
        public string $name,
        public string $email,
        public AccountStatus $status,
    ) {}

    /**
     * Implements {@see AccountSummary} so one administrator can appear in the
     * account directory beside the other three account types.
     *
     * The interface methods are accessors rather than the public properties, and
     * that is not duplication for its own sake: the properties are what
     * `AdminAccountResource` serialises, and the accessors are what the directory
     * reads. A summary that reached into another type's properties would not be
     * able to implement the interface at all, which is the property being bought.
     */
    public function type(): AccountType
    {
        return AccountType::Admin;
    }

    public function id(): int
    {
        return $this->id;
    }

    public function name(): string
    {
        return $this->name;
    }

    public function email(): string
    {
        return $this->email;
    }

    public function status(): AccountStatus
    {
        return $this->status;
    }
}
