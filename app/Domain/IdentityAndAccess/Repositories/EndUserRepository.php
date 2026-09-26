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
}
