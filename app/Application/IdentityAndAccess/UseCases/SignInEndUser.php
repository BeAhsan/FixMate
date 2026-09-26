<?php

namespace App\Application\IdentityAndAccess\UseCases;

use App\Application\IdentityAndAccess\DTOs\SignInRequest;
use App\Application\IdentityAndAccess\DTOs\SignInResponse;
use App\Domain\IdentityAndAccess\Repositories\EndUserRepository;
use App\Domain\IdentityAndAccess\Services\AuthenticationService;
use App\Domain\IdentityAndAccess\ValueObjects\Email;

/**
 * Use case for end user sign-in.
 * This is the application layer - orchestrates domain objects and infrastructure.
 * Takes and returns plain DTOs, no framework types.
 */
class SignInEndUser
{
    public function __construct(
        private EndUserRepository $userRepository,
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
        // Find user by email
        $user = $this->userRepository->findByEmail($request->email);

        // Verify credentials using domain service
        if (! $this->authService->verifyCredentials($user, $request->password)) {
            // Use same exception for all failure cases to prevent user enumeration
            throw new \InvalidArgumentException('The provided credentials are incorrect.');
        }

        // At this point, user is not null and credentials are valid
        // Check if account is suspended
        if ($this->authService->isAccountSuspended($user)) {
            throw new \DomainException('Your account has been suspended. Please contact support.');
        }

        // Return user data for token creation
        return new SignInResponse(
            token: '', // Will be filled by controller after token creation
            userId: $user->id,
            name: $user->name,
            email: $user->email->value,
            abilities: ['users:*'], // End user abilities
        );
    }
}
