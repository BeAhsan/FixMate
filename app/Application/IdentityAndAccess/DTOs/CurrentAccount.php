<?php

namespace App\Application\IdentityAndAccess\DTOs;

use App\Application\IdentityAndAccess\UseCases\DescribeCurrentAccount;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;

/**
 * The account a request is signed in as.
 *
 * Plain scalars rather than a domain entity, for the reason
 * {@see DescribeCurrentAccount}
 * gives: the four account types are four separate entities with no shared base,
 * so "the signed-in account" has no single type to return. Widening the return
 * type to `object` would move the gap into the type system and make every field
 * access unchecked, which is worse than naming the four fields here.
 *
 * The four fields are exactly the four every account type already carries and
 * already discloses at sign-in, so answering "who am I" reveals nothing that
 * the sign-in response did not.
 */
readonly class CurrentAccount
{
    /**
     * @param  list<string>  $abilities  The token's own claim list, echoed
     *                                   rather than recomputed. See the use
     *                                   case for why that distinction matters.
     */
    public function __construct(
        public AccountType $accountType,
        public int $id,
        public string $name,
        public string $email,
        public string $status,
        public array $abilities,
    ) {}
}
