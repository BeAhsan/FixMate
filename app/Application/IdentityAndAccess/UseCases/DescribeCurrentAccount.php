<?php

namespace App\Application\IdentityAndAccess\UseCases;

use App\Application\IdentityAndAccess\DTOs\CurrentAccount;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;
use Illuminate\Database\Eloquent\Model;

/**
 * Answers "who am I" for whichever account type is signed in.
 *
 * The account arrives already resolved: Sanctum's guard found the token's owner
 * and loaded it, and that is the point — this use case never looks anyone up by
 * an address or an identifier the caller supplied, so there is nothing here to
 * tamper with. The one thing it decides is which account type the account is, by
 * asking the registry rather than being told, so that a token cannot describe
 * itself as whatever the caller would find convenient.
 *
 * It returns plain scalars rather than an entity, and that is a decision rather
 * than laziness. The four account types have four separate domain entities with
 * no shared base, so "the signed-in account" has no single type to return. The
 * alternative was to widen the parameter to `object`, which moves the gap into
 * the type system and makes every field access unchecked. The four fields
 * returned here are exactly the four every account type already carries and
 * already exposes at sign-in, so nothing new is disclosed.
 *
 * @param  list<string>  $tokenAbilities  The abilities on the token the request
 *                                        arrived with, not a freshly computed
 *                                        set. They are echoed so that an
 *                                        application is never told one thing
 *                                        here and contradicted by the endpoint
 *                                        it calls next, and the middleware that
 *                                        guards this endpoint has just compared
 *                                        this same list against what the route
 *                                        requires — so passing anything else
 *                                        would be reporting a reach the request
 *                                        was not actually granted.
 */
class DescribeCurrentAccount
{
    /**
     * @param  list<string>  $tokenAbilities
     */
    public function execute(AccountType $accountType, Model $account, array $tokenAbilities): CurrentAccount
    {
        return new CurrentAccount(
            accountType: $accountType,
            id: (int) $account->getKey(),
            name: (string) $account->name,
            email: (string) $account->email,
            status: (string) $account->status,
            abilities: array_values($tokenAbilities),
        );
    }
}
