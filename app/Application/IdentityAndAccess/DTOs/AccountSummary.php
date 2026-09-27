<?php

namespace App\Application\IdentityAndAccess\DTOs;

use App\Domain\IdentityAndAccess\ValueObjects\AccountStatus;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;

/**
 * One row of the account directory: an account of some type, seen by a super
 * administrator auditing who has access.
 *
 * An interface rather than a class, and the four implementations are separate
 * types rather than one with a nullable field per account type. That is the same
 * reasoning as {@see AdminAccount}, applied to the listing: if there were one
 * summary type with, say, an optional `staffNotes` field, then whether a field
 * appeared in the response would depend on somebody remembering to leave it null
 * for the wrong account type. Four types make that impossible to express — a
 * worker summary has no staff-notes field to forget.
 *
 * The interface exists so the listing can hold all four in one array and the
 * resource can switch on the concrete type. It deliberately exposes no setter and
 * no shared mutable state, so a caller cannot narrow a summary into a different
 * account type than it is.
 */
interface AccountSummary
{
    /**
     * The account type this summary describes.
     *
     * On the interface rather than inferred by the resource from the class name,
     * because a resource that maps class names to wire values is a second place
     * that has to learn about a fifth account type.
     */
    public function type(): AccountType;

    public function id(): int;

    public function name(): string;

    public function email(): string;

    public function status(): AccountStatus;
}
