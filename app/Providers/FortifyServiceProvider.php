<?php

namespace App\Providers;

use App\Actions\Fortify\GuardAwareLoginRateLimiter;
use App\Actions\Fortify\ResetUserPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Laravel\Fortify\Actions\AttemptToAuthenticate;
use Laravel\Fortify\Actions\CanonicalizeUsername;
use Laravel\Fortify\Actions\EnsureLoginIsNotThrottled;
use Laravel\Fortify\Actions\PrepareAuthenticatedSession;
use Laravel\Fortify\Contracts\ResetsUserPasswords;
use Laravel\Fortify\Features;
use Laravel\Fortify\Fortify;

class FortifyServiceProvider extends ServiceProvider
{
    /**
     * The guards that need Fortify authentication.
     */
    private const GUARDS = ['users', 'workers', 'admins', 'super_admins'];

    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Bind per-guard rate limiters as singletons
        foreach (self::GUARDS as $guard) {
            $this->app->singleton("fortify.limiter.{$guard}", function () use ($guard) {
                return new GuardAwareLoginRateLimiter(
                    app('cache')->store(),
                    $guard
                );
            });
        }

        // Bind per-guard actions
        foreach (self::GUARDS as $guard) {
            // AttemptToAuthenticate with the specific guard and its limiter
            $this->app->bind("fortify.actions.{$guard}.attempt", function ($app) use ($guard) {
                return new AttemptToAuthenticate(
                    Auth::guard($guard),
                    $app->make("fortify.limiter.{$guard}")
                );
            });

            // EnsureLoginIsNotThrottled with the specific guard's limiter
            $this->app->bind("fortify.actions.{$guard}.throttle", function ($app) use ($guard) {
                return new EnsureLoginIsNotThrottled($app->make("fortify.limiter.{$guard}"));
            });

            // CanonicalizeUsername is stateless, can be shared
            $this->app->bind("fortify.actions.{$guard}.canonicalize", CanonicalizeUsername::class);

            // PrepareAuthenticatedSession with the specific guard's limiter
            $this->app->bind("fortify.actions.{$guard}.prepare", function ($app) use ($guard) {
                return new PrepareAuthenticatedSession($app->make("fortify.limiter.{$guard}"));
            });
        }

        // Bind password reset contracts per model (we'll implement later)
        // For now, bind the users one as default
        $this->app->singleton(ResetsUserPasswords::class.'.users', ResetUserPassword::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // IMPORTANT: Call ignoreRoutes() BEFORE any parent::boot() or feature configuration
        Fortify::ignoreRoutes();

        // Configure features - ONLY resetPasswords enabled
        Fortify::features([
            Features::resetPasswords(),
        ]);

        // Configure views to false (we're API only)
        config(['fortify.views' => false]);

        // Configure rate limiters for each guard
        foreach (self::GUARDS as $guard) {
            RateLimiter::for("login.{$guard}", function (Request $request) use ($guard) {
                $limiter = app("fortify.limiter.{$guard}");
                $throttleKey = $limiter->throttleKey($request);

                return Limit::perMinute(5)->by($throttleKey);
            });
        }

        // Configure password reset
        Fortify::resetUserPasswordsUsing(fn () => app(ResetsUserPasswords::class.'.users'));
    }
}
