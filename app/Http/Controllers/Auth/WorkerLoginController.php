<?php

namespace App\Http\Controllers\Auth;

use App\Application\IdentityAndAccess\DTOs\SignInRequest as SignInDto;
use App\Application\IdentityAndAccess\Exceptions\AccountSuspended;
use App\Application\IdentityAndAccess\Exceptions\InvalidCredentials;
use App\Application\IdentityAndAccess\UseCases\SignInWorker;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\SignInRequest;
use App\Http\Resources\Auth\SignInResource;
use App\Models\Worker;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

/**
 * Controller for worker sign-in.
 *
 * Thin controller, same shape as the end user one: validate, call the use case,
 * issue the token, return the resource. It differs only in the use case it calls
 * and the model it issues the token against, so the worker path is the end user
 * path repeated rather than a second sign-in implementation.
 */
class WorkerLoginController extends Controller
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
        private SignInWorker $signInUseCase,
    ) {}

    /**
     * Handle sign-in request for workers.
     */
    public function __invoke(SignInRequest $request): JsonResponse
    {
        // Convert validated request to DTO
        $dto = SignInDto::fromArray($request->toDtoArray());

        try {
            // Execute use case
            $response = $this->signInUseCase->execute($dto);
        } catch (AccountSuspended $e) {
            // A suspended worker is told plainly, with a real next step. Safe to
            // do here only because the use case settles the password first, so
            // this response is unreachable without the correct password.
            throw ValidationException::withMessages([
                self::REFUSAL_KEY => [$e->getMessage()],
            ])->status(403);
        } catch (InvalidCredentials $e) {
            // Every other refusal - unknown address, wrong password, an account
            // in another store, a state that is neither active nor suspended -
            // is indistinguishable, and filed under a neutral key so the error
            // does not point at one of the two submitted fields.
            throw ValidationException::withMessages([
                self::REFUSAL_KEY => [$e->getMessage()],
            ])->status(422);
        }

        // Find the Eloquent worker to mint the token against (case-insensitive).
        //
        // The use case has already resolved and verified this account, so in
        // every intended path this lookup finds it. It is a second place where
        // the store a request is checked against is decided, and a miss here is
        // therefore a store mix-up rather than a fact about the caller. It used
        // to be firstOrFail(), which turned that mix-up into a 404 - a
        // distinguishable status on a route whose only honest refusals are 422
        // and 403, and so a way to probe which addresses exist in which store.
        // The neutral refusal is the correct answer: fail closed, say nothing.
        $worker = Worker::whereRaw('LOWER(email) = ?', [strtolower($dto->email->value)])->first();

        if (! $worker) {
            throw ValidationException::withMessages([
                self::REFUSAL_KEY => [InvalidCredentials::MESSAGE],
            ])->status(422);
        }

        $token = $worker->createToken('api', $response->abilities)->plainTextToken;

        // Update response with actual token
        $responseData = $response->toArray();
        $responseData['token'] = $token;

        return (new SignInResource($responseData))
            ->response()
            ->setStatusCode(200);
    }
}
