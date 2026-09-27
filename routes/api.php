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
use App\Http\Controllers\Auth\AdminPasswordResetController;
use App\Http\Controllers\Auth\SuperAdminLoginController;
use App\Http\Controllers\Auth\SuperAdminPasswordResetController;
use App\Http\Controllers\Auth\UserLoginController;
use App\Http\Controllers\Auth\UserPasswordResetController;
use App\Http\Controllers\Auth\WorkerLoginController;
use App\Http\Controllers\Auth\WorkerPasswordResetController;
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

        // Password reset, one pair of doors per application.
        //
        // Each pair belongs to the store its sign-in door belongs to, and the
        // controller states that in a single line, because it is the only thing
        // that decides which account a reset changes. The address in the body
        // never does: a person may hold an account in several stores under one
        // address, so "which account is this reset for" is answered by the route
        // and by nothing else.
        //
        // Reset-link requests are throttled separately from sign-in, and
        // separately per account type, for the reasons
        // AppServiceProvider::configurePasswordResetRateLimiters() gives. The
        // pair shares one limiter, so flooding one store's reset endpoint does
        // not lock the same address out of requesting a link in another.
        Route::post('/users/forgot-password', [UserPasswordResetController::class, 'requestLink'])
            ->middleware('throttle:'.AppServiceProvider::PASSWORD_RESET_LIMITERS['users'])
            ->name('users.forgot-password');

        Route::post('/users/reset-password', [UserPasswordResetController::class, 'complete'])
            ->name('users.reset-password');

        Route::post('/workers/forgot-password', [WorkerPasswordResetController::class, 'requestLink'])
            ->middleware('throttle:'.AppServiceProvider::PASSWORD_RESET_LIMITERS['workers'])
            ->name('workers.forgot-password');

        Route::post('/workers/reset-password', [WorkerPasswordResetController::class, 'complete'])
            ->name('workers.reset-password');

        Route::post('/admins/forgot-password', [AdminPasswordResetController::class, 'requestLink'])
            ->middleware('throttle:'.AppServiceProvider::PASSWORD_RESET_LIMITERS['admins'])
            ->name('admins.forgot-password');

        Route::post('/admins/reset-password', [AdminPasswordResetController::class, 'complete'])
            ->name('admins.reset-password');

        Route::post('/super-admins/forgot-password', [SuperAdminPasswordResetController::class, 'requestLink'])
            ->middleware('throttle:'.AppServiceProvider::PASSWORD_RESET_LIMITERS['super_admins'])
            ->name('super-admins.forgot-password');

        Route::post('/super-admins/reset-password', [SuperAdminPasswordResetController::class, 'complete'])
            ->name('super-admins.reset-password');
    });
