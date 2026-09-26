<?php

namespace App\Application\IdentityAndAccess\DTOs;

use App\Domain\IdentityAndAccess\ValueObjects\UserId;

/**
 * Data Transfer Object for sign-in response.
 * Contains the token and user data - plain PHP object.
 */
readonly class SignInResponse
{
    /**
     * @param  string  $subject  The key the signed-in account is returned under -
     *                           "user" for an end user, "worker" for a worker, and so
     *                           on. Each application reads its own key.
     */
    public function __construct(
        public string $token,
        public UserId $userId,
        public string $name,
        public string $email,
        public array $abilities,
        private string $subject = 'user',
    ) {}

    public function toArray(): array
    {
        return [
            'token' => $this->token,
            $this->subject => [
                'id' => $this->userId->value,
                'name' => $this->name,
                'email' => $this->email,
            ],
            'abilities' => $this->abilities,
        ];
    }
}
