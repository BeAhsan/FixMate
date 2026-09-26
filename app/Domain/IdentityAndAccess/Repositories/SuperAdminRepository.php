<?php

namespace App\Domain\IdentityAndAccess\Repositories;

use App\Domain\IdentityAndAccess\Entities\SuperAdmin;
use App\Domain\IdentityAndAccess\ValueObjects\Email;
use App\Domain\IdentityAndAccess\ValueObjects\UserId;

/**
 * Repository interface for SuperAdmin entities.
 * This is the contract the domain depends on - no framework types.
 *
 * A separate interface from AdminRepository, and deliberately not a subtype of
 * it. Nothing in the domain should be able to accept a super administrator
 * where an administrator is expected, because there is no super administrator
 * operation that is only an administrator operation - they share a credential
 * shape, not a contract.
 */
interface SuperAdminRepository
{
    /**
     * Find a super administrator by email address.
     * Returns null if not found.
     */
    public function findByEmail(Email $email): ?SuperAdmin;

    /**
     * Find a super administrator by ID.
     * Returns null if not found.
     */
    public function findById(UserId $id): ?SuperAdmin;

    /**
     * Save a super administrator (create or update).
     */
    public function save(SuperAdmin $superAdmin): SuperAdmin;
}
