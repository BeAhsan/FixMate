<?php

/*
|--------------------------------------------------------------------------
| API routes
|--------------------------------------------------------------------------
|
| The back end is a JSON API and nothing else, so every route the application
| serves is declared here. bootstrap/app.php mounts this file under the "api"
| prefix with the "api" middleware group, and the exception handler renders
| JSON for every request, so a route added here cannot accidentally return an
| HTML page.
|
| Each bounded context brings its own route group, middleware and throttle;
| the Identity and Access context is the first.
|
*/

use App\Http\Controllers\Auth\AdminLoginController;
use App\Http\Controllers\Auth\SuperAdminLoginController;
use App\Http\Controllers\Auth\UserLoginController;
use App\Http\Controllers\Auth\WorkerLoginController;
use App\Providers\AppServiceProvider;

// Identity and Access context routes
Route::prefix('v1/identity')
    ->middleware(['api'])
    ->group(function () {
        // End user sign-in (users guard).
        //
        // Throttled against the users bucket. Each sign-in route names a
        // different limiter, so the four doors are limited independently: an
        // attacker exhausting one does not lock the same address out of the
        // other three. See AppServiceProvider::configureLoginRateLimiters().
        Route::post('/users/sign-in', UserLoginController::class)
            ->middleware('throttle:'.AppServiceProvider::LOGIN_LIMITERS['users'])
            ->name('users.signin');

        // Worker sign-in (workers guard) - the worker application calls this,
        // and it resolves credentials against the workers table only.
        Route::post('/workers/sign-in', WorkerLoginController::class)
            ->middleware('throttle:'.AppServiceProvider::LOGIN_LIMITERS['workers'])
            ->name('workers.signin');

        // Administrator sign-in (admins guard) - the administrator application
        // calls this, and it resolves credentials against the admins table only.
        Route::post('/admins/sign-in', AdminLoginController::class)
            ->middleware('throttle:'.AppServiceProvider::LOGIN_LIMITERS['admins'])
            ->name('admins.signin');

        // Super administrator sign-in (super_admins guard) - a separate door, not
        // the administrator door with a wider key. It resolves credentials
        // against the super_admins table only, and it is the only path in the
        // platform that issues the wildcard ability.
        Route::post('/super-admins/sign-in', SuperAdminLoginController::class)
            ->middleware('throttle:'.AppServiceProvider::LOGIN_LIMITERS['super_admins'])
            ->name('super-admins.signin');
    });
