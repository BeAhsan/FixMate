<?php

namespace App\Application\IdentityAndAccess\UseCases;

use App\Application\IdentityAndAccess\DTOs\SignInRequest;
use App\Application\IdentityAndAccess\DTOs\SignInResponse;
use App\Application\IdentityAndAccess\Exceptions\AccountSuspended;
use App\Application\IdentityAndAccess\Exceptions\InvalidCredentials;
use App\Domain\IdentityAndAccess\Repositories\AdminRepository;
use App\Domain\IdentityAndAccess\Services\AuthenticationService;

/**
 * Use case for administrator sign-in.
 *
 * The application layer - orchestrates domain objects and infrastructure. Takes
 * and returns plain DTOs, no framework types.
 *
 * The same shape as SignInEndUser and SignInWorker, and it reuses the same
 * SignInRequest DTO and the same AuthenticationService. Only three things
 * differ: the repository it reads, the ability it grants, and the key it returns
 * the account under. The administrators are a fourth repetition of the same
 * fourteen lines, which is the honest cost of four independent credential
 * stores - and cheaper than the alternative, which is one store with a role
 * column and a role check on every read.
 */
class SignInAdmin
{
    public function __construct(
        private AdminRepository $adminRepository,
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
        // Find the administrator by email, in the admins table only
        $admin = $this->adminRepository->findByEmail($request->email);

        // The order of these two checks is the security property, not a
        // stylistic choice. Credentials are settled first and the account's
        // state is only consulted afterwards, so the plain "your account is
        // suspended" refusal is unreachable without the correct password. The
        // end user and worker paths reason identically; see SignInEndUser for why.
        if (! $this->authService->verifyCredentials($admin?->passwordHash, $request->password)) {
            throw new InvalidCredentials(InvalidCredentials::MESSAGE);
        }

        if (! $this->authService->isAccountActive($admin?->status)) {
            if ($this->authService->isAccountSuspended($admin?->status)) {
                throw new AccountSuspended(AccountSuspended::MESSAGE);
            }

            throw new InvalidCredentials(InvalidCredentials::MESSAGE);
        }

        // Return administrator data for token creation
        return new SignInResponse(
            token: '', // Will be filled by controller after token creation
            userId: $admin->id,
            name: $admin->name,
            email: $admin->email->value,
            // Administrators get their own ability and never the wildcard. An
            // administrator token that could do anything would make the
            // super_admins table decorative.
            abilities: ['admins:*'],
            subject: 'admin',
        );
    }
}
