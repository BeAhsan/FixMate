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

        $this->assertCount(2, $routes, 'expected the two sign-in routes built so far');

        $middlewares = $routes->map(fn ($route) => collect($route->gatherMiddleware())
            ->first(fn ($m) => str_starts_with($m, 'throttle:')));

        $this->assertCount(2, $middlewares->filter()->unique(), 'each sign-in route must name a different limiter');
    }
}
