<?php

namespace App\Application\IdentityAndAccess\UseCases;

use App\Application\IdentityAndAccess\DTOs\SuperAdminSummary;
use App\Application\IdentityAndAccess\Exceptions\AccountNotFound;
use App\Application\IdentityAndAccess\Exceptions\CannotPromoteSelf;
use App\Application\IdentityAndAccess\Exceptions\SuperAdminAlreadyExists;
use App\Domain\IdentityAndAccess\Repositories\AdminRepository;
use App\Domain\IdentityAndAccess\Repositories\SuperAdminRepository;
use App\Domain\IdentityAndAccess\ValueObjects\AccountStatus;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;
use App\Domain\IdentityAndAccess\ValueObjects\UserId;

/**
 * Promotes one administrator to super administrator, and says so when that makes
 * the role too wide.
 *
 * Story 41. Two things happen, and the order matters.
 *
 * **A record is created, not a flag set.** Super administrators live in their own
 * table, so promotion inserts a `super_admins` row carrying the same identity and
 * the same password hash. This is what keeps the most powerful account type a
 * small countable set instead of a boolean on a table anybody with `accounts:read`
 * can read — the count that drives the warning below is a `count(*)` and stays
 * honest.
 *
 * **The administrator record is suspended, not deleted.** "Promoted" here means
 * access *moved* between the two tables, so the person is no longer an
 * administrator. Suspending the old record rather than removing it is the same
 * rule the rest of this surface follows: the record of what that person did while
 * they were an administrator has to outlive their promotion, or a promotion
 * quietly erases a chunk of the audit trail.
 *
 * The new row is created before the old one is suspended, deliberately. If the
 * second write fails, the person holds both accounts rather than neither, which is
 * recoverable by suspending the new row; the reverse order can leave somebody
 * with no access at all and no way back, because the ability needed to fix it is
 * the one they just lost.
 */
class PromoteAdminToSuperAdmin
{
    /**
     * How many super administrators is "a couple".
     *
     * A warning threshold, not a limit. The ticket asks for the role to be kept
     * narrow and for promotion to be *warned about* when it is held by more than a
     * couple of people — so the answer to a request at this count is yes, with a
     * sentence attached, and a hard refusal would be a rule the spec did not ask
     * for. Two is "a couple"; promoting when two already exist is what makes it
     * more than a couple.
     */
    public const WARN_ABOVE = 2;

    public function __construct(
        private AdminRepository $admins,
        private SuperAdminRepository $superAdmins,
    ) {}

    /**
     * @param  AccountType  $callerType  the account type the request was authenticated as
     * @param  int  $callerId  the caller's identifier within that type
     * @return array{account: SuperAdminSummary, warning: ?string}
     */
    public function execute(int $id, AccountType $callerType, int $callerId): array
    {
        $admin = $this->admins->findById(new UserId($id));

        if (! $admin) {
            throw new AccountNotFound(AccountNotFound::MESSAGE);
        }

        // Same reasoning as the self-suspension guard: identifiers only mean the
        // same person within one account type, and a super administrator signing
        // in here is not the administrator being promoted.
        if ($callerType === AccountType::Admin && $callerId === $admin->id->value) {
            throw new CannotPromoteSelf(CannotPromoteSelf::MESSAGE);
        }

        // Checked before the write, so a person who already holds this role gets a
        // sentence about their address rather than a unique-constraint failure
        // from the database. The check is here and not in the repository because
        // "this address already has a super administrator account" is a rule about
        // what a promotion means, and the repository does not know what a
        // promotion is.
        if ($this->superAdmins->findByEmail($admin->email)) {
            throw new SuperAdminAlreadyExists(SuperAdminAlreadyExists::MESSAGE);
        }

        // Counted before the insert, so the warning describes the role as it is
        // now rather than as it will be. "There are already 2 super administrators"
        // is a fact; "there will be 3" is a prediction, and the person deciding can
        // see the first and do the arithmetic themselves.
        $existing = $this->superAdmins->countSuperAdmins();

        $promoted = $this->superAdmins->create(
            name: $admin->name,
            email: $admin->email,
            passwordHash: $admin->passwordHash,
            status: AccountStatus::Active,
        );

        $this->admins->save($admin->withStatus(AccountStatus::Suspended));

        $summary = new SuperAdminSummary(
            id: $promoted->id->value,
            name: $promoted->name,
            email: $promoted->email->value,
            status: $promoted->status,
        );

        return [
            'account' => $summary,
            'warning' => $existing >= self::WARN_ABOVE
                ? sprintf(
                    'This role is already held by %d people. The more super administrators exist, the wider the access, and every one of them can restore every suspended account. Promote anyway?',
                    $existing,
                )
                : null,
        ];
    }
}
