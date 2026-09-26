<?php

namespace App\Application\IdentityAndAccess\UseCases;

use App\Application\IdentityAndAccess\DTOs\SignInRequest;
use App\Application\IdentityAndAccess\DTOs\SignInResponse;
use App\Application\IdentityAndAccess\Exceptions\AccountSuspended;
use App\Application\IdentityAndAccess\Exceptions\InvalidCredentials;
use App\Domain\IdentityAndAccess\Repositories\SuperAdminRepository;
use App\Domain\IdentityAndAccess\Services\AuthenticationService;

/**
 * Use case for super administrator sign-in.
 *
 * Identical in shape to SignInEndUser, SignInWorker and SignInAdmin, and it
 * reuses the same SignInRequest DTO and the same AuthenticationService. It is
 * the fourth door, and the only difference is the repository it reads, the
 * ability it grants, and the key it returns the account under.
 *
 * The wildcard ability below is the one place in the platform where a token can
 * do anything, and it is granted here and nowhere else. It is deliberately not
 * reachable by writing to the admins table, which is why the two staff stores
 * are separate tables rather than one table with a flag.
 */
class SignInSuperAdmin
{
    public function __construct(
        private SuperAdminRepository $superAdminRepository,
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
        // Find the super administrator by email, in the super_admins table only
        $superAdmin = $this->superAdminRepository->findByEmail($request->email);

        // The order of these two checks is the security property, not a
        // stylistic choice. Credentials are settled first and the account's
        // state is only consulted afterwards, so the plain "your account is
        // suspended" refusal is unreachable without the correct password. The
        // other three sign-in paths reason identically.
        if (! $this->authService->verifyCredentials($superAdmin?->passwordHash, $request->password)) {
            throw new InvalidCredentials(InvalidCredentials::MESSAGE);
        }

        if (! $this->authService->isAccountActive($superAdmin?->status)) {
            if ($this->authService->isAccountSuspended($superAdmin?->status)) {
                throw new AccountSuspended(AccountSuspended::MESSAGE);
            }

            throw new InvalidCredentials(InvalidCredentials::MESSAGE);
        }

        // Return super administrator data for token creation
        return new SignInResponse(
            token: '', // Will be filled by controller after token creation
            userId: $superAdmin->id,
            name: $superAdmin->name,
            email: $superAdmin->email->value,
            // The wildcard, issued sparingly and visibly - see the class
            // docblock. This is the only place it is granted.
            abilities: ['*'],
            subject: 'super_admin',
        );
    }
}
