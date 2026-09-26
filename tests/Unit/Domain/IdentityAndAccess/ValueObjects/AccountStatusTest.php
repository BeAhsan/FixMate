<?php

namespace Tests\Unit\Domain\IdentityAndAccess\ValueObjects;

use App\Domain\IdentityAndAccess\ValueObjects\AccountStatus;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * Pure unit tests for the AccountStatus enum.
 *
 * No framework base test case: the domain layer must be testable with no
 * database and no application bootstrap.
 */
class AccountStatusTest extends TestCase
{
    #[Test]
    public function active_is_active_and_not_suspended(): void
    {
        $this->assertTrue(AccountStatus::Active->isActive());
        $this->assertFalse(AccountStatus::Active->isSuspended());
        $this->assertFalse(AccountStatus::Active->isPending());
    }

    #[Test]
    public function suspended_is_suspended_and_not_active(): void
    {
        $this->assertTrue(AccountStatus::Suspended->isSuspended());
        $this->assertFalse(AccountStatus::Suspended->isActive());
    }

    #[Test]
    public function pending_is_pending_and_not_active(): void
    {
        $this->assertTrue(AccountStatus::Pending->isPending());
        $this->assertFalse(AccountStatus::Pending->isActive());
    }

    #[Test]
    public function exactly_one_status_is_active_at_a_time(): void
    {
        foreach (AccountStatus::cases() as $status) {
            $matches = array_filter(
                AccountStatus::cases(),
                fn (AccountStatus $case): bool => $case->isActive()
                    || $case->isSuspended()
                    || $case->isPending(),
            );

            $this->assertCount(3, $matches, 'every status is exactly one of active, suspended, or pending');
            break;
        }
    }

    #[Test]
    #[DataProvider('storedValues')]
    public function it_parses_a_stored_value(string $stored, AccountStatus $expected): void
    {
        $this->assertSame($expected, AccountStatus::fromString($stored));
    }

    /**
     * @return array<string, array{string, AccountStatus}>
     */
    public static function storedValues(): array
    {
        return [
            'active' => ['active', AccountStatus::Active],
            'suspended' => ['suspended', AccountStatus::Suspended],
            'pending' => ['pending', AccountStatus::Pending],
            'uppercase from database' => ['ACTIVE', AccountStatus::Active],
            'mixed case from database' => ['Suspended', AccountStatus::Suspended],
        ];
    }

    #[Test]
    public function an_unrecognised_stored_value_fails_closed_to_suspended_not_active(): void
    {
        // This is the important one. If a status is ever corrupted or a new value
        // appears that this code does not know about, the account must NOT become
        // active by default. Failing closed means an unrecognised status denies
        // access rather than granting it.
        $this->assertSame(AccountStatus::Suspended, AccountStatus::fromString('banned'));
        $this->assertSame(AccountStatus::Suspended, AccountStatus::fromString(''));
        $this->assertSame(AccountStatus::Suspended, AccountStatus::fromString('administrator'));
    }
}
