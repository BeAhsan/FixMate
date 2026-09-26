<?php

namespace Tests\Unit\Domain\IdentityAndAccess\Entities;

use App\Domain\IdentityAndAccess\Entities\EndUser;
use App\Domain\IdentityAndAccess\ValueObjects\AccountStatus;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * Pure unit tests for the EndUser entity.
 *
 * No framework base test case: the domain layer must be testable with no
 * database and no application bootstrap.
 */
class EndUserTest extends TestCase
{
    private static function user(AccountStatus $status = AccountStatus::Active, string $password = 'correct-password'): EndUser
    {
        return EndUser::fromPersistence(
            id: 1,
            name: 'Test Person',
            email: 'person@example.com',
            passwordHash: password_hash($password, PASSWORD_BCRYPT),
            status: $status->value,
        );
    }

    #[Test]
    public function an_active_user_can_authenticate(): void
    {
        $this->assertTrue(self::user(AccountStatus::Active)->canAuthenticate());
    }

    #[Test]
    public function a_suspended_user_cannot_authenticate(): void
    {
        $user = self::user(AccountStatus::Suspended);

        $this->assertFalse($user->canAuthenticate());
        $this->assertTrue($user->isSuspended());
    }

    #[Test]
    public function a_pending_user_cannot_authenticate(): void
    {
        $this->assertFalse(self::user(AccountStatus::Pending)->canAuthenticate());
    }

    #[Test]
    public function it_can_be_built_from_persistence_data(): void
    {
        $user = self::user();

        $this->assertSame(1, $user->id->value);
        $this->assertSame('Test Person', $user->name);
        $this->assertSame('person@example.com', $user->email->value);
        $this->assertSame(AccountStatus::Active, $user->status);
    }

    #[Test]
    public function it_normalises_the_email_it_is_built_from(): void
    {
        $user = EndUser::fromPersistence(1, 'Test', 'Person@Example.COM', 'hash', 'active');

        $this->assertSame('person@example.com', $user->email->value);
    }

    #[Test]
    public function a_stored_status_it_does_not_recognise_cannot_authenticate(): void
    {
        // The regression test for the fail-open default. A status value this code
        // has never heard of must not resolve to Active.
        $user = EndUser::fromPersistence(1, 'Test', 'person@example.com', 'hash', 'banned');

        $this->assertFalse($user->canAuthenticate());
    }

    #[Test]
    public function it_does_not_expose_the_password_hash_as_a_plain_string(): void
    {
        // The hash is carried because credential checking needs it, but it must
        // never be the plain password. A cheap guard against a future refactor
        // that swaps passwordHash for a plain password field.
        $user = EndUser::fromPersistence(1, 'Test', 'person@example.com', 'a-bcrypt-or-argon-hash', 'active');

        $this->assertSame('a-bcrypt-or-argon-hash', $user->passwordHash);
        $this->assertNotSame('password', $user->passwordHash);
    }

    #[Test]
    public function it_rejects_an_invalid_email_at_construction(): void
    {
        $this->expectException(InvalidArgumentException::class);

        EndUser::fromPersistence(1, 'Test', 'not-an-address', 'hash', 'active');
    }
}
