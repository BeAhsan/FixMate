<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Worker;
use App\Providers\AppServiceProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Sign-in rate limiting.
 *
 * The property under test is not "sign-in is throttled" - it is that the four
 * sign-in endpoints are throttled *separately*. A single shared bucket would
 * mean an attacker guessing at one door locks a person out of all four, which
 * is a denial of service the throttling is supposed to be preventing rather
 * than causing.
 */
class SignInIsThrottledTest extends TestCase
{
    use RefreshDatabase;

    private const USER_SIGN_IN = '/api/v1/identity/users/sign-in';

    private const WORKER_SIGN_IN = '/api/v1/identity/workers/sign-in';

    protected function setUp(): void
    {
        parent::setUp();

        // The limiter counts failed attempts, so a test that signs in
        // successfully must not be charged for it. Each test starts from a
        // known-empty bucket rather than inheriting the previous test's count.
        RateLimiter::clear('login.users');
        RateLimiter::clear('login.workers');
    }

    private function failedUserAttempt(): TestResponse
    {
        return $this->postJson(self::USER_SIGN_IN, [
            'email' => 'nobody@example.com',
            'password' => 'wrong-password',
        ]);
    }

    public function test_repeated_failures_are_eventually_throttled(): void
    {
        $maxAttempts = (int) config('auth.login_max_attempts', 5);

        for ($i = 0; $i < $maxAttempts; $i++) {
            $this->failedUserAttempt()->assertUnprocessable();
        }

        // The next attempt is over the limit, so it is refused with 429 rather
        // than being treated as another ordinary credential failure.
        $this->failedUserAttempt()->assertStatus(429);
    }

    public function test_exhausting_one_door_does_not_lock_the_same_address_out_of_another(): void
    {
        User::factory()->create([
            'email' => 'shared@example.com',
            'password' => bcrypt('customerpass'),
        ]);

        $maxAttempts = (int) config('auth.login_max_attempts', 5);

        // The exhausting attempts use the *same* address the worker attempt
        // will use. The throttle key is address+IP, so exhausting on some other
        // address would fill a different bucket and this test would pass even
        // with one shared limiter across all four doors.
        for ($i = 0; $i < $maxAttempts; $i++) {
            $this->postJson(self::USER_SIGN_IN, [
                'email' => 'shared@example.com',
                'password' => 'wrong-password',
            ])->assertUnprocessable();
        }

        $this->postJson(self::USER_SIGN_IN, [
            'email' => 'shared@example.com',
            'password' => 'wrong-password',
        ])->assertStatus(429);

        // The same address is still able to try the worker door. This is the
        // assertion that fails with one shared bucket, and it is the reason the
        // limiters are per account type rather than global. A 422 here means the
        // worker attempt was evaluated normally; a 429 would mean exhausting the
        // customer door had locked the worker door too.
        $response = $this->postJson(self::WORKER_SIGN_IN, [
            'email' => 'shared@example.com',
            'password' => 'customerpass',
        ]);

        $response->assertStatus(422);
        $this->assertNotSame(429, $response->getStatusCode());
    }

    public function test_a_case_varied_address_does_not_get_a_fresh_allowance(): void
    {
        $maxAttempts = (int) config('auth.login_max_attempts', 5);

        for ($i = 0; $i < $maxAttempts; $i++) {
            $this->postJson(self::USER_SIGN_IN, [
                'email' => 'Person@Example.com',
                'password' => 'wrong-password',
            ])->assertUnprocessable();
        }

        // Sign-in is case-insensitive, so the lower-cased address must land in
        // the same bucket. Without normalisation this would be a way around the
        // limit: alternate the case of the same address for a fresh allowance
        // on every attempt.
        $this->postJson(self::USER_SIGN_IN, [
            'email' => 'PERSON@example.COM',
            'password' => 'wrong-password',
        ])->assertStatus(429);
    }

    public function test_a_successful_sign_in_is_not_throttled(): void
    {
        User::factory()->create([
            'email' => 'real@example.com',
            'password' => bcrypt('correct-password'),
        ]);

        for ($i = 0; $i < 3; $i++) {
            $this->postJson(self::USER_SIGN_IN, [
                'email' => 'real@example.com',
                'password' => 'correct-password',
            ])->assertOk();
        }
    }

