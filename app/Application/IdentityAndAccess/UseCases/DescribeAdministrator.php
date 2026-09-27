<?php

namespace App\Application\IdentityAndAccess\UseCases;

use App\Application\IdentityAndAccess\DTOs\AccountSummary;
use App\Application\IdentityAndAccess\Exceptions\AccountNotFound;
use App\Application\IdentityAndAccess\Exceptions\NotPermitted;
use App\Domain\IdentityAndAccess\Entities\Admin;
use App\Domain\IdentityAndAccess\Repositories\AdminRepository;
use App\Domain\IdentityAndAccess\ValueObjects\Ability;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;
use App\Domain\IdentityAndAccess\ValueObjects\UserId;
use App\Infrastructure\IdentityAndAccess\AccountTypeRegistry;
use Illuminate\Database\Eloquent\Model;

/**
 * Answers "this administrator's record" for whoever is asking.
 *
 * This is the use case behind the platform's one endpoint that takes an
 * identifier the caller supplied, and it is a class rather than a line in the
 * controller because that endpoint is where the platform would leak if the rule
 * were not written down once. The rule has two halves:
 *
 *   1. A token carrying `accounts:read` may read any administrator's record.
 *   2. Everyone else may read only their own.
 *
 * And the order those two run in is the entire defence against identifier
 * guessing, so it is the order the code below is in. A caller without the ability
 * is compared against the requested id and refused *before* the record is
 * touched. Read the record first and decide afterwards, and "there is no
 * administrator 4" becomes a 404 while "administrator 4 is not yours" stays a
 * 403 — and two distinguishable answers to "does administrator 4 exist" is
 * enough to walk the whole staff table, one integer at a time, with nothing but a
 * valid token. So a caller who is not entitled learns, from the refusal itself,
 * nothing at all: a nonexistent id and another administrator's id come from the
 * same line of code and are the same words and the same `code`.
 *
 * That is also why the refusal is `NotPermitted` and not the framework's own
 * `ModelNotFoundException` or a `firstOrFail()`. Those answer "not found", and
 * "not found" is the half of the answer that must not be given here.
 *
 * Both routes that reach this use case get the ownership check whether or not
 * their middleware already required `accounts:read`, and that is intended. On
 * the super administrator route the first half of the rule is already true, so
 * the check is a restatement; on the administrator application's own route it is
 * the whole of the protection. Writing it once and calling it from both means
 * neither route has to be trusted to have got it right, and adding a third route
 * to read an administrator's record later gets it right by being here.
 */
class DescribeAdministrator
{
    public function __construct(
        private AdminRepository $admins,
    ) {}

    /**
     * @param  list<string>  $abilities  The caller's own token abilities.
     *
     * @throws NotPermitted
     * @throws AccountNotFound
     */
    public function execute(Model $caller, int $requestedId, array $abilities): AccountSummary
    {
        $accountType = AccountTypeRegistry::for($caller);

        if (! $accountType->may($abilities, Ability::ACCOUNTS_READ) && (int) $caller->getKey() !== $requestedId) {
            throw NotPermitted::notTheAccountsOwnRecord();
        }

        // Past this line the caller is entitled to know whether the record
        // exists: either it is their own, or it holds the ability that reaches
        // every account in the store. So a miss here is reported honestly rather
        // than disguised as a refusal, because there is no longer anything to
        // protect by disguising it.
        $admin = $this->admins->findById(new UserId($requestedId));

        if (! $admin instanceof Admin) {
            throw new AccountNotFound;
        }

        return new AccountSummary(
            accountType: AccountType::Admin,
            id: $admin->id->value,
            name: $admin->name,
            email: $admin->email->value,
            status: $admin->status->value,
        );
    }
}
