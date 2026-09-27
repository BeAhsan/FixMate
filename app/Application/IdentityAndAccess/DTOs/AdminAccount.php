<?php

namespace App\Application\IdentityAndAccess\DTOs;

use App\Domain\IdentityAndAccess\ValueObjects\AccountStatus;

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
readonly class AdminAccount
{
    public function __construct(
        public int $id,
        public string $name,
        public string $email,
        public AccountStatus $status,
    ) {}
}