    public function test_one_person_being_throttled_does_not_lock_out_another(): void
    {
        User::factory()->create(['email' => 'noisy@example.com', 'password' => bcrypt('pw-noisy')]);
        User::factory()->create(['email' => 'quiet@example.com', 'password' => bcrypt('pw-quiet')]);

        $maxAttempts = (int) config('auth.login_max_attempts', 5);
        for ($i = 0; $i < $maxAttempts + 1; $i++) {
            $this->postJson(self::USER_SIGN_IN, [
                'email' => 'noisy@example.com',
                'password' => 'wrong-password',
            ]);
        }

        // Somebody hammering one address must not cost an unrelated person the
        // ability to sign in. This is the denial-of-service case: the throttle
        // exists to slow guessing, and a shared bucket would let one attacker
        // lock out every customer on the platform.
        $this->postJson(self::USER_SIGN_IN, [
            'email' => 'quiet@example.com',
            'password' => 'pw-quiet',
        ])->assertOk();
    }

    public function test_the_throttle_response_tells_the_person_how_long_to_wait(): void
    {
        $maxAttempts = (int) config('auth.login_max_attempts', 5);
        for ($i = 0; $i < $maxAttempts + 1; $i++) {
            $this->failedUserAttempt();
        }

        $response = $this->failedUserAttempt();

        $response->assertStatus(429);

        // A person who is refused through no fault of their own is owed
        // something better than "Too Many Attempts." They cannot act on that:
        // it does not say when to come back, so they either give up or keep
        // trying and stay refused. Laravel's default also carries a stack trace
        // in debug and a bare string otherwise, so it is rendered explicitly.
        $body = $response->json();

        $this->assertArrayHasKey('retry_after', $body, 'the response must state when to retry');
        $this->assertIsInt($body['retry_after']);
        $this->assertGreaterThan(0, $body['retry_after']);

        $this->assertMatchesRegularExpression(
            '/wait/i',
            $body['message'],
            'the message must say the person has to wait, not merely that attempts were too many'
        );

        // The stated wait and the actual hold must agree, or the message is a lie
        // the person acts on.
        $this->assertSame(
            (string) $body['retry_after'],
            (string) $response->headers->get('Retry-After'),
            'the body and the Retry-After header must state the same wait'
        );
    }

    public function test_the_throttle_response_carries_no_stack_trace(): void
    {
        $maxAttempts = (int) config('auth.login_max_attempts', 5);
        for ($i = 0; $i < $maxAttempts + 1; $i++) {
            $this->failedUserAttempt();
        }

        $body = $this->failedUserAttempt()->json();

        // Every other refusal on this API is a clean, declared shape. A throttle
        // that leaks file paths and a call stack is a different contract by
        // accident, and an attacker gets a map of the deployment from it.
        $this->assertSame(['message', 'retry_after'], array_keys($body));
        $this->assertArrayNotHasKey('trace', $body);
        $this->assertArrayNotHasKey('file', $body);
        $this->assertArrayNotHasKey('line', $body);
    }

    public function test_every_account_type_has_its_own_limiter_registered(): void
    {
        // Four account types are specified; all four must have a limiter, or a
        // sign-in route added later would reference a limiter that does not
        // exist and fail at request time rather than at boot.
        foreach (AppServiceProvider::LOGIN_LIMITERS as $limiter) {
            $this->assertNotNull(
                RateLimiter::limiter($limiter),
                "no rate limiter is registered for [{$limiter}]"
            );
        }
    }

    public function test_each_sign_in_route_names_its_own_limiter(): void
    {
        $routes = collect(app('router')->getRoutes()->getRoutes())
            ->filter(fn ($route) => str_ends_with($route->uri(), 'sign-in'));

        // Matched against the number of account types rather than a literal, so
        // a fifth account type does not make this fail for the wrong reason. The
        // count still has to be equal, so a route added without a limiter, or a
        // limiter added without a route, is still caught.
        $accountTypes = count(AppServiceProvider::LOGIN_LIMITERS);

        $this->assertCount($accountTypes, $routes, 'every account type must have exactly one sign-in route');

        $middlewares = $routes->map(fn ($route) => collect($route->gatherMiddleware())
            ->first(fn ($m) => str_starts_with($m, 'throttle:')));

        $this->assertCount(
            $accountTypes,
            $middlewares->filter()->unique(),
            'each sign-in route must name a different limiter, or two doors share one bucket'
        );
    }
}
