<?php

namespace App\Http\Controllers\Auth;

use App\Application\IdentityAndAccess\Exceptions\InvalidPasswordResetToken;
use App\Application\IdentityAndAccess\UseCases\CompletePasswordReset;
use App\Application\IdentityAndAccess\UseCases\RequestPasswordReset;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

/**
 * The two halves of a password reset, shared by all four applications.
 *
 * The behaviour is here and the four doors are four one-line subclasses, because
 * the store a reset affects is decided in exactly one place per door and that
 * place should be readable in one line: `accountType()`. A controller that
 * re-derived the store from the submitted address, or that fell back to the
 * default broker when the route was new, would be a scoping mistake with no
 * visible failure — the wrong person's password would change and both responses
 * would look right.
 *
 * Both responses are deliberately dull. The link request always acknowledges
 * identically, so nothing about which addresses hold an account can be learned
 * from it, and the completion always reports a link as valid or invalid without
 * distinguishing an unknown address from a spent token.
 */
abstract class PasswordResetController extends Controller
{
    /**
     * The key every reset refusal is filed under.
     *
     * Not `email` and not `token`. The two failures a person can actually fix —
     * an address that holds no account, and a link that no longer works — have
     * different causes but the same next step, and filing each under the field
     * that caused it would turn the reset endpoint into a way of asking whether
     * an address is registered.
     */
    private const REFUSAL_KEY = 'password_reset';

    public function __construct(
        private readonly RequestPasswordReset $requestPasswordReset,
        private readonly CompletePasswordReset $completePasswordReset,
    ) {}

    /**
     * The credential store this door resets.
     *
     * Overridden once per application, and the answer is a case of the account
     * type rather than a name looked up at runtime — so the door and the store
     * cannot come apart, and the four brokers cannot be reached through the
     * wrong one.
     */
    abstract protected function accountType(): AccountType;

    /**
     * Ask for a reset link to be sent.
     *
     * 202 rather than 200, and the same 202 with the same body whether or not
     * the address belongs to an account. That is the whole of the "reveals
     * nothing" property, and it is why the use case returns nothing: there is
     * no status here to leak.
     */
    public function requestLink(ForgotPasswordRequest $request): JsonResponse
    {
        $this->requestPasswordReset->execute($this->accountType(), (string) $request->validated('email'));

        return response()->json([
            'data' => ['message' => RequestPasswordReset::ACKNOWLEDGEMENT],
        ], 202);
    }

    /**
     * Redeem a reset link and store the new password.
     *
     * 422 for a link that no longer works. Not 404 and not 403: a missing
     * record and a forbidden record are both statuses a person can be
     * *observed* receiving, and on this endpoint the difference between them and
     * a plain refusal is the difference between "no such account" and "an
     * account, and you are not it".
     */
    public function complete(ResetPasswordRequest $request): JsonResponse
    {
        try {
            $this->completePasswordReset->execute(
                $this->accountType(),
                (string) $request->validated('email'),
                (string) $request->validated('token'),
                (string) $request->validated('password'),
            );
        } catch (InvalidPasswordResetToken $e) {
            throw ValidationException::withMessages([
                self::REFUSAL_KEY => [$e->getMessage()],
            ])->status(422);
        }

        return response()->json([
            'data' => ['message' => CompletePasswordReset::CONFIRMATION],
        ]);
    }
}
