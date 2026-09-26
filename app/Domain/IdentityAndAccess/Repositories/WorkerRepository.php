<?php

namespace App\Domain\IdentityAndAccess\Repositories;

use App\Domain\IdentityAndAccess\Entities\Worker;
use App\Domain\IdentityAndAccess\ValueObjects\Email;
use App\Domain\IdentityAndAccess\ValueObjects\UserId;

/**
 * Repository interface for Worker entities.
 * This is the contract the domain depends on - no framework types.
 *
 * The contract is identical in shape to EndUserRepository. That is the point:
 * one account type adds a repository, not a new repository abstraction.
 */
interface WorkerRepository
{
    /**
     * Find a worker by email address.
     * Returns null if not found.
     */
    public function findByEmail(Email $email): ?Worker;

    /**
     * Find a worker by ID.
     * Returns null if not found.
     */
    public function findById(UserId $id): ?Worker;

    /**
     * Save a worker (create or update).
     */
    public function save(Worker $worker): Worker;
}
