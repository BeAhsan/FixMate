<?php

namespace App\Application\IdentityAndAccess\UseCases;

use App\Application\IdentityAndAccess\Exceptions\InvalidPasswordResetToken;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;
use App\Domain\IdentityAndAccess\ValueObjects\Email;
use Illuminate\Auth\Passwords\PasswordBroker;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Password;

/**
 * Use case for completing a password reset.
 *
 * The broker does the three things that make a reset safe and they are all
 * things this use case must not be trusted to do itself: it resolves the token
 * against *its own* token table and provider, so a token minted for one store is
 * not in the table another store's broker reads; it refuses a token that has
 * already been redeemed or has aged out; and it deletes the token once the
 * password is stored, which is what makes a forwarded message worthless a second
 * time. Rebuilding any of that here would be a second implementation of the one
 * piece of credential machinery the spec deliberately left to the framework.
 *
 * What the use case adds is the fourth thing, which the broker cannot do: the
 * account it is given is the one the *route's* store resolved, so the new
 * password lands on that record and no other, and that record's existing API
 * tokens are revoked with it.
 */
class CompletePasswordReset
{
    /**
     * The answer a completed reset gets.
     */
    public const CONFIRMATION = 'Your password has been changed. You can sign in with it now.';

    /**
     * Redeem a reset token and store the new password on that account.
     *
     * @throws InvalidPasswordResetToken If the token is unknown, already used,
     *                                   expired, or belongs to no address this
     *                                   store holds
     */
    public function execute(AccountType $accountType, string $email, string $token, string $password): void
    {
        $status = Password::broker($accountType->broker())->reset(
            [
                'email' => Email::from($email)->value,
                'token' => $token,
                'password' => $password,
            ],
            function (Model $account) use ($password): void {
                $this->storeNewPassword($account, $password);
            },
        );

        // Every non-success status is the same refusal. The broker reports an
        // unknown address and a bad token separately, and the difference is
        // exactly the difference between "no account here" and "an account here
        // exists", so it is not passed on.
        if ($status !== PasswordBroker::PASSWORD_RESET) {
            throw new InvalidPasswordResetToken;
        }
    }

    /**
     * Put the new password on the account the broker resolved, and revoke that
     * account's API tokens.
     *
     * The account arrives from the broker's own provider, which is bound to one
     * model, so this writes to the store the request arrived at. That is the
     * whole of "only the account the reset was requested for is changed": there
     * is no lookup by address here to get wrong, and no second store named
     * anywhere in this method.
     *
     * The tokens go with the password. A reset is what a person does when they
     * believe someone else may have their password, so leaving the old
     * credentials usable would defeat the point of the flow; and because
     * Sanctum's tokens are held against this one model, the revocation cannot
     * reach another store's tokens even by accident. Throwing here would leave
     * the token unredeemed — the broker deletes it only after this returns — so
     * a failure leaves the person able to try again rather than locked out.
     */
    private function storeNewPassword(Model $account, string $password): void
    {
        // 'password' is cast to 'hashed' on all four models, so the value is
        // hashed here exactly as it would be on any other write.
        $account->forceFill(['password' => $password])->save();

        $account->tokens()->delete();
    }
}
