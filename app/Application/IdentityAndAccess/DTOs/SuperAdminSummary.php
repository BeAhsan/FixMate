<?php

namespace App\Application\IdentityAndAccess\DTOs;

use App\Domain\IdentityAndAccess\ValueObjects\AccountStatus;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;

/**
 * A super administrator, in the account directory.
 *
 * The same shape as every other summary, and that is the point of the four
 * separate types: the most powerful account type is not given extra fields on the
 * way out, so widening what a super administrator can see about others does not
 * happen by accident when a column is added here.
 */
readonly class SuperAdminSummary implements AccountSummary
{
    public function __construct(
        public int $id,
        public string $name,
        public string $email,
        public AccountStatus $status,
    ) {}

    public function type(): AccountType
    {
        return AccountType::SuperAdmin;
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
