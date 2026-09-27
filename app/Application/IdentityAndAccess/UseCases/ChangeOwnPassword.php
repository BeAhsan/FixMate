<?php

namespace App\Application\IdentityAndAccess\UseCases;

use App\Application\IdentityAndAccess\Exceptions\CannotSupplyCurrentPassword;
use App\Application\IdentityAndAccess\Exceptions\PasswordUnchanged;
use App\Domain\IdentityAndAccess\Entities\Admin;
use App\Domain\IdentityAndAccess\Entities\EndUser;
use App\Domain\IdentityAndAccess\Entities\SuperAdmin;
use App\Domain\IdentityAndAccess\Entities\Worker;
use App\Domain\IdentityAndAccess\Repositories\AdminRepository;
use App\Domain\IdentityAndAccess\Repositories\EndUserRepository;
use App\Domain\IdentityAndAccess\Repositories\SuperAdminRepository;
use App\Domain\IdentityAndAccess\Repositories\WorkerRepository;
use App\Domain\IdentityAndAccess\Services\AuthenticationService;
use App\Domain\IdentityAndAccess\Services\SessionRevoker;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;
use App\Domain\IdentityAndAccess\ValueObjects\UserId;

/**
 * Replaces the password of the account making the request, and withdraws the
 * sessions that were opened with the old one.
 *
 * Story 21. An account created by `fixmate:create-account` holds a password its
 * owner never chose, and this is where they replace it.
 *
 * Four account types, one use case, four repositories — and the same shape as
 * `ListAllAccounts`, for the same reason: whichever type the caller is, the
 * question is always "the account making this request", never "somebody else's
 * account". There is no path parameter and no identifier in the body, so there is
 * nothing for a caller to change in order to reach an account that is not theirs.
 *
 * Three things have to be true before the password is replaced, and each closes a
 * door:
 *
 * 1. **The current password is verified.** Without this, anybody holding a stolen
 *    access token could set a new password and lock the real owner out
 *    permanently. The token proves who is asking; the current password proves it
 *    is the person and not a copy of their session.
 * 2. **The new password is not the old one.** Otherwise "change your password"
 *    could be satisfied by submitting the shared password again, and the flag
 *    cleared with nothing changed — which is the exact outcome the story exists to
 *    prevent. The comparison is on the *plaintext*, because that is what the
 *    person typed; comparing hashes would need the old hash re-derived from
 *    something, and a hash comparison of a re-derived hash is a way of comparing
 *    plaintexts with extra steps.
 * 3. **Every other session is withdrawn.** The reason for changing a password is
 *    that somebody else may have had it, and a session opened with the old
 *    password keeps working no matter how new the stored hash is. The session
 *    making the change is spared — see `SessionRevoker` — so the person is not
 *    signed out of the application they are standing in.
 *
 * The flag is cleared last, and only once everything above has succeeded. A partial
 * change that left the flag set would be recoverable; one that cleared it and failed
 * to revoke the old sessions would not be.
 */
class ChangeOwnPassword
{
    public function __construct(
        private EndUserRepository $users,
        private WorkerRepository $workers,
        private AdminRepository $admins,
        private SuperAdminRepository $superAdmins,
        private AuthenticationService $auth,
        private SessionRevoker $sessions,
    ) {}

    /**
     * @param  string|null  $exceptTokenId  the token making this request, spared from
     *                                      the revocation so the caller stays signed in
     */
    public function execute(
        AccountType $type,
        int $accountId,
        string $currentPassword,
        string $newPassword,
        ?string $exceptTokenId = null,
    ): void {
        $account = $this->accountFor($type, $accountId);

        if ($account === null) {
            // Not "wrong password". The account is resolved from the authenticated
            // token, so this is unreachable through the API — and saying so would be
            // a lie if it ever were reached, because the honest answer would be that
            // the *session* is the problem, not the password.
            throw CannotSupplyCurrentPassword::forUnknownAccount();
        }

        if (! $this->auth->verifyCredentials($account->passwordHash, $currentPassword)) {
            throw new CannotSupplyCurrentPassword(CannotSupplyCurrentPassword::MESSAGE);
        }

        if ($this->auth->verifyCredentials($account->passwordHash, $newPassword)) {
            throw new PasswordUnchanged(PasswordUnchanged::MESSAGE);
        }

        // One write, not two. The new hash and the cleared flag go in together,
        // because two writes leave a window in which the password has changed and
        // the flag has not — and a crash in that window leaves an account whose
        // password nobody chose, flagged correctly, which is recoverable. The
        // reverse — flag cleared, password not changed — is not.
        $changed = $account
            ->withPassword($this->auth->hash($newPassword))
            ->withMustChangePassword(false);

        $this->persist($changed, $type);

        $this->sessions->revokeAllExcept($type, $accountId, $exceptTokenId);
    }

    /**
     * Save through whichever store owns this account type.
     *
     * The `match` is exhaustive over `AccountType`, so adding a fifth account type
     * makes this fail to compile rather than silently save to the wrong table —
     * which is the same property `ListAllAccounts` relies on, and the reason a
     * `default:` arm is deliberately absent.
     */
    private function persist(EndUser|Worker|Admin|SuperAdmin $account, AccountType $type): void
    {
        match ($type) {
            AccountType::User => $this->users->save($account),
            AccountType::Worker => $this->workers->save($account),
            AccountType::Admin => $this->admins->save($account),
            AccountType::SuperAdmin => $this->superAdmins->save($account),
        };
    }

    /**
     * The account, from whichever store owns this account type.
     *
     * Returns null rather than throwing so the caller can distinguish "no such
     * account" from "the current password was wrong" — a distinction worth keeping
     * internally even though the API cannot reach it, because the day a path
     * arrives that can, this is where it will be decided.
     */
    private function accountFor(AccountType $type, int $accountId): EndUser|Worker|Admin|SuperAdmin|null
    {
        return match ($type) {
            AccountType::User => $this->users->findById(new UserId($accountId)),
            AccountType::Worker => $this->workers->findById(new UserId($accountId)),
            AccountType::Admin => $this->admins->findById(new UserId($accountId)),
            AccountType::SuperAdmin => $this->superAdmins->findById(new UserId($accountId)),
        };
    }
}
