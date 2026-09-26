<?php

namespace App\Application\IdentityAndAccess\UseCases;

use App\Application\IdentityAndAccess\DTOs\SignInRequest;
use App\Application\IdentityAndAccess\DTOs\SignInResponse;
use App\Domain\IdentityAndAccess\Repositories\WorkerRepository;
use App\Domain\IdentityAndAccess\Services\AuthenticationService;

/**
 * Use case for worker sign-in.
 *
 * The application layer - orchestrates domain objects and infrastructure. Takes
 * and returns plain DTOs, no framework types.
 *
 * It is the same shape as SignInEndUser and reuses the same SignInRequest DTO
 * and the same AuthenticationService. Only three things differ: the repository
 * it reads, the ability it grants, and the key it returns the account under.
 * That is what makes a second account type an addition rather than a fork.
 */
class SignInWorker
{
    public function __construct(
        private WorkerRepository $workerRepository,
        private AuthenticationService $authService,
    ) {}

    /**
     * Execute the sign-in use case.
     *
     * @throws \InvalidArgumentException If credentials are invalid
     * @throws \DomainException If account is suspended
     */
    public function execute(SignInRequest $request): SignInResponse
    {
        // Find worker by email, in the workers table only
        $worker = $this->workerRepository->findByEmail($request->email);

        // Verify credentials using domain service
        if (! $this->authService->verifyCredentials($worker?->passwordHash, $request->password)) {
            // Use same exception for all failure cases to prevent user enumeration
            throw new \InvalidArgumentException('The provided credentials are incorrect.');
        }

        // At this point, worker is not null and credentials are valid
        // Check if account is suspended
        if ($this->authService->isAccountSuspended($worker?->status)) {
            throw new \DomainException('Your account has been suspended. Please contact support.');
        }

        // Return worker data for token creation
        return new SignInResponse(
            token: '', // Will be filled by controller after token creation
            userId: $worker->id,
            name: $worker->name,
            email: $worker->email->value,
            abilities: ['workers:*'], // Worker abilities differ from a customer's
            subject: 'worker',
        );
    }
}
