<?php

namespace App\Providers;

use App\Domain\IdentityAndAccess\Repositories\AdminRepository;
use App\Domain\IdentityAndAccess\Repositories\SuperAdminRepository;
use App\Infrastructure\IdentityAndAccess\Repositories\EloquentAdminRepository;
use App\Infrastructure\IdentityAndAccess\Repositories\EloquentSuperAdminRepository;
use Illuminate\Support\ServiceProvider;

/**
 * Binds the two staff repositories to their Eloquent implementations.
 *
 * The end user and worker bindings live in AppServiceProvider, and the obvious
 * place for these two is beside them. They are in their own provider because
 * AppServiceProvider is being edited concurrently by another ticket and a
 * two-line merge conflict is not worth the risk of losing either change.
 * Folding these four bindings into one register() is a one-line follow-up once
 * that is not true, and nothing depends on which provider performs the binding:
 * both are registered before the routes resolve anything.
 */
class StaffIdentityServiceProvider extends ServiceProvider
{
    /**
     * Bind each domain staff repository to its Eloquent implementation.
     *
     * One binding per store, and neither implementation mentions the other
     * model. That is what makes "checked against the admins table only" a
     * property of the wiring rather than a promise in a comment.
     */
    public function register(): void
    {
        $this->app->bind(AdminRepository::class, EloquentAdminRepository::class);
        $this->app->bind(SuperAdminRepository::class, EloquentSuperAdminRepository::class);
    }
}
