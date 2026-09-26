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
}
