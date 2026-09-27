<?php

namespace App\Application\IdentityAndAccess\DTOs;

use App\Domain\IdentityAndAccess\ValueObjects\AccountStatus;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;

/**
 * An end user, in the account directory.
 *
 * Deliberately its own type rather than a field on a shared summary. An end user is
 * not staff, and the day somebody wants to record something about a staff member
 * that has no meaning here, the compiler points at this class instead of the
 * response quietly growing a null.
 */
readonly class EndUserSummary implements AccountSummary
{
    public function __construct(
        public int $id,
        public string $name,
        public string $email,
        public AccountStatus $status,
    ) {}

    public function type(): AccountType
    {
        return AccountType::User;
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
