<?php

namespace Tests\Feature\Concerns;

use App\Models\Admin;
use App\Models\SuperAdmin;
use App\Models\User;
use App\Models\Worker;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Mail\Transport\ArrayTransport;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Symfony\Component\Mailer\SentMessage;

/**
 * The four password-reset doors, and how a test gets hold of a reset link.
 *
 * Shared by the three files that cover password reset, because the four doors
 * are one list and a list written out three times is a list that will be wrong
 * in one of them. The credentials-and-doors map is deliberately the same shape
 * `CredentialStoresDoNotLeakTest` keeps, so the two files can be read side by
 * side: the sign-in file proves a credential belongs to one store, and this one
 * proves a *reset* does too.
 *
 * How the link is obtained matters, so it is spelled out here once.
 *
 * The suite runs on the `array` mail transport (phpunit.xml pins MAIL_MAILER to
 * it, as does the framework's own default testing configuration), which keeps
 * every rendered message in memory instead of sending it. Nothing is faked
 * about the notification: the real `ResetPassword` notification is built, its
 * real button URL is generated, and the rendered message is what the test
 * reads the token out of. `Notification::fake()` would have been the shorter
 * route to the token, and it would have thrown away exactly the part worth
 * demonstrating — that a link can be built at all, and that it is addressed to
 * the right application.
 */
trait InteractsWithPasswordResets
{
    /**
     * An address held by nobody, for the "reveals nothing" comparisons.
     */
    private const STRANGER = 'nobody-at-all@example.com';

    /**
     * The four doors, written out.
     *
     * @return array<string, array{
     *     signIn: string,
     *     forgot: string,
     *     reset: string,
     *     abilities: list<string>,
     *     create: callable(array<string, mixed>): Model
     * }>
     */
    private function doors(): array
    {
        return [
            'users' => [
                'signIn' => '/api/v1/identity/users/sign-in',
                'forgot' => '/api/v1/identity/users/forgot-password',
                'reset' => '/api/v1/identity/users/reset-password',
                'abilities' => ['users:*'],
                'create' => fn (array $attributes): Model => User::factory()->create($attributes),
            ],
            'workers' => [
                'signIn' => '/api/v1/identity/workers/sign-in',
                'forgot' => '/api/v1/identity/workers/forgot-password',
                'reset' => '/api/v1/identity/workers/reset-password',
                'abilities' => ['workers:*'],
                'create' => fn (array $attributes): Model => Worker::factory()->create($attributes),
            ],
            'admins' => [
                'signIn' => '/api/v1/identity/admins/sign-in',
                'forgot' => '/api/v1/identity/admins/forgot-password',
                'reset' => '/api/v1/identity/admins/reset-password',
                'abilities' => ['admins:*'],
                'create' => fn (array $attributes): Model => Admin::factory()->create($attributes),
            ],
            'super_admins' => [
                'signIn' => '/api/v1/identity/super-admins/sign-in',
                'forgot' => '/api/v1/identity/super-admins/forgot-password',
                'reset' => '/api/v1/identity/super-admins/reset-password',
                'abilities' => ['*'],
                'create' => fn (array $attributes): Model => SuperAdmin::factory()->create($attributes),
            ],
        ];
    }

    /**
     * The four account types, in door order.
     *
     * @return list<string>
     */
    private function owners(): array
    {
        return array_keys($this->doors());
    }

    /**
     * Create a record in one of the four stores.
     *
     * @param  array<string, mixed>  $attributes
     */
    private function createAccount(string $owner, array $attributes): Model
    {
        return ($this->doors()[$owner]['create'])($attributes);
    }

    /**
     * The Eloquent model behind one of the four stores.
     *
     * @return class-string<Model>
     */
    private function modelFor(string $owner): string
    {
        return match ($owner) {
            'users' => User::class,
            'workers' => Worker::class,
            'admins' => Admin::class,
            'super_admins' => SuperAdmin::class,
        };
    }

    /**
     * The plaintext password belonging to one store, so that a password is as
     * identifying of a store as an address is.
     */
    private function plainPasswordFor(string $owner): string
    {
        return 'password-of-'.$owner;
    }

    /**
     * That password, hashed at the configured cost.
     */
    private function passwordFor(string $owner): string
    {
        return Hash::make($this->plainPasswordFor($owner));
    }

    /**
     * Ask one of the four doors for a reset link.
     */
    private function requestResetLink(string $owner, string $email): TestResponse
    {
        return $this->postJson($this->doors()[$owner]['forgot'], ['email' => $email]);
    }

    /**
     * Try to redeem a link at one of the four doors.
     *
     * @param  array<string, string>  $payload
     */
    private function completeReset(string $owner, array $payload): TestResponse
    {
        return $this->postJson($this->doors()[$owner]['reset'], $payload);
    }

    /**
     * Sign in at one of the four sign-in doors.
     */
    private function signInAt(string $owner, string $email, string $password): TestResponse
    {
        return $this->postJson($this->doors()[$owner]['signIn'], [
            'email' => $email,
            'password' => $password,
        ]);
    }

    /**
     * Request a link and return the token that was mailed, with the address it
     * was mailed to.
     *
     * @return array{token: string, email: string, body: string}
     */
    private function requestResetLinkAndReadIt(string $owner, string $email): array
    {
        $before = $this->sentMessages()->count();

        $response = $this->requestResetLink($owner, $email);
        $response->assertStatus(202);

        $messages = $this->sentMessages()->slice($before);

        $this->assertCount(
            1,
            $messages,
            "Requesting a link for {$email} at the {$owner} door must send exactly one message.",
        );

        $body = quoted_printable_decode($messages->last()->getOriginalMessage()->toString());

        $this->assertSame(
            1,
            preg_match('/\?token=([^&"\s]+)&email=([^&"\s]+)/', $body, $matches),
            "The message sent for {$email} must carry a reset link carrying the token and the address.",
        );

        return [
            'token' => urldecode($matches[1]),
            'email' => urldecode($matches[2]),
            'body' => $body,
        ];
    }

    /**
     * Every message the array transport is holding.
     *
     * @return Collection<int, SentMessage>
     */
    private function sentMessages(): Collection
    {
        $transport = Mail::mailer()->getSymfonyTransport();

        $this->assertInstanceOf(
            ArrayTransport::class,
            $transport,
            'These tests read the reset link out of the rendered message, so the array transport is not optional.',
        );

        return $transport->messages();
    }

    /**
     * Empty every throttle bucket, for every address.
     *
     * `RateLimiter::clear()` takes the throttle *key* rather than a limiter's
     * name, so it is `Cache::flush()` that actually empties them. These files
     * make far more attempts at one address than a person would, and a 429
     * arriving partway through would be compared against a reset refusal as
     * though the two were the same thing.
     */
    private function forgetThrottle(): void
    {
        Cache::flush();
    }

    /**
     * Step past the broker's own per-address window, so the next request really
     * does mint a new link.
     *
     * The broker refuses to issue a second link for an address it mailed one to
     * within the last `throttle` seconds, and that is a feature — it is what
     * stops one address being used to flood an inbox. It is not the limiter
     * `forgetThrottle()` empties: that one is per route, this one is a row in a
     * token table. So a test that needs a *fresh* link for the same address has
     * to move the clock, which is what a person waiting does. A test that wants
     * the refusal — as `PasswordResetTest` does, to prove a second request
     * reveals nothing — must not call this.
     */
    private function travelPastTheLinkThrottle(): void
    {
        $this->travel(max(1, (int) config('auth.passwords.users.throttle')) + 1)->seconds();
    }
}
