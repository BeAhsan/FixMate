<?php

namespace App\Domain\IdentityAndAccess\Services;

use App\Domain\IdentityAndAccess\ValueObjects\AccountType;

/**
 * Withdraws an account's sessions, sparing one if asked.
 *
 * Exists because changing a password has to do something that no use case can
 * currently do, and doing it outside the domain would leave a use case that
 * changes a password while leaving a working session behind for whoever knew the
 * old one.
 *
 * The identity is passed as an account type and an identifier rather than as an
 * entity. There is no common `Account` type — four credential stores, four entity
 * classes, and a union parameter would have to be a union — and this interface is
 * about *sessions*, which Sanctum records against a type and an id rather than
 * against a class. Naming it the way the sessions are actually keyed is also what
 * keeps the implementation free of the question "which model was this?".
 */
interface SessionRevoker
{
    /**
     * Revoke every session this account holds, in every application at once.
     *
     * The same reach as signing out, and for the same reason: a person who
     * changes their password expects that a session they no longer have the
     * credential for stops working, on every device, not just the one they
     * happened to be using.
     */
    public function revokeAllFor(AccountType $type, int $accountId): void;

    /**
     * Revoke every session except the one presenting this token.
     *
     * The exception is the point, and it is why this is separate from
     * {@see revokeAllFor()} rather than being a flag on it. Changing a password
     * has to kill the sessions that were opened with the *old* one — that is the
     * entire reason for doing it — but it must not kill the session making the
     * change, or the person is signed out of the application they are standing in
     * at the moment they fixed it.
     *
     * @param  string|null  $exceptTokenId  the id of the token making the request,
     *                                      or null to spare nothing
     */
    public function revokeAllExcept(AccountType $type, int $accountId, ?string $exceptTokenId): void;
}
