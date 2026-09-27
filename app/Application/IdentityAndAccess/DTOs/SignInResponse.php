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
        /**
         * Whether this account must replace its password before doing anything.
         *
         * Reported at sign-in so a front end can route to the change screen rather
         * than to a dashboard that will refuse every request. It is *advisory*: the
         * refusal lives in `EnsurePasswordChanged`, and a client that ignores this
         * field gets a 403 on its first call rather than a working session. That
         * split is deliberate — a flag the client honours and nothing else enforces
         * is a suggestion, and a flag nothing reads is not.
         *
         * Defaults to false so the three sign-in use cases that have no flag to
         * report cannot forget to pass one. Every account that chose its own
         * password through a reset is in that position.
         */
        public bool $mustChangePassword = false,
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
            // At the top level, beside `token` and `abilities`, rather than inside
            // the account block. It is a property of the *session* the caller now
            // holds, not another fact about the person: it says what this
            // credential is allowed to do next, which is the same kind of thing as
            // the abilities beside it.
            'must_change_password' => $this->mustChangePassword,
        ];
    }
}
