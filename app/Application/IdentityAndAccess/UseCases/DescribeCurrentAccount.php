<?php

namespace App\Application\IdentityAndAccess\UseCases;

use App\Application\IdentityAndAccess\DTOs\CurrentAccount;
use App\Domain\IdentityAndAccess\ValueObjects\AccountStatus;
use App\Infrastructure\IdentityAndAccess\AccountTypeRegistry;
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
 * It takes an Eloquent model, which the rest of this layer does not, and that
 * is worth being honest about. The signed-in account is produced by a guard in
 * the framework's own security machinery, and there is no repository interface
 * behind it to read it through — the model *is* what the guard resolved. Widening
 * the parameter to `object` instead would hide that behind an unchecked type and
 * move the gap out of sight rather than out of existence. The account leaves as
 * a DTO, so nothing Eloquent is allowed past this line.
 *
 * It returns plain scalars rather than an entity, and that is a decision rather
 * than laziness. The four account types have four separate domain entities with
 * no shared base, so "the signed-in account" has no single type to return, and an
 * interface invented to give it one would be a second, invented model of the
 * account type competing with the enum that already is one. The four fields
 * returned here are exactly the four every account type already carries and
 * already exposes at sign-in, so nothing new is disclosed.
 */
class DescribeCurrentAccount
{
    /**
     * The abilities are the token's own, passed in by the caller rather than
     * recomputed from the account type.
     *
     * They are a fact about the token rather than a permission the platform
     * derives, and answering with the account type's full list instead would be
     * a lie in the one direction that matters: a token that had been issued with
     * its abilities narrowed would be told it still has all of them, and the
     * application acting on that would render navigation the next request is
     * going to refuse.
     *
     * @param  list<string>  $abilities
     */
    public function execute(Model $account, array $abilities): CurrentAccount
    {
        return new CurrentAccount(
            accountType: AccountTypeRegistry::for($account),
            id: (int) $account->getKey(),
            name: (string) $account->name,
            email: (string) $account->email,
            // Through the domain, so that an unrecognised status is `suspended`
            // rather than whatever the column happens to hold. A status the
            // platform does not know about refuses sign-in, so reporting the raw
            // string would tell someone their account is usable when it is not.
            status: AccountStatus::fromString((string) $account->status)->value,
            abilities: $abilities,
        );
    }
}
