<?php

namespace App\Application\IdentityAndAccess\DTOs;

use App\Domain\IdentityAndAccess\ValueObjects\Email;

/**
 * Data Transfer Object for sign-in request.
 * Plain PHP object with no framework dependencies.
 */
readonly class SignInRequest
{
    public function __construct(
        public Email $email,
        public string $password,
    ) {}

    public static function fromArray(array $data): self
    {
        return new self(
            email: Email::from($data['email']),
            password: $data['password'],
        );
    }
}
