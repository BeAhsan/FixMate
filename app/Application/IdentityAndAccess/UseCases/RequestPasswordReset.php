<?php

namespace App\Application\IdentityAndAccess\UseCases;

use App\Domain\IdentityAndAccess\ValueObjects\AccountType;
use App\Domain\IdentityAndAccess\ValueObjects\Email;
use Illuminate\Support\Facades\Password;

/**
 * Use case for asking a store to send a password reset link.
 *
 * One use case for all four account types, unlike sign-in where there are four.
 * The difference is what varies: a sign-in has to read an entity and mint a
 * token against a model, and each store's repository and model are different
 * objects, so they were written out. A reset has no such step — the core
 * `Password` broker is handed a broker name and does the rest — so the only
 * thing that decides which account is affected is the broker, and one use case
 * that is *told* the broker cannot be a near-copy of itself with the name
 * edited. The four doors are still four doors: each controller names its own
 * `AccountType`, and the address is never consulted to decide which store is
 * meant.
 *
 * The broker is chosen here rather than by mutating `config('auth.passwords')`,
 * for the reason the account type value object gives: the configuration is read
 * by every later caller, so a temporary override would move the platform's reset
 * tokens rather than this request's.
 *
 * @see AccountType
 */
class RequestPasswordReset
{
    /**
     * The answer every caller gets, whether or not an account holds the address.
     *
     * Phrased as a conditional on purpose. It has to be the *same* answer in
     * both cases, and it has to read as an answer rather than as a silence, so
     * the wording is the one that is honest in both worlds: it promises nothing
     * it cannot deliver and reveals nothing it should not.
     */
    public const ACKNOWLEDGEMENT = 'If that address belongs to an account, a password reset link is on its way.';

    /**
     * Ask the account type's broker to send a reset link.
     *
     * Returns nothing, and that is the security property rather than an
     * omission. The broker distinguishes four outcomes — link sent, no such
     * address, already sent recently, and throttled — and all four collapse into
     * the same acknowledgement here. Returning a status would invite a
     * controller to branch on it, and the first branch written would be the one
     * that tells a caller their address is registered.
     *
     * The "already sent recently" outcome is the subtle one: the broker
     * remembers a token it issued for that address minutes ago, so refusing it
     * as throttled would distinguish a real account from an invented address.
     * Collapsing it is what keeps the second request in a burst as uninformative
     * as the first.
     */
    public function execute(AccountType $accountType, string $email): void
    {
        Password::broker($accountType->broker())->sendResetLink([
            'email' => Email::from($email)->value,
        ]);
    }
}
