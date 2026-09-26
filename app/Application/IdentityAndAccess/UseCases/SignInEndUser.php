<?php

namespace App\Application\IdentityAndAccess\UseCases;

use App\Application\IdentityAndAccess\DTOs\SignInRequest;
use App\Application\IdentityAndAccess\DTOs\SignInResponse;
use App\Application\IdentityAndAccess\Exceptions\AccountSuspended;
use App\Application\IdentityAndAccess\Exceptions\InvalidCredentials;
use App\Domain\IdentityAndAccess\Repositories\EndUserRepository;
use App\Domain\IdentityAndAccess\Services\AuthenticationService;

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
     * The order of the two checks below is the security property, not a
     * stylistic choice. The credentials are settled first and the account's
     * state is only consulted afterwards, so the plain "your account is
     * suspended" refusal is unreachable without the correct password. Read the
     * other way round it becomes a free account-existence oracle, and it would
     * be the same bug in the one case where a difference in the response is
     * unavoidable.
     *
     * @throws InvalidCredentials If the address is unknown, the password is
     *                            wrong, the account belongs to another store, or
     *                            the account is in a state that is neither
     *                            active nor suspended
     * @throws AccountSuspended If the credentials are correct and the account
     *                          is suspended
     */
    public function execute(SignInRequest $request): SignInResponse
    {
        $user = $this->userRepository->findByEmail($request->email);

        if (! $this->authService->verifyCredentials($user, $request->password)) {
            throw new InvalidCredentials(InvalidCredentials::MESSAGE);
        }

        if (! $this->authService->isAccountActive($user)) {
            if ($this->authService->isAccountSuspended($user)) {
                throw new AccountSuspended(AccountSuspended::MESSAGE);
            }

            // A state that is neither active nor suspended has no next step we
            // could honestly offer, so it joins the indistinguishable refusal
            // rather than being given a message nobody has agreed to.
            throw new InvalidCredentials(InvalidCredentials::MESSAGE);
        }

        // At this point the credentials are correct and the account is active.
        return new SignInResponse(
            token: '', // Will be filled by controller after token creation
            userId: $user->id,
            name: $user->name,
            email: $user->email->value,
            abilities: ['users:*'], // End user abilities
        );
    }
}
