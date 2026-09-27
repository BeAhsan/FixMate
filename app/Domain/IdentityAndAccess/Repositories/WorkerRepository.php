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

    /**
     * Every worker in the system.
     *
     * Added for the account-management surface, which shows one super
     * administrator every account of every type at once. It is a method on this
     * interface rather than a query in the use case because the use case must not
     * know that these rows live in a table called `workers` — and because the
     * alternative, a use case reaching for Eloquent, is the one thing the
     * repository boundary exists to prevent.
     *
     * Returns every worker including suspended ones, because an audit of who
     * has access needs the suspended records as much as the active ones. Order is
     * the implementation's business; nothing above this line should depend on it.
     *
     * @return list<Worker>
     */
    public function all(): array;
}
