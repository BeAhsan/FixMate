<?php

namespace App\Application\IdentityAndAccess\DTOs;

use App\Domain\IdentityAndAccess\ValueObjects\AccountStatus;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;

/**
 * A worker, in the account directory.
 *
 * A worker who is also an end user is two accounts in two tables, and this
 * repository believes that completely: there is no `is_also_customer` field on a
 * worker summary, because a person holding both is represented by two rows and
 * the directory shows both.
 */
readonly class WorkerSummary implements AccountSummary
{
    public function __construct(
        public int $id,
        public string $name,
        public string $email,
        public AccountStatus $status,
    ) {}

    public function type(): AccountType
    {
        return AccountType::Worker;
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
