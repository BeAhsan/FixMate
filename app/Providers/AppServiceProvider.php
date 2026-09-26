<?php

namespace App\Providers;

use App\Domain\IdentityAndAccess\Repositories\EndUserRepository;
use App\Domain\IdentityAndAccess\Repositories\WorkerRepository;
use App\Domain\IdentityAndAccess\Services\AuthenticationService;
use App\Infrastructure\IdentityAndAccess\Repositories\EloquentEndUserRepository;
use App\Infrastructure\IdentityAndAccess\Repositories\EloquentWorkerRepository;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
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
        // Configure rate limiters for Fortify (per-guard)
        // These are configured in FortifyServiceProvider::boot() now
        // but we keep this here for any other rate limiting needs
    }
}
