<?php

namespace App\Http\Controllers\Auth;

use App\Application\IdentityAndAccess\DTOs\SignInRequest as SignInDto;
use App\Application\IdentityAndAccess\Exceptions\AccountSuspended;
use App\Application\IdentityAndAccess\Exceptions\InvalidCredentials;
use App\Application\IdentityAndAccess\UseCases\SignInEndUser;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\SignInRequest;
use App\Http\Resources\Auth\SignInResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

/**
 * Controller for end user sign-in.
 * Thin controller: validates, calls use case, returns resource.
 */
class UserLoginController extends Controller
{
    /**
     * The key every sign-in refusal is reported under.
     *
     * It is deliberately not `email` or `password`. A refusal filed against one
     * of the two fields tells the person which field to go and look at, and
     * that is a distinction the refusal is not supposed to make.
     */
    private const REFUSAL_KEY = 'credentials';

    public function __construct(private SignInEndUser $signInUseCase) {}

    /**
     * Handle sign-in request for end users.
     */
    public function __invoke(SignInRequest $request): JsonResponse
    {
        // Convert validated request to DTO
        $dto = SignInDto::fromArray($request->toDtoArray());

        try {
            // Execute use case
            $response = $this->signInUseCase->execute($dto);
        } catch (InvalidCredentials $e) {
            // 422: the submitted pair of credentials is not one we can use.
            throw $this->refusal($e->getMessage(), 422);
        } catch (AccountSuspended $e) {
            // 403: the credentials were fine and the account state is not.
            // Distinct on purpose, and only reachable with the right password.
            throw $this->refusal($e->getMessage(), 403);
        }

        // Find the Eloquent user using the repository (case-insensitive)
        $user = User::whereRaw('LOWER(email) = ?', [strtolower($dto->email->value)])->firstOrFail();

        $token = $user->createToken('api', $response->abilities)->plainTextToken;

        // Update response with actual token
        $responseData = $response->toArray();
        $responseData['token'] = $token;

        return (new SignInResource($responseData))
            ->response()
            ->setStatusCode(200);
    }

    /**
     * Build the refusal response, carrying the status the refusal is entitled to.
     */
    private function refusal(string $message, int $status): ValidationException
    {
        return ValidationException::withMessages([
            self::REFUSAL_KEY => [$message],
        ])->status($status);
    }
}
