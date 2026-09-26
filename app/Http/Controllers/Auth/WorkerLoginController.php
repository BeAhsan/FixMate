<?php

namespace App\Http\Controllers\Auth;

use App\Application\IdentityAndAccess\DTOs\SignInRequest as SignInDto;
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
        } catch (\InvalidArgumentException|\DomainException $e) {
            // Invalid credentials or suspended account - 422 with validation error format
            throw ValidationException::withMessages([
                'email' => [$e->getMessage()],
            ]);
        }

        // Find the Eloquent worker using the repository (case-insensitive)
        $worker = Worker::whereRaw('LOWER(email) = ?', [strtolower($dto->email->value)])->firstOrFail();

        $token = $worker->createToken('api', $response->abilities)->plainTextToken;

        // Update response with actual token
        $responseData = $response->toArray();
        $responseData['token'] = $token;

        return (new SignInResource($responseData))
            ->response()
            ->setStatusCode(200);
    }
}
