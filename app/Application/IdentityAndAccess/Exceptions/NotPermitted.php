<?php

namespace App\Application\IdentityAndAccess\Exceptions;

use App\Domain\IdentityAndAccess\ValueObjects\Ability;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;
use RuntimeException;

/**
 * An authenticated account asked for something it is not permitted to have.
 *
 * Distinct from `SignInRefused` and its subclasses, which are about failing to
 * get in. This is about being let in and still not being allowed, which is the
 * whole subject of the ability model: sign-in establishes *who* someone is, and
 * only this establishes *what* they may do with it. Conflating the two would be
 * the mistake that makes a 401 look like an authorisation answer.
 *
 * One class with a `code` rather than a subclass per refusal, unlike the sign-in
 * family. There the subclasses differ in behaviour — a 422 and a 403, with
 * different consequences for the caller. Here every refusal is a 403 and differs
 * only in which sentence is read and which machine-readable facts accompany it,
 * so a class per sentence would be four types saying one thing. What matters is
 * that the codes, the statuses and the wording are written *here*, once: they
 * are the contract the four front ends read, and a refusal composed at its call
 * site would be a refusal whose code is a typo nobody notices until a client has
 * a dead branch.
 *
 * The one status that is not 403 is the one where nobody is signed in at all,
 * because a 403 for that would be a lie: it says the request was authenticated
 * and then refused, and the honest answer is the 401 the rest of the platform
 * gives for it. Carrying the status as a property rather than as a subclass keeps
 * that the only exception to "always 403" instead of the first of several.
 *
 * The named constructors are the only supported way to raise one, for the same
 * reason. Each one names the situation it is for.
 */
class NotPermitted extends RuntimeException
{
    /**
     * The property is called `errorCode` and not `code`, which is the name the
     * envelope gives it, and it is worth being explicit about why that is not
     * simply tidiness: `Exception` has declared `$code` since PHP 5, as a plain
     * `int`-ish property, and promoting a `readonly string $code` over it is a
     * *fatal*, not a redeclaration notice — the process dies at class-declaration
     * time with a message about a property nobody expected to collide. The name
     * is fixed by the language, not chosen here.
     *
     * `AccountNotFound` keeps a `CODE` constant rather than a property, and that
     * asymmetry is the rule rather than an inconsistency: as many codes as there
     * are distinct refusals, in that shape. There are four here, so each named
     * constructor supplies its own; there is one there, so it is a constant and
     * there is nothing to pass in.
     *
     * @param  string  $errorCode  A stable identifier for a front end to branch
     *                             on. English may be reworded; this may not.
     * @param  array<string, mixed>  $details  Facts a client can act on or show.
     *                                         Never anything about the target of
     *                                         a refusal, which is the whole
     *                                         point of refusing it.
     */
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly array $details = [],
        public readonly int $status = 403,
    ) {
        parent::__construct($message);
    }

    /**
     * The account is real and its token is valid, but it belongs to a different
     * credential store than the endpoint does.
     *
     * This is the message that separates "you are not permitted" from "your
     * password is wrong", and it is safe to be specific here in a way the
     * sign-in doors deliberately are not. A person reaching this has already
     * presented a valid token, so they already know which store they are in; the
     * store is being named back to them, not disclosed. The sign-in doors must
     * not do this, because there the caller has proved nothing, and a refusal
     * that named the store would answer "does this person exist over there".
     */
    public static function wrongAccountType(AccountType $actual, AccountType $required): self
    {
        return new self(
            errorCode: 'wrong_account_type',
            message: 'This is the '.$required->value.' application, and the account you are '
                .'signed in with belongs to the '.$actual->value.' store. Sign in at the '
                .'address for your own account type.',
            details: [
                'account_type' => $actual->value,
                'required_account_type' => $required->value,
            ],
        );
    }

    /**
     * The token is valid and the account is the right store, but the token does
     * not carry the ability the endpoint requires.
     *
     * Named separately from `wrongAccountType` because it is a different fault
     * with a different fix, and a caller who cannot tell them apart cannot act.
     * A person in the wrong application needs to go and sign in somewhere else; a
     * person in the right one has a token the platform issued and is not being
     * asked to do anything — the answer is that this function is not theirs.
     *
     * The required ability is stated rather than withheld. It is not a secret:
     * the route that requires it is public, the ability names are in
     * `Ability`, and the caller can already read its own claim list from
     * `GET /me`. Withholding it would only produce a support conversation.
     */
    public static function abilityRequired(string $ability): self
    {
        return new self(
            errorCode: 'ability_required',
            message: 'This function is not available to your account type. It requires the ['
                .$ability.'] ability.',
            details: ['required_ability' => $ability],
        );
    }

    /**
     * The record exists in the caller's own store, but it is not the caller's.
     *
     * The ability that would unlock it is named, because this is the one refusal
     * on the platform where the caller can do something about it that is not
     * "sign in elsewhere" — a super administrator holding `accounts:read` reads
     * the same record through the same path and is let. The message is the same
     * either way, and the `details` are too: whether the record exists is not
     * something this refusal is allowed to reveal, and it does not, because
     * nothing here looks the record up before deciding.
     */
    public static function notTheAccountsOwnRecord(string $requiredAbility = Ability::ACCOUNTS_READ): self
    {
        return new self(
            errorCode: 'not_the_record_owner',
            message: 'This is another account\'s record. An account may read its own; reading '
                .'any other requires the ['.$requiredAbility.'] ability.',
            details: ['required_ability' => $requiredAbility],
        );
    }

    /**
     * Nobody is signed in, so there is nothing to hold to any ability at all.
     *
     * `auth:sanctum` answers this before this middleware runs, so reaching here
     * means the route was declared without it — and the answer is the same
     * refusal either way, on purpose. A route that forgot `auth:sanctum` is a
     * bug, and the safest shape for that bug is the ordinary "you are not signed
     * in" answer rather than a distinctive one, because the alternative is a way
     * to tell the world which routes forgot.
     */
    public static function notSignedIn(): self
    {
        return new self(
            errorCode: 'unauthenticated',
            message: 'Unauthenticated.',
            status: 401,
        );
    }
}
