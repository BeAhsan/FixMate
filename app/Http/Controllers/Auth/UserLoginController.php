<?php

namespace App\Http\Controllers\Auth;

use App\Application\IdentityAndAccess\DTOs\SignInRequest as SignInDto;
use App\Application\IdentityAndAccess\UseCases\SignInEndUser;
use App\Domain\IdentityAndAccess\Repositories\EndUserRepository;
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
    public function __construct(
        private SignInEndUser $signInUseCase,
        private EndUserRepository $userRepository,
    ) {}

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
        } catch (\InvalidArgumentException $e) {
            // Invalid credentials - return 422 with validation error format
            throw ValidationException::withMessages([
                'email' => [$e->getMessage()],
            ]);
        } catch (\DomainException $e) {
            // Suspended account - return 422 with validation error format
            throw ValidationException::withMessages([
                'email' => [$e->getMessage()],
            ]);
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
}
