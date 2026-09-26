<?php

namespace App\Providers;

use App\Domain\IdentityAndAccess\Repositories\EndUserRepository;
use App\Domain\IdentityAndAccess\Repositories\WorkerRepository;
use App\Domain\IdentityAndAccess\Services\AuthenticationService;
use App\Infrastructure\IdentityAndAccess\Repositories\EloquentEndUserRepository;
use App\Infrastructure\IdentityAndAccess\Repositories\EloquentWorkerRepository;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    /**
     * The account types, and the sign-in route each one is reached through.
     *
     * This is the single place the mapping from account type to limiter name
     * lives, so adding a fifth account type is one entry here plus its route and
     * its own controller rather than a search for every rate-limiter reference.
     *
     * @var array<string, string>
     */
    public const LOGIN_LIMITERS = [
        'users' => 'login.users',
        'workers' => 'login.workers',
        'admins' => 'login.admins',
        'super_admins' => 'login.super-admins',
    ];

    /**
     * Fallbacks for the sign-in rate limit, used only if the configuration is
     * missing. The configured values in config/auth.php are the real ones.
     */
    private const LOGIN_MAX_ATTEMPTS = 5;

    private const LOGIN_DECAY_MINUTES = 1;

    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Bind domain repository interfaces to Eloquent implementations
        $this->app->bind(EndUserRepository::class, EloquentEndUserRepository::class);
        $this->app->bind(WorkerRepository::class, EloquentWorkerRepository::class);

        // The domain service needs the application's bcrypt cost so that its
        // decoy hash is as expensive to compute as a real one. Reading it here
        // rather than hardcoding it inside the domain is what keeps the two in
        // step: change the cost and the equaliser follows it.
        $this->app->bind(AuthenticationService::class, fn (): AuthenticationService => new AuthenticationService(
            (int) config('hashing.bcrypt.rounds', 12),
        ));
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureLoginRateLimiters();
    }

    /**
     * Give each account type its own sign-in rate-limit bucket.
     *
     * The four sign-in endpoints are four separate doors into four separate
     * credential stores, and they are limited separately on purpose. A single
     * shared bucket would mean an attacker trips one door and locks every
     * account type out at the same time - a person who cannot sign in as a
     * customer because someone else was guessing at the worker door.
     *
     * The separation comes from the limiter *name*: Laravel stores the counter
     * under that name, so four names are four independent counters. It is worth
     * stating because the obvious implementation - one limiter keyed on email
     * and IP - would be wrong here, and would look correct.
     */
    private function configureLoginRateLimiters(): void
    {
        $maxAttempts = (int) config('auth.login_max_attempts', self::LOGIN_MAX_ATTEMPTS);
        $decayMinutes = max(1, (int) config('auth.login_decay_minutes', self::LOGIN_DECAY_MINUTES));

        foreach (self::LOGIN_LIMITERS as $limiter) {
            RateLimiter::for($limiter, function (Request $request) use ($maxAttempts, $decayMinutes): Limit {
                return Limit::perMinute($maxAttempts, $decayMinutes)
                    ->by($this->loginThrottleKey($request))
                    ->response($this->throttledResponse(...));
            });
        }
    }

    /**
     * The response a throttled sign-in gets.
     *
     * This is the one refusal on the API that a person receives through no
     * fault of their own - they mistyped a password, or someone else is guessing
     * at their address - so it is the one refusal that owes them something
     * useful. Laravel's default is "Too Many Attempts.", which says what
     * happened but not when they can try again, so they either give up or keep
     * returning and stay refused. In debug it also carries a full stack trace,
     * which hands an attacker a map of the deployment; the shape here is
     * declared, so the response does not change shape with the environment.
     *
     * The wait is read from the headers the middleware computed, so the message
     * cannot drift from the behaviour it describes.
     */
    private function throttledResponse(Request $request, array $headers): JsonResponse
    {
        $seconds = (int) ($headers['Retry-After'] ?? 0);

        return response()->json([
            'message' => 'Too many sign-in attempts. Please wait '
                .$this->humaniseWait($seconds).' before trying again.',
            'retry_after' => $seconds,
        ], 429, $headers);
    }

    /**
     * The wait in words, because a bare number is not something a person can act
     * on. Rounded to whole minutes above a minute, since "47 seconds" is false
     * precision from a counter that only refreshes on the next attempt.
     */
    private function humaniseWait(int $seconds): string
    {
        if ($seconds < 60) {
            return $seconds.' second'.($seconds === 1 ? '' : 's');
        }

        $minutes = (int) ceil($seconds / 60);

        return $minutes.' minute'.($minutes === 1 ? '' : 's');
    }

    /**
     * The key a failed sign-in attempt is counted against.
     *
     * Address plus IP, so that guessing many addresses from one connection is
     * limited, and so that repeatedly guessing one address from many connections
     * is limited too. Normalised to lower case because the sign-in path is
     * case-insensitive: without this, `Person@Example.com` and
     * `person@example.com` would each get their own allowance, and a case
     * variation would be a way around the limit.
     */
    private function loginThrottleKey(Request $request): string
    {
        $email = $request->input('email');

        return Str::transliterate(Str::lower(is_string($email) ? $email : '')).'|'.$request->ip();
    }
}
