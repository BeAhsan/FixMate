<?php

namespace Tests\Unit\Domain\IdentityAndAccess\ValueObjects;

use App\Domain\IdentityAndAccess\ValueObjects\Email;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * Pure unit tests for the Email value object.
 *
 * These deliberately do NOT extend the framework's base test case. The domain
 * layer must be testable with no framework, no database, and no application
 * bootstrap — that is the property this file exists to prove.
 */
class EmailTest extends TestCase
{
    #[Test]
    public function it_normalises_an_address_to_lowercase(): void
    {
        $this->assertSame('person@example.com', Email::from('Person@Example.COM')->value);
    }

    #[Test]
    public function two_addresses_differing_only_in_case_are_the_same_address(): void
    {
        $this->assertTrue(Email::from('Person@Example.com')->equals(Email::from('PERSON@EXAMPLE.COM')));
    }

    #[Test]
    public function a_different_address_is_not_equal(): void
    {
        $this->assertFalse(Email::from('one@example.com')->equals(Email::from('two@example.com')));
    }

    #[Test]
    #[DataProvider('invalidAddresses')]
    public function it_rejects_an_invalid_address(string $invalid): void
    {
        $this->expectException(InvalidArgumentException::class);

        Email::from($invalid);
    }

    /**
     * @return array<string, array{string}>
     */
    public static function invalidAddresses(): array
    {
        return [
            'empty' => [''],
            'no at sign' => ['not-an-address'],
            'no domain' => ['person@'],
            'no local part' => ['@example.com'],
            'spaces inside' => ['two words@example.com'],
            'no dot in domain' => ['person@example'],
        ];
    }

    #[Test]
    public function it_rejects_an_invalid_address_passed_straight_to_the_constructor(): void
    {
        $this->expectException(InvalidArgumentException::class);

        new Email('not-an-address');
    }

    #[Test]
    public function it_casts_to_string_for_use_in_messages(): void
    {
        $this->assertSame('person@example.com', (string) Email::from('Person@Example.com'));
    }
}
