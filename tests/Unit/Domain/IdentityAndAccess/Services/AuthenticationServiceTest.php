<?php

namespace Tests\Unit\Domain\IdentityAndAccess\Services;

use App\Domain\IdentityAndAccess\Entities\EndUser;
use App\Domain\IdentityAndAccess\Services\AuthenticationService;
use App\Domain\IdentityAndAccess\ValueObjects\AccountStatus;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * Pure unit tests for the AuthenticationService.
 *
 * This service decides whether a credential is valid. The rules asserted here
 * are the security-critical ones, and they are tested with no database, no
 * framework, and no HTTP — which is the property the DDD layering exists to
 * provide.
 */
class AuthenticationServiceTest extends TestCase
{
    private const PASSWORD = 'correct-horse-battery-staple';

    private AuthenticationService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->service = new AuthenticationService;
    }

    private static function user(AccountStatus $status = AccountStatus::Active): EndUser
    {
        return EndUser::fromPersistence(
            id: 1,
            name: 'Test Person',
            email: 'person@example.com',
            passwordHash: password_hash(self::PASSWORD, PASSWORD_BCRYPT),
            status: $status->value,
        );
    }

    #[Test]
    public function it_accepts_the_correct_password(): void
    {
        $this->assertTrue($this->service->verifyCredentials(self::user(), self::PASSWORD));
    }

    #[Test]
    public function it_rejects_an_incorrect_password(): void
    {
        $this->assertFalse($this->service->verifyCredentials(self::user(), 'wrong-password'));
    }

    #[Test]
    public function an_unknown_address_and_a_wrong_password_are_both_refused_the_same_way(): void
    {
        // The property that stops the sign-in endpoint being an account-existence
        // oracle. Both cases return false, and neither leaks why.
        $unknownAddress = $this->service->verifyCredentials(null, self::PASSWORD);
        $wrongPassword = $this->service->verifyCredentials(self::user(), 'wrong-password');

        $this->assertFalse($unknownAddress);
        $this->assertFalse($wrongPassword);
        $this->assertSame($unknownAddress, $wrongPassword, 'both must be refused identically');
    }

    #[Test]
    public function an_empty_password_is_refused(): void
    {
        $this->assertFalse($this->service->verifyCredentials(self::user(), ''));
    }

    #[Test]
    public function a_suspended_account_is_not_active(): void
    {
        // Note: a suspended account can still have a *correct* password. Status is
        // a separate rule from the credential check, and conflating the two is how
        // "suspended" ends up meaning "wrong password" in the response.
        $suspended = self::user(AccountStatus::Suspended);

        $this->assertTrue($this->service->verifyCredentials($suspended, self::PASSWORD));
        $this->assertFalse($this->service->isAccountActive($suspended));
        $this->assertTrue($this->service->isAccountSuspended($suspended));
    }

    #[Test]
    public function an_active_account_is_active_and_not_suspended(): void
    {
        $active = self::user();

        $this->assertTrue($this->service->isAccountActive($active));
        $this->assertFalse($this->service->isAccountSuspended($active));
    }

    #[Test]
    public function an_unknown_address_is_neither_active_nor_suspended(): void
    {
        // This is what keeps a suspended-account message from becoming an
        // enumeration channel: "suspended" is only ever reported for an account
        // that actually exists and is actually suspended.
        $this->assertFalse($this->service->isAccountActive(null));
        $this->assertFalse($this->service->isAccountSuspended(null));
    }
}
