<?php

namespace App\Application\IdentityAndAccess\DTOs;

use App\Domain\IdentityAndAccess\ValueObjects\AccountType;

/**
 * The signed-in account, and what its token is allowed to do.
 *
 * Plain scalars throughout, and that is a decision rather than a shortcut. The
 * token's owner arrives here as an Eloquent model, and none of the four models
 * cast `email` or `status` — they come off the row as the database's own
 * strings. So a DTO holding `Email` and `AccountStatus` would have the use case
 * build two value objects only for the resource to cast them straight back to
 * strings, and every one of those casts is a place a mismatch could hide. The
 * repository path is the opposite and stays typed, because there the entities
 * genuinely are built from value objects: `SignInRequest` is handed an `Email`
 * and `AdminRepository::findById()` returns an `Entity\Admin` whose status
 * really is an `AccountStatus`. The rule is not "DTOs hold value objects" but
 * "a DTO holds what the caller has".
 *
 * `status` is nevertheless put through `AccountStatus::fromString()` on the way
 * in, because that is the value the domain acts on and the one a person should
 * be shown: a status the platform does not recognise is `suspended`, and
 * reporting the raw string instead would tell someone their account is usable
 * when the platform would refuse to sign them in. Normalising here also means
 * `GET /admins/me` and `GET /admins/{admin}` cannot describe one row two
 * different ways — the second goes through the repository and the domain, this
 * one does not, and the two must still agree.
 *
 * No `toArray()`. `SignInResponse` has one because a controller has to merge a
 * freshly minted token into it; nothing has to reshape this one, and letting the
 * resource be the only thing that decides the response's shape is the whole
 * point of having a resource.
 */
readonly class CurrentAccount
{
    /**
     * @param  list<string>  $abilities  The token's own claim list, passed in
     *                                   rather than recomputed from the account
     *                                   type, so that the answer can never be more
     *                                   generous than what the token will be allowed
     *                                   to do on the next request.
     */
    public function __construct(
        public AccountType $accountType,
        public int $id,
        public string $name,
        public string $email,
        public string $status,
        public array $abilities,
    ) {}
}
