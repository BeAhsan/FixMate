<?php

namespace App\Domain\IdentityAndAccess\Repositories;

use App\Domain\IdentityAndAccess\Entities\SuperAdmin;
use App\Domain\IdentityAndAccess\ValueObjects\AccountStatus;
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

    /**
     * Create a new super administrator, with an identifier the store assigns.
     *
     * Separate from {@see save()} because "this record does not exist yet" cannot
     * be expressed as a {@see SuperAdmin}:
     * the entity holds a `UserId`, `UserId` refuses a non-positive value, and there
     * is no honest placeholder to pass for an identifier nobody has been given yet.
     *
     * It is emphatically not `save()` with the promoted administrator's identifier
     * reused. Identifiers are per table, so a new administrator 7 and an existing
     * super administrator 7 are two different people — and `save()` matches on
     * identifier, which would make promoting administrator 7 silently overwrite
     * super administrator 7's name, address, password and status. That failure
     * leaves a real person's account rewritten by somebody else's promotion, and
     * it is why this method exists rather than a convention about identifiers.
     *
     * Whether that address already belongs to a super administrator is decided by
     * the caller, through {@see findByEmail()}, and not here: the refusal is a
     * rule about what a promotion means, so it belongs to the use case that knows
     * what a promotion is. This method's only job is to write a row. The unique
     * index on the column remains the backstop, so a genuine race still cannot
     * produce two accounts with one address.
     */
    public function create(
        string $name,
        Email $email,
        string $passwordHash,
        AccountStatus $status,
    ): SuperAdmin;

    /**
     * How many super administrators exist, of any status.
     *
     * Exists so the "keep the role narrow" guard rail can be enforced at all.
     * That guard is a warning rather than a refusal — the spec asks for a
     * super administrator to be able to promote somebody while being told when the
     * role is held by more than a couple of people — and a warning that has to be
     * computed from a count cannot be computed by the caller without giving the
     * caller a way to read the whole table.
     *
     * Suspended super administrators are counted, because a role held by three
     * people is still a role held by three people: one of them being suspended
     * does not make the promotion of a fourth a good idea. If the intent is ever
     * to count only the active ones, that is a change of meaning and belongs in
     * the method name.
     */
    public function countSuperAdmins(): int;

    /**
     * Every super administrator in the system.
     *
     * Added for the account-management surface, which shows one super
     * administrator every account of every type at once. It is a method on this
     * interface rather than a query in the use case because the use case must not
     * know that these rows live in a table called `super administrators` — and because the
     * alternative, a use case reaching for Eloquent, is the one thing the
     * repository boundary exists to prevent.
     *
     * Returns every super administrator including suspended ones, because an audit of who
     * has access needs the suspended records as much as the active ones. Order is
     * the implementation's business; nothing above this line should depend on it.
     *
     * @return list<SuperAdmin>
     */
    public function all(): array;
}
