<?php

namespace App\Application\IdentityAndAccess\UseCases;

use App\Application\IdentityAndAccess\DTOs\AdminAccount;
use App\Application\IdentityAndAccess\Exceptions\AccountNotFound;
use App\Domain\IdentityAndAccess\Repositories\AdminRepository;
use App\Domain\IdentityAndAccess\ValueObjects\UserId;

/**
 * Reads one administrator's record for the account-management surface.
 *
 * The smallest thing the authorisation control can be demonstrated against: an
 * endpoint that takes an identifier from the caller, so that "an administrator
 * cannot reach another administrator's records by guessing an identifier" is a
 * claim about a real request rather than about a middleware in isolation. The
 * rest of the account-management surface — listing, suspending, promoting — is
 * separate work; this is the read that the rest will sit beside.
 *
 * There is deliberately no check here that the caller is allowed to see *this*
 * record. That is not an oversight: the ability is the only thing that
 * distinguishes "may look at administrator records" from "may not", and a
 * super administrator's reach over the administrators table is total by
 * definition. Adding a per-record ownership rule would invent a restriction the
 * platform does not have, and inventing one later is cheaper than removing one
 * that a front end has come to rely on.
 *
 * `UserId` throws for a non-positive identifier, so a caller cannot reach the
 * repository with a nonsense one — and cannot use a malformed identifier to tell
 * a bad request apart from a missing record.
 */
class ShowAdminAccount
{
    public function __construct(private AdminRepository $admins) {}

    public function execute(int $id): AdminAccount
    {
        $admin = $this->admins->findById(new UserId($id));

        if (! $admin) {
            throw new AccountNotFound(AccountNotFound::MESSAGE);
        }

        return new AdminAccount(
            id: $admin->id->value,
            name: $admin->name,
            email: $admin->email->value,
            status: $admin->status,
        );
    }
}
