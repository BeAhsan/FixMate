<?php

namespace Tests\Unit\Domain\IdentityAndAccess\ValueObjects;

use App\Domain\IdentityAndAccess\ValueObjects\Ability;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * The ability model, tested as domain rules with no framework.
 *
 * The property that matters is the separation: an administrator must not hold
 * anything a super administrator holds, because the super administrator role is
 * meant to stay narrow. Everything else here is in service of asserting that,
 * because it is a fact about four string lists and nothing enforces it at
 * runtime — a token with the wrong ability is a perfectly valid token that does
 * the wrong thing.
 */
class AccountTypeAbilitiesTest extends TestCase
{
    #[Test]
    #[DataProvider('everyAccountType')]
    public function it_grants_its_own_ability(AccountType $type): void
    {
        $this->assertTrue(
            $type->may($type->abilities(), "{$type->value}:*"),
            "{$type->value} should hold its own ability"
        );
    }

    /**
     * @return array<string, array{AccountType}>
     */
    public static function everyAccountType(): array
    {
        return [
            'user' => [AccountType::User],
            'worker' => [AccountType::Worker],
            'admin' => [AccountType::Admin],
            'super admin' => [AccountType::SuperAdmin],
        ];
    }

    #[Test]
    public function only_a_super_administrator_holds_the_wildcard(): void
    {
        $holders = array_values(array_filter(
            AccountType::all(),
            fn (AccountType $type): bool => in_array(Ability::WILDCARD, $type->abilities(), true),
        ));

        $this->assertSame(
            [AccountType::SuperAdmin],
            $holders,
            'the wildcard must be held by exactly one account type, or the narrowest account type is not narrow'
        );
    }

    #[Test]
    public function no_account_type_below_super_administrator_holds_a_super_administrators_ability(): void
    {
        foreach (AccountType::all() as $type) {
            if ($type === AccountType::SuperAdmin) {
                continue;
            }

            foreach (Ability::superAdministratorOnly() as $ability) {
                $this->assertFalse(
                    $type->may($type->abilities(), $ability),
                    "{$type->value} must not hold [{$ability}]"
                );
            }
        }
    }

    #[Test]
    public function the_wildcard_covers_every_super_administrator_ability(): void
    {
        // The three names exist for middleware to require. If the wildcard did
        // not actually grant them, a super administrator would be refused their
        // own endpoints — a failure that would look like an authorisation bug
        // rather than a mismatch between the vocabulary and the grant.
        foreach (Ability::superAdministratorOnly() as $ability) {
            $this->assertTrue(
                AccountType::SuperAdmin->may(AccountType::SuperAdmin->abilities(), $ability),
                "the wildcard must cover [{$ability}]"
            );
        }
    }

    #[Test]
    public function an_account_type_holds_nothing_outside_its_own_namespace(): void
    {
        foreach ([AccountType::User, AccountType::Worker, AccountType::Admin] as $type) {
            foreach ($type->abilities() as $granted) {
                $this->assertStringStartsWith(
                    $type->value.':',
                    $granted,
                    "{$type->value} granted [{$granted}], which is outside its own namespace"
                );
            }
        }
    }

    #[Test]
    public function an_empty_ability_list_grants_nothing(): void
    {
        // A token with no abilities is valid and useless. Worth pinning because
        // the alternative — treating an absent ability as permitted — is the
        // failure this whole ticket exists to prevent.
        $this->assertFalse(AccountType::Admin->may([], Ability::ACCOUNTS_SUSPEND));
        $this->assertFalse(AccountType::SuperAdmin->may([], Ability::ACCOUNTS_SUSPEND));
        $this->assertFalse(AccountType::Admin->may([], 'admins:*'));
    }

    #[Test]
    public function an_ability_of_another_namespace_is_not_granted(): void
    {
        // A worker token presented to an administrative endpoint. The check is
        // by exact name, so `workers:*` says nothing about `admins:*`.
        $this->assertFalse(AccountType::Worker->may(AccountType::Worker->abilities(), 'admins:*'));
        $this->assertFalse(AccountType::User->may(AccountType::User->abilities(), 'workers:*'));
    }
}
