<?php

namespace App\Application\IdentityAndAccess\UseCases;

use App\Application\IdentityAndAccess\DTOs\SignInRequest;
use App\Application\IdentityAndAccess\DTOs\SignInResponse;
use App\Application\IdentityAndAccess\Exceptions\AccountSuspended;
use App\Application\IdentityAndAccess\Exceptions\InvalidCredentials;
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

        // The order of these two checks is the security property, not a
        // stylistic choice. Credentials are settled first and the account's
        // state is only consulted afterwards, so the plain "your account is
        // suspended" refusal is unreachable without the correct password. The
        // end user path reasons identically; see SignInEndUser for why.
        if (! $this->authService->verifyCredentials($worker?->passwordHash, $request->password)) {
            throw new InvalidCredentials(InvalidCredentials::MESSAGE);
        }

        if (! $this->authService->isAccountActive($worker?->status)) {
            if ($this->authService->isAccountSuspended($worker?->status)) {
                throw new AccountSuspended(AccountSuspended::MESSAGE);
            }

            throw new InvalidCredentials(InvalidCredentials::MESSAGE);
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
