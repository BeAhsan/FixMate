<?php

namespace App\Domain\IdentityAndAccess\Repositories;

use App\Domain\IdentityAndAccess\Entities\Admin;
use App\Domain\IdentityAndAccess\ValueObjects\Email;
use App\Domain\IdentityAndAccess\ValueObjects\UserId;

/**
 * Repository interface for Admin entities.
 * This is the contract the domain depends on - no framework types.
 *
 * Identical in shape to EndUserRepository and WorkerRepository. That is the
 * point: one account type adds a repository, not a new repository abstraction.
 */
interface AdminRepository
{
    /**
     * Find an administrator by email address.
     * Returns null if not found.
     */
    public function findByEmail(Email $email): ?Admin;

    /**
     * Find an administrator by ID.
     * Returns null if not found.
     */
    public function findById(UserId $id): ?Admin;

    /**
     * Save an administrator (create or update).
     */
    public function save(Admin $admin): Admin;

    /**
     * Every administrator in the system.
     *
     * Added for the account-management surface, which shows one super
     * administrator every account of every type at once. It is a method on this
     * interface rather than a query in the use case because the use case must not
     * know that these rows live in a table called `admins` — and because the
     * alternative, a use case reaching for Eloquent, is the one thing the
     * repository boundary exists to prevent.
     *
     * Returns every administrator including suspended ones, because an audit of who
     * has access needs the suspended records as much as the active ones. Order is
     * the implementation's business; nothing above this line should depend on it.
     *
     * @return list<Admin>
     */
    public function all(): array;
}
