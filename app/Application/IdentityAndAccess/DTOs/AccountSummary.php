<?php

namespace App\Application\IdentityAndAccess\DTOs;

use App\Domain\IdentityAndAccess\ValueObjects\AccountType;

/**
 * An account, described for a reader who is not necessarily that account.
 *
 * The same fields `CurrentAccount` carries, minus the abilities, and the absence
 * is deliberate. Abilities in this platform describe the *token that asked*, not
 * the record being looked at: they are the list the caller will be held to on
 * the next request. Putting the target's abilities in a response would hand a
 * caller a permission list that is not theirs, and an application that rendered
 * navigation from it would be offering links the caller cannot follow — or,
 * worse, links the *target* could follow, which is a different person's
 * authority displayed in the wrong window.
 *
 * `accountType` is present and `abilities` is not, which is the distinction in
 * one line: a reader is entitled to know *which store* a record belongs to, and
 * to nothing about what that record may do.
 */
readonly class AccountSummary
{
    public function __construct(
        public AccountType $accountType,
        public int $id,
        public string $name,
        public string $email,
        public string $status,
    ) {}
}
