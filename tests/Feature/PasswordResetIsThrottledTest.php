<?php

namespace Tests\Feature;

use App\Providers\AppServiceProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\Concerns\InteractsWithPasswordResets;
use Tests\TestCase;

/**
 * Reset-link requests are throttled, and throttled per account type.
 *
 * The same two properties as sign-in, for the same two reasons. A reset endpoint
 * that is not throttled is a way to flood somebody else's inbox, and the second
 * reason is the one the four stores make sharper: one shared bucket would mean
 * an attacker can lock a person out of recovering an account in one store by
 * hammering the reset endpoint of another — the person who most needs the flow
 * is the one who most needs it to be there.
 *
 * Every test is run once per door, because a limiter that is registered for
 * three of the four and forgotten for the fourth is the failure mode, and it is
 * invisible until somebody looks.
 */
class PasswordResetIsThrottledTest extends TestCase
{
    use InteractsWithPasswordResets;
    use RefreshDatabase;

    /**
     * One case per account type.
     *
     * @return array<string, array{string}>
     */
    public static function doorProvider(): array
    {
        return [
            'users' => ['users'],
            'workers' => ['workers'],
            'admins' => ['admins'],
            'super admins' => ['super_admins'],
        ];
    }

    protected function setUp(): void
    {
        parent::setUp();

        $this->forgetThrottle();

        // The broker holds every reset-link call inside a timebox, so that a
        // request for an address it does not hold takes as long as one it does
        // and cannot be told apart by a stopwatch. At its production setting of
        // 200ms that is 200ms on each of the eighty-odd requests this file
        // makes, which is nearly half a minute spent proving that four counters
        // increment.
        //
        // So the timebox is shortened here, and only here: the claims in this
        // file are about counting and about which bucket a request lands in, and
        // neither depends on the duration. It is still a timebox, so a request
        // that skipped the lookup for an unknown address would still answer in
        // less time than one that did not — the equalisation these tests are
        // not making is not switched off, it is just cheaper. The tests that
        // *are* about the shape of a reset response run at the real setting.
        config(['auth.timebox_duration' => 1_000]);
    }

    /**
     * Repeated requests at one door are eventually refused by the limiter rather
     * than going on mailing links.
     *
     * The allowance is spent at this door, and each request before it is refused
     * still answers 202 — including the ones the broker's own per-address window
     * declines to mail, because the acknowledgement is deliberately the same
     * either way. Asserting 202 for those is not incidental: it is the reason
     * the limiter above them is the only thing that says "enough".
     */
    #[DataProvider('doorProvider')]
    public function test_repeated_reset_requests_are_eventually_throttled(string $owner): void
    {
        $maxAttempts = (int) config('password-reset.max_attempts', 5);

        for ($attempt = 0; $attempt < $maxAttempts; $attempt++) {
            $this->requestResetLink($owner, 'someone@example.com')->assertStatus(202);
        }

        $throttled = $this->requestResetLink($owner, 'someone@example.com');

        $throttled->assertStatus(429);
        $this->assertNotEmpty(
            $throttled->json('details.retry_after'),
            'A throttled reset request must say when it can be tried again.',
        );
        $this->assertStringContainsString(
            'password reset',
            (string) $throttled->json('message'),
            'A throttled reset must not be reported as a throttled sign-in.',
        );
    }

    /**
     * Exhausting one door's allowance leaves the other three answering for the
     * same address.
     *
     * The same address on purpose: exhausting some other address would fill a
     * different bucket, and this would pass even with a single shared bucket
     * across all four doors. Every ordered pair is walked, because a bucket that
     * is shared between two of the four and not the others would be caught by
     * one pair and missed by another.
     */
    #[DataProvider('doorProvider')]
    public function test_exhausting_one_door_does_not_refuse_the_others_for_the_same_address(string $owner): void
    {
        $maxAttempts = (int) config('password-reset.max_attempts', 5);

        foreach ($this->owners() as $other) {
            if ($other === $owner) {
                continue;
            }

            $this->forgetThrottle();

            for ($attempt = 0; $attempt <= $maxAttempts; $attempt++) {
                $this->requestResetLink($owner, 'someone@example.com');
            }

            // The positive control, without which the assertion below would also
            // be what a door that never throttles at all would return.
            $this->requestResetLink($owner, 'someone@example.com')->assertStatus(429);

            $this->assertSame(
                202,
                $this->requestResetLink($other, 'someone@example.com')->status(),
                "Exhausting the {$owner} reset door must not refuse the same address at the {$other} door.",
            );
        }
    }

    /**
     * A throttled reset door does not spend the sign-in allowance at the same
     * door.
     *
     * The two are different limits for different purposes — one stops an inbox
     * being flooded, the other stops passwords being guessed — and they are
     * counted separately on purpose. A shared bucket would let anybody who wanted
     * to stop a person signing in exhaust the reset allowance instead, which
     * would be a denial of service dressed up as a protection.
     */
    #[DataProvider('doorProvider')]
    public function test_a_reset_does_not_consume_the_sign_in_allowance(string $owner): void
    {
        $maxAttempts = (int) config('password-reset.max_attempts', 5);

        for ($attempt = 0; $attempt <= $maxAttempts; $attempt++) {
            $this->requestResetLink($owner, 'someone@example.com');
        }

        $this->requestResetLink($owner, 'someone@example.com')->assertStatus(429);

        $signIn = $this->signInAt($owner, 'someone@example.com', 'the-wrong-password');

        $signIn->assertUnprocessable();
    }

    /**
     * The four reset doors name four different limiters.
     *
     * Written as an inventory rather than derived from the constant, for the
     * reason `AuthenticationSurfaceTest` gives: a list generated from the code
     * would report whatever the code happens to say, which is the opposite of
     * what a check like this is for. The count is asserted too, so a fifth door
     * added without a limiter of its own fails here instead of joining whichever
     * bucket it happened to name.
     */
    public function test_each_reset_door_names_its_own_limiter(): void
    {
        $limiters = [];

        foreach (Route::getRoutes()->getRoutes() as $route) {
            if (! str_ends_with($route->uri(), '/forgot-password')) {
                continue;
            }

            foreach ($route->gatherMiddleware() as $middleware) {
                if (str_starts_with($middleware, 'throttle:')) {
                    $limiters[$route->uri()] = substr($middleware, strlen('throttle:'));
                }
            }
        }

        ksort($limiters);

        $this->assertSame([
            'api/v1/identity/admins/forgot-password' => AppServiceProvider::PASSWORD_RESET_LIMITERS['admins'],
            'api/v1/identity/super-admins/forgot-password' => AppServiceProvider::PASSWORD_RESET_LIMITERS['super_admins'],
            'api/v1/identity/users/forgot-password' => AppServiceProvider::PASSWORD_RESET_LIMITERS['users'],
            'api/v1/identity/workers/forgot-password' => AppServiceProvider::PASSWORD_RESET_LIMITERS['workers'],
        ], $limiters);

        $this->assertCount(
            4,
            array_unique(array_values($limiters)),
            'The four reset doors must not share a bucket, or exhausting one store refuses the other three.',
        );
    }
}
