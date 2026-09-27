<?php

namespace App\Http\Controllers\Auth;

use App\Application\IdentityAndAccess\Exceptions\CannotSupplyCurrentPassword;
use App\Application\IdentityAndAccess\Exceptions\PasswordUnchanged;
use App\Application\IdentityAndAccess\UseCases\ChangeOwnPassword;
use App\Application\IdentityAndAccess\UseCases\DescribeCurrentAccount;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ChangePasswordRequest;
use App\Http\Resources\Auth\CurrentAccountResource;
use App\Infrastructure\IdentityAndAccess\AccountTypeRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

/**
 * Replaces the password of whoever is signed in.
 *
 * One controller for all four account types, like `CurrentAccountController` and
 * `SignOutController`. The account comes from the authenticated token and from
 * nothing else: there is no identifier in the path and none in the body, so there
 * is nothing for a caller to alter in order to reach an account that is not theirs.
 * That is the whole of story 33's concern for this route, and it is answered by
 * there being no selector at all.
 *
 * The response is the current account, for the same reason the sign-out response
 * acknowledges rather than returning nothing: the front end has just invalidated
 * every other session this account had, and it needs to know who it is still signed
 * in as in order to render what comes next. Returning the account also means the
 * client does not have to make a second request to find out whether the change
 * worked.
 */
class ChangePasswordController extends Controller
{
    public function __construct(
        private ChangeOwnPassword $changeOwnPassword,
        private DescribeCurrentAccount $describeCurrentAccount,
    ) {}

    /**
     * No route parameter, and that is the design rather than an omission.
     *
     * The account type comes from the authenticated token, via the same
     * `AccountTypeRegistry` the middleware and `CurrentAccountController` use. So
     * there is no `{type}` in the path to disagree with the guard, and nothing in
     * the request a caller could alter to reach a different account.
     *
     * The first version took `string $type` from a `/{type}/password/change` route
     * and had a 500 branch for a value that was not an account type. That branch was
     * unreachable by construction once the route became four literal doors, and
     * keeping a guard for a case that cannot occur is a guard that will one day be
     * the only thing anybody reads about what this route accepts.
     */
    public function __invoke(ChangePasswordRequest $request): JsonResponse
    {
        $account = $request->user();

        $accountType = AccountTypeRegistry::for($account);

        try {
            $this->changeOwnPassword->execute(
                type: $accountType,
                accountId: (int) $account->getKey(),
                currentPassword: (string) $request->input('current_password'),
                newPassword: (string) $request->input('password'),
                // Spared, so the person is not signed out of the application they are
                // standing in at the moment they fixed it. Every *other* session this
                // account had is withdrawn by the use case.
                exceptTokenId: $account->currentAccessToken()?->getKey(),
            );
        } catch (CannotSupplyCurrentPassword $e) {
            // 422, keyed on the field the person has to act on, so a front end can put
            // the message next to the right input without mapping status codes to
            // fields itself. The back end's wording is passed through verbatim for the
            // same reason every other refusal is: a second wording in the front end is
            // a second chance to leak which check failed.
            throw ValidationException::withMessages(['current_password' => [$e->getMessage()]]);
        } catch (PasswordUnchanged $e) {
            // Keyed on the field the person typed into, not on the one that is
            // already taken. The first version of this decided the field by searching
            // the message for "already using", which is a rewording away from putting
            // "you did not type your current password" next to the new-password box.
            throw ValidationException::withMessages(['password' => [$e->getMessage()]]);
        }

        // The account is re-read rather than answered from the request's model, so the
        // response reflects what was stored — including the cleared flag, which is the
        // one thing the client most needs confirmed.
        $current = $this->describeCurrentAccount->execute(
            $accountType,
            $account,
            // The token's own claims, for the same reason CurrentAccountController
            // echoes them rather than recomputing: this reports the reach this
            // request was actually granted, not a second opinion about it.
            $account->currentAccessToken()?->abilities ?? [],
        );

        return (new CurrentAccountResource($current))
            ->response()
            ->setStatusCode(200);
    }
}
