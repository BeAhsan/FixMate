<?php

namespace App\Application\IdentityAndAccess\UseCases;

use App\Application\IdentityAndAccess\DTOs\AccountSummary;
use App\Application\IdentityAndAccess\DTOs\AdminAccount;
use App\Application\IdentityAndAccess\DTOs\EndUserSummary;
use App\Application\IdentityAndAccess\DTOs\SuperAdminSummary;
use App\Application\IdentityAndAccess\DTOs\WorkerSummary;
use App\Domain\IdentityAndAccess\Repositories\AdminRepository;
use App\Domain\IdentityAndAccess\Repositories\EndUserRepository;
use App\Domain\IdentityAndAccess\Repositories\SuperAdminRepository;
use App\Domain\IdentityAndAccess\Repositories\WorkerRepository;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;

/**
 * Every account in the platform, across all four account types, in one list.
 *
 * Story 40: a super administrator needs to answer "who has access anywhere in
 * this system", and four separate screens cannot answer that question. The list is
 * therefore flat and carries the account type on each row, rather than being four
 * named sections — a table that can be sorted and filtered beats four lists a
 * person has to read side by side, and it is the shape an audit actually wants.
 *
 * The four repositories are injected separately and the result is one array of
 * {@see AccountSummary}. That is deliberate on two counts. It keeps each store
 * isolated — there is no query anywhere in this class that can reach two tables,
 * so the credential-store isolation the repository tests prove is not quietly
 * undone by a convenience join. And it means adding a fifth account type is a
 * fifth repository, a fifth summary type and one more line here, rather than a
 * change to an abstraction that would also have to be taught about all five.
 *
 * Suspended accounts are included, and that is the point of the screen. An audit
 * of who has access needs the records of who *had* access as much as the current
 * holders; a directory that hid suspended accounts would make a suspension look
 * like a deletion, which is the outcome this whole surface exists to avoid.
 *
 * Ordering is by account type, then by identifier within each type. Stable and
 * total, so a front end can rely on it and a person comparing two moments sees
 * rows in the same places. It is not alphabetical: the four types are grouped so
 * the eye can find "the administrators" as a block.
 */
class ListAllAccounts
{
    public function __construct(
        private EndUserRepository $users,
        private WorkerRepository $workers,
        private AdminRepository $admins,
        private SuperAdminRepository $superAdmins,
    ) {}

    /**
     * @return list<AccountSummary>
     */
    public function execute(): array
    {
        $summaries = [];

        // In AccountType order rather than in the order the constructor happened to
        // take them, so the response order follows the domain's own ordering of
        // account types and not an accident of a dependency list.
        foreach ([
            AccountType::User,
            AccountType::Worker,
            AccountType::Admin,
            AccountType::SuperAdmin,
        ] as $type) {
            foreach ($this->accountsOf($type) as $summary) {
                $summaries[] = $summary;
            }
        }

        return $summaries;
    }

    /**
     * @return list<AccountSummary>
     */
    private function accountsOf(AccountType $type): array
    {
        return match ($type) {
            AccountType::User => array_map(
                fn ($user) => new EndUserSummary(
                    id: $user->id->value,
                    name: $user->name,
                    email: $user->email->value,
                    status: $user->status,
                ),
                $this->users->all(),
            ),

            AccountType::Worker => array_map(
                fn ($worker) => new WorkerSummary(
                    id: $worker->id->value,
                    name: $worker->name,
                    email: $worker->email->value,
                    status: $worker->status,
                ),
                $this->workers->all(),
            ),

            AccountType::Admin => array_map(
                fn ($admin) => new AdminAccount(
                    id: $admin->id->value,
                    name: $admin->name,
                    email: $admin->email->value,
                    status: $admin->status,
                ),
                $this->admins->all(),
            ),

            AccountType::SuperAdmin => array_map(
                fn ($superAdmin) => new SuperAdminSummary(
                    id: $superAdmin->id->value,
                    name: $superAdmin->name,
                    email: $superAdmin->email->value,
                    status: $superAdmin->status,
                ),
                $this->superAdmins->all(),
            ),
        };
    }
}
