<?php

namespace App\Providers;

use App\Domain\IdentityAndAccess\Repositories\AdminRepository;
use App\Domain\IdentityAndAccess\Repositories\EndUserRepository;
use App\Domain\IdentityAndAccess\Repositories\SuperAdminRepository;
use App\Domain\IdentityAndAccess\Repositories\WorkerRepository;
use App\Domain\IdentityAndAccess\Services\AuthenticationService;
use App\Infrastructure\IdentityAndAccess\Repositories\EloquentAdminRepository;
use App\Infrastructure\IdentityAndAccess\Repositories\EloquentEndUserRepository;
use App\Infrastructure\IdentityAndAccess\Repositories\EloquentSuperAdminRepository;
use App\Infrastructure\IdentityAndAccess\Repositories\EloquentWorkerRepository;
use App\Infrastructure\IdentityAndAccess\SessionTokenIssuer;
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
     * The account types, and the reset-link limiter each one is reached through.
     *
     * A reset-link request is throttled for the same reasons a sign-in is, and
     * with the same separation: the two endpoints in each application are doors
     * into one store, and counting them in one bucket would mean a flood at one
     * of them stops the person using the other. The broker also throttles per
     * address underneath this; the two are not alternatives, and the one here is
     * the one that keeps four stores from sharing a count.
     *
     * @var array<string, string>
     */
    public const PASSWORD_RESET_LIMITERS = [
        'users' => 'password-reset.users',
        'workers' => 'password-reset.workers',
        'admins' => 'password-reset.admins',
        'super_admins' => 'password-reset.super-admins',
    ];

    /**
     * Fallbacks for the sign-in rate limit, used only if the configuration is
     * missing. The configured values in config/auth.php are the real ones.
     */
    private const LOGIN_MAX_ATTEMPTS = 5;

    private const LOGIN_DECAY_MINUTES = 1;

    /**
     * Fallbacks for the reset-link rate limit, used only if the configuration is
     * missing. The configured values in config/password-reset.php are the real
     * ones.
     */
    private const PASSWORD_RESET_MAX_ATTEMPTS = 5;

    private const PASSWORD_RESET_DECAY_MINUTES = 1;

    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Bind domain repository interfaces to Eloquent implementations.
        //
        // One binding per credential store, and no implementation mentions
        // another store's model. That is what makes "checked against the admins
        // table only" a property of the wiring rather than a promise in a
        // comment, and it is why these four live together: adding a fifth
        // account type is two more lines here and nowhere else.
        $this->app->bind(EndUserRepository::class, EloquentEndUserRepository::class);
        $this->app->bind(WorkerRepository::class, EloquentWorkerRepository::class);
        $this->app->bind(AdminRepository::class, EloquentAdminRepository::class);
        $this->app->bind(SuperAdminRepository::class, EloquentSuperAdminRepository::class);

        // The domain service needs the application's bcrypt cost so that its
        // decoy hash is as expensive to compute as a real one. Reading it here
        // rather than hardcoding it inside the domain is what keeps the two in
        // step: change the cost and the equaliser follows it.
        $this->app->bind(AuthenticationService::class, fn (): AuthenticationService => new AuthenticationService(
            (int) config('hashing.bcrypt.rounds', 12),
        ));

        // The two token lifetimes are read from configuration here, once. The
        // issuer is the only thing that should know how long a token lives, and
        // this is the one place allowed to know that the answer is configurable.
        $this->app->singleton(SessionTokenIssuer::class, fn (): SessionTokenIssuer => new SessionTokenIssuer(
            accessLifetimeMinutes: (int) config('sanctum.access_lifetime_minutes'),
            renewalLifetimeMinutes: (int) config('sanctum.renewal_lifetime_minutes'),
        ));
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureLoginRateLimiters();
        $this->configurePasswordResetRateLimiters();
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
                    ->by($this->throttleKey($request))
                    ->response(function (Request $request, array $headers): JsonResponse {
                        return $this->throttledResponse(
                            $request,
                            $headers,
                            'Too many sign-in attempts. Please wait '
                                .$this->humaniseWait((int) ($headers['Retry-After'] ?? 0)).' before trying again.',
                        );
                    });
            });
        }
    }

    /**
     * Give each account type its own reset-link rate-limit bucket.
     *
     * The same separation as sign-in, for the same reason, and one extra: a
     * shared bucket across the four would let a flood aimed at one store
     * exhaust the allowance of the person whose own account is in another, and
     * the address is often the same in both. The broker's own per-address
     * throttle sits underneath this one and does a different job — it stops one
     * address being mailed repeatedly — so neither replaces the other.
     */
    private function configurePasswordResetRateLimiters(): void
    {
        $maxAttempts = (int) config('password-reset.max_attempts', self::PASSWORD_RESET_MAX_ATTEMPTS);
        $decayMinutes = max(1, (int) config('password-reset.decay_minutes', self::PASSWORD_RESET_DECAY_MINUTES));

        foreach (self::PASSWORD_RESET_LIMITERS as $limiter) {
            RateLimiter::for($limiter, function (Request $request) use ($maxAttempts, $decayMinutes): Limit {
                return Limit::perMinute($maxAttempts, $decayMinutes)
                    ->by($this->throttleKey($request))
                    ->response(fn (Request $request, array $headers): JsonResponse => $this->throttledResponse(
                        $request,
                        $headers,
                        'Too many password reset requests. Please wait '
                            .$this->humaniseWait((int) ($headers['Retry-After'] ?? 0)).' before trying again.',
                    ));
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
     * cannot drift from the behaviour it describes. The wording is passed in
     * rather than fixed because the reset endpoints have their own version, and
     * being told to wait after mistyping a password and being told to wait
     * after asking for six reset emails are different situations.
     */
    private function throttledResponse(Request $request, array $headers, string $message): JsonResponse
    {
        $seconds = (int) ($headers['Retry-After'] ?? 0);

        return response()->json([
            'message' => $message,
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
     * The key a throttled attempt is counted against, for both the sign-in and
     * the reset-link doors.
     *
     * Address plus IP, so that guessing many addresses from one connection is
     * limited, and so that repeatedly guessing one address from many connections
     * is limited too. Normalised to lower case because the credential paths are
     * case-insensitive: without this, `Person@Example.com` and
     * `person@example.com` would each get their own allowance, and a case
     * variation would be a way around the limit.
     */
    private function throttleKey(Request $request): string
    {
        $email = $request->input('email');

        return Str::transliterate(Str::lower(is_string($email) ? $email : '')).'|'.$request->ip();
    }
}
