<?php

namespace App\Http\Controllers\Auth;

use App\Application\IdentityAndAccess\DTOs\SignInRequest as SignInDto;
use App\Application\IdentityAndAccess\Exceptions\AccountSuspended;
use App\Application\IdentityAndAccess\Exceptions\InvalidCredentials;
use App\Application\IdentityAndAccess\UseCases\SignInSuperAdmin;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\SignInRequest;
use App\Http\Resources\Auth\SignInResource;
use App\Infrastructure\IdentityAndAccess\SessionTokenIssuer;
use App\Models\SuperAdmin;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

/**
 * Controller for super administrator sign-in.
 *
 * The thin controller shape again, for the fourth and last account type. It
 * differs from the administrator controller only in the use case it calls and
 * the model it issues the token against.
 */
class SuperAdminLoginController extends Controller
{
    /**
     * The neutral key every refusal is filed under.
     *
     * Not 'email' or 'password': naming one of the two submitted fields tells
     * the person which field the server judged, which is more than an
     * indistinguishable refusal should give away. Matches UserLoginController.
     */
    private const REFUSAL_KEY = 'credentials';

    public function __construct(
        private SignInSuperAdmin $signInUseCase,
        private SessionTokenIssuer $tokens,
    ) {}

    /**
     * Handle sign-in request for super administrators.
     */
    public function __invoke(SignInRequest $request): JsonResponse
    {
        // Convert validated request to DTO
        $dto = SignInDto::fromArray($request->toDtoArray());

        try {
            // Execute use case
            $response = $this->signInUseCase->execute($dto);
        } catch (AccountSuspended $e) {
            // A suspended super administrator is told plainly, with a real next
            // step. Safe to do here only because the use case settles the
            // password first, so this response is unreachable without the
            // correct password.
            throw ValidationException::withMessages([
                self::REFUSAL_KEY => [$e->getMessage()],
            ])->status(403);
        } catch (InvalidCredentials $e) {
            // Every other refusal - unknown address, wrong password, an account
            // in any of the other three stores, a state that is neither active
            // nor suspended - is indistinguishable, and filed under a neutral key
            // so the error does not point at one of the two submitted fields.
            throw ValidationException::withMessages([
                self::REFUSAL_KEY => [$e->getMessage()],
            ])->status(422);
        }

        // Find the Eloquent super administrator to mint the token against
        // (case-insensitive).
        //
        // The use case has already resolved and verified this account, so in
        // every intended path this lookup finds it. It is a second place where
        // the store a request is checked against is decided, and a miss here is
        // therefore a store mix-up rather than a fact about the caller. It used
        // to be firstOrFail(), which turned that mix-up into a 404 - a
        // distinguishable status on a route whose only honest refusals are 422
        // and 403, and so a way to probe which addresses exist in which store.
        // The neutral refusal is the correct answer: fail closed, say nothing.
        $superAdmin = SuperAdmin::whereRaw('LOWER(email) = ?', [strtolower($dto->email->value)])->first();

        if (! $superAdmin) {
            throw ValidationException::withMessages([
                self::REFUSAL_KEY => [InvalidCredentials::MESSAGE],
            ])->status(422);
        }

        // Two tokens, not one: the short-lived access token the application
        // holds in memory, and the renewal token it puts in browser storage so
        // that a page reload does not end the session. See SessionTokenIssuer
        // for why the second is worth so much less than the first.
        $issued = $this->tokens->issue($superAdmin, $response->abilities);

        $responseData = array_merge($response->toArray(), $issued->toSignInArray());

        return (new SignInResource($responseData))
            ->response()
            ->setStatusCode(200);
    }
}
