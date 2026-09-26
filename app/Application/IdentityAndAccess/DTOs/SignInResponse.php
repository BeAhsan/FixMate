<?php

namespace App\Application\IdentityAndAccess\DTOs;

use App\Domain\IdentityAndAccess\ValueObjects\UserId;

/**
 * Data Transfer Object for sign-in response.
 * Contains the token and user data - plain PHP object.
 */
readonly class SignInResponse
{
    public function __construct(
        public string $token,
        public UserId $userId,
        public string $name,
        public string $email,
        public array $abilities,
    ) {}

    public function toArray(): array
    {
        return [
            'token' => $this->token,
            'user' => [
                'id' => $this->userId->value,
                'name' => $this->name,
                'email' => $this->email,
            ],
            'abilities' => $this->abilities,
        ];
    }
}
