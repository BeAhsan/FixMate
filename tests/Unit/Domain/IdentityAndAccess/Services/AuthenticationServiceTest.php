<?php

namespace Tests\Unit\Domain\IdentityAndAccess\Services;

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

    /**
     * The lowest cost bcrypt allows. A real deployment uses a higher one, but a
     * unit test asserting *which* branch was taken does not need the work, and
     * the decoy-hash equaliser is exercised by the feature test at the real cost
     * where the timing actually matters.
     */
    private const TEST_COST = 4;

    private AuthenticationService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->service = new AuthenticationService(self::TEST_COST);
    }

    private static function hash(): string
    {
        return password_hash(self::PASSWORD, PASSWORD_BCRYPT);
    }

    #[Test]
    public function it_accepts_the_correct_password(): void
    {
        $this->assertTrue($this->service->verifyCredentials(self::hash(), self::PASSWORD));
    }

    #[Test]
    public function it_rejects_an_incorrect_password(): void
    {
        $this->assertFalse($this->service->verifyCredentials(self::hash(), 'wrong-password'));
    }

    #[Test]
    public function an_unknown_address_and_a_wrong_password_are_both_refused_the_same_way(): void
    {
        // The property that stops the sign-in endpoint being an account-existence
        // oracle. Both cases return false, and neither leaks why.
        $unknownAddress = $this->service->verifyCredentials(null, self::PASSWORD);
        $wrongPassword = $this->service->verifyCredentials(self::hash(), 'wrong-password');

        $this->assertFalse($unknownAddress);
        $this->assertFalse($wrongPassword);
        $this->assertSame($unknownAddress, $wrongPassword, 'both must be refused identically');
    }

    #[Test]
    public function an_empty_password_is_refused(): void
    {
        $this->assertFalse($this->service->verifyCredentials(self::hash(), ''));
    }

    #[Test]
    public function a_suspended_account_is_not_active(): void
    {
        // Note: a suspended account can still have a *correct* password. Status is
        // a separate rule from the credential check, and conflating the two is how
        // "suspended" ends up meaning "wrong password" in the response.
        $this->assertTrue($this->service->verifyCredentials(self::hash(), self::PASSWORD));
        $this->assertFalse($this->service->isAccountActive(AccountStatus::Suspended));
        $this->assertTrue($this->service->isAccountSuspended(AccountStatus::Suspended));
    }

    #[Test]
    public function an_active_account_is_active_and_not_suspended(): void
    {
        $this->assertTrue($this->service->isAccountActive(AccountStatus::Active));
        $this->assertFalse($this->service->isAccountSuspended(AccountStatus::Active));
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
