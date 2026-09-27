<?php

namespace App\Application\IdentityAndAccess\UseCases;

use App\Application\IdentityAndAccess\DTOs\AdminAccount;
use App\Application\IdentityAndAccess\Exceptions\AccountNotFound;
use App\Application\IdentityAndAccess\Exceptions\CannotSuspendSelf;
use App\Domain\IdentityAndAccess\Repositories\AdminRepository;
use App\Domain\IdentityAndAccess\ValueObjects\AccountStatus;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;
use App\Domain\IdentityAndAccess\ValueObjects\UserId;

/**
 * Suspends one administrator, keeping the record.
 *
 * Story 39: access is withdrawn by suspending rather than by deleting, so the
 * record of what that person did survives. That is not a courtesy — it is why
 * there is no delete route on this surface at all. An account that can be removed
 * is an account whose history can be removed with it, and the history is the
 * reason an account exists separately from a person.
 *
 * The status is set to Suspended and nothing else changes. The name, the address
 * and the password hash are copied through untouched, so restoring the account is
 * a status change back rather than an invitation.
 *
 * ## Why the self-suspension rule is here and not only in the middleware
 *
 * The ticket words this guard rail as "an administrator cannot suspend or delete
 * their own account". For an *administrator* that is already true before this
 * class runs: `accounts:suspend` is not in `admins:*`, so the ability check
 * refuses them at the middleware and they never arrive. Adding a check here for
 * the administrator case would be a second copy of a rule that already holds.
 *
 * What is not already covered is the super administrator, who *does* hold the
 * ability and can therefore reach this line. They cannot be suspending
 * *themselves*, because a super administrator and an administrator are records in
 * two different tables — but they can suspend the last other super administrator
 * and leave nobody able to restore anybody.
 *
 * That last case is a policy question this class deliberately does not answer.
 * Blocking it would mean a second super administrator could never be suspended by
 * anybody, including by themselves later, which is a lock-out of the whole
 * platform. The ticket asks for one guard rail and this is it; the "never suspend
 * the last one" rule is a different decision and belongs to whoever makes it.
 *
 * The self-check compares the account type *before* the identifier, and that
 * ordering is load-bearing. Identifiers are only comparable within one table:
 * super administrator 1 and administrator 1 are two unrelated people, so a
 * comparison of bare integers would refuse a legitimate suspension roughly as
 * often as it would catch a real one. The types are equal or the two identifiers
 * are simply not talking about the same person.
 *
 * ## Why no tokens are revoked
 *
 * The ticket asks for the suspended account to be "signed out immediately", and
 * the honest answer is that this method does not need to do anything for that to
 * be true. `EnsureAccountCan` re-reads the account's status on every authorised
 * request, and `EnsureSessionCan` re-reads it on every renewal. Changing the
 * status therefore closes both doors on the very next request, with no window in
 * which a suspended person keeps working by never reloading. Revoking the tokens
 * here would be a second copy of that guarantee, in a place that does not run on
 * the read path and so would not be exercised by it. It is left to the feature
 * test to prove both doors refuse, which is the check that would catch this
 * guarantee ever being weakened somewhere else.
 */
class SuspendAdminAccount
{
    public function __construct(private AdminRepository $admins) {}

    /**
     * @param  AccountType  $callerType  the account type the request was authenticated as
     * @param  int  $callerId  the caller's identifier within that type
     */
    public function execute(int $id, AccountType $callerType, int $callerId): AdminAccount
    {
        $admin = $this->admins->findById(new UserId($id));

        if (! $admin) {
            throw new AccountNotFound(AccountNotFound::MESSAGE);
        }

        if ($callerType === AccountType::Admin && $callerId === $admin->id->value) {
            throw new CannotSuspendSelf(CannotSuspendSelf::MESSAGE);
        }

        $suspended = $this->admins->save($admin->withStatus(AccountStatus::Suspended));

        return new AdminAccount(
            id: $suspended->id->value,
            name: $suspended->name,
            email: $suspended->email->value,
            status: $suspended->status,
        );
    }
}
