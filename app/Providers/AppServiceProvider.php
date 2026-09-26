<?php

namespace App\Providers;

use App\Domain\IdentityAndAccess\Repositories\EndUserRepository;
use App\Domain\IdentityAndAccess\Repositories\WorkerRepository;
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
