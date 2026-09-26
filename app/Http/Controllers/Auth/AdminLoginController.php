<?php

namespace App\Http\Controllers\Auth;

use App\Application\IdentityAndAccess\DTOs\SignInRequest as SignInDto;
use App\Application\IdentityAndAccess\Exceptions\AccountSuspended;
use App\Application\IdentityAndAccess\Exceptions\InvalidCredentials;
use App\Application\IdentityAndAccess\UseCases\SignInAdmin;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\SignInRequest;
use App\Http\Resources\Auth\SignInResource;
use App\Models\Admin;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

/**
 * Controller for administrator sign-in.
 *
 * The thin controller shape, fourth time: validate, call the use case, issue the
 * token, return the resource. It differs from the worker controller only in the
 * use case it calls and the model it issues the token against, so the staff
 * path is the end user path repeated rather than a second sign-in
 * implementation.
 */
class AdminLoginController extends Controller
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
        private SignInAdmin $signInUseCase,
    ) {}

    /**
     * Handle sign-in request for administrators.
     */
    public function __invoke(SignInRequest $request): JsonResponse
    {
        // Convert validated request to DTO
        $dto = SignInDto::fromArray($request->toDtoArray());

        try {
            // Execute use case
            $response = $this->signInUseCase->execute($dto);
        } catch (AccountSuspended $e) {
            // A suspended administrator is told plainly, with a real next step.
            // Safe to do here only because the use case settles the password
            // first, so this response is unreachable without the correct password.
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

        // Find the Eloquent admin using the repository (case-insensitive)
        $admin = Admin::whereRaw('LOWER(email) = ?', [strtolower($dto->email->value)])->firstOrFail();

        $token = $admin->createToken('api', $response->abilities)->plainTextToken;

        // Update response with actual token
        $responseData = $response->toArray();
        $responseData['token'] = $token;

        return (new SignInResource($responseData))
            ->response()
            ->setStatusCode(200);
    }
}
