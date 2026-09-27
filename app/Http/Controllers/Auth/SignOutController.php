<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Infrastructure\IdentityAndAccess\SessionTokenIssuer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * End a session, in this application and in the other three.
 *
 * One controller for all four, for the same reason the renewal route has one:
 * the `account.can` middleware has already established who the caller is, and
 * four copies of a revocation would be four chances to revoke the wrong set of
 * tokens.
 *
 * **Every token this account holds is revoked, not just the one presented.**
 * That is the whole of user story 26 — signing out of the worker application
 * while signed in to the user application signs you out of both — and it can
 * only be done from this side. A front end cannot reach into another
 * application's memory to clear it, so the guarantee has to be that the
 * credential the other application is holding stops being accepted, which means
 * revocation on the server.
 *
 * The renewal tokens go too, and that is the part that stops a sign-out being
 * undone. Clearing only the access tokens would leave a working renewal token in
 * browser storage, and the next page load would quietly sign the person back in
 * seconds after they asked to be signed out.
 *
 * **Signing out twice is a 401, and that is the right answer.** The second
 * attempt presents a token that has already been revoked, so `auth:sanctum`
 * refuses it before this controller is reached. Making it a 200 would mean
 * either weakening that check for this one route or resolving the token by hand,
 * and both are worse than the thing they would fix: the caller asked to be
 * signed out and they are. The end state is identical either way, so the only
 * thing needing care is a front end that treats the 401 as the success it is.
 *
 * **This route deliberately has no `account.can` on it**, which is the only
 * route in the file that does not. `account.can` refuses renewal tokens, and
 * refusing them here would mean the most common case of signing out could not
 * work: the access token has expired, which is the normal reason to be signing
 * out, and the renewal token is the credential that is still alive. Refusing it
 * would leave a working renewal token in browser storage that signs the person
 * straight back in.
 *
 * Nothing is given up by dropping the guard. Revoking tokens can only ever
 * affect the account that presented them, so there is no other account's data
 * or access to reach — the thing `account.can` protects is not in play on a
 * route whose only effect is to delete the caller's own credentials.
 */
class SignOutController extends Controller
{
    public function __construct(private SessionTokenIssuer $tokens) {}

    public function __invoke(Request $request): JsonResponse
    {
        $this->tokens->revokeAllFor($request->user());

        return response()->json(['data' => ['message' => 'Signed out.']]);
    }
}
