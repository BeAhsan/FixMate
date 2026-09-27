<?php

namespace App\Domain\IdentityAndAccess\Repositories;

use App\Domain\IdentityAndAccess\Entities\EndUser;
use App\Domain\IdentityAndAccess\ValueObjects\Email;
use App\Domain\IdentityAndAccess\ValueObjects\UserId;

/**
 * Repository interface for EndUser entities.
 * This is the contract the domain depends on - no framework types.
 */
interface EndUserRepository
{
    /**
     * Find an end user by email address.
     * Returns null if not found.
     */
    public function findByEmail(Email $email): ?EndUser;

    /**
     * Find an end user by ID.
     * Returns null if not found.
     */
    public function findById(UserId $id): ?EndUser;

    /**
     * Save an end user (create or update).
     */
    public function save(EndUser $user): EndUser;

    /**
     * Every end user in the system.
     *
     * Added for the account-management surface, which shows one super
     * administrator every account of every type at once. It is a method on this
     * interface rather than a query in the use case because the use case must not
     * know that these rows live in a table called `end users` — and because the
     * alternative, a use case reaching for Eloquent, is the one thing the
     * repository boundary exists to prevent.
     *
     * Returns every end user including suspended ones, because an audit of who
     * has access needs the suspended records as much as the active ones. Order is
     * the implementation's business; nothing above this line should depend on it.
     *
     * @return list<EndUser>
     */
    public function all(): array;
}
