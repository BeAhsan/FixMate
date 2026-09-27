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

use App\Http\Controllers\AdministratorRecordController;
use App\Http\Controllers\Auth\AdminLoginController;
use App\Http\Controllers\Auth\AdminPasswordResetController;
use App\Http\Controllers\Auth\SuperAdminLoginController;
use App\Http\Controllers\Auth\SuperAdminPasswordResetController;
use App\Http\Controllers\Auth\UserLoginController;
use App\Http\Controllers\Auth\UserPasswordResetController;
use App\Http\Controllers\Auth\WorkerLoginController;
use App\Http\Controllers\Auth\WorkerPasswordResetController;
use App\Http\Controllers\CurrentAccountController;
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

        // Who am I, one route per application.
        //
        // Four routes rather than one shared route, and the repetition is the
        // design: the store an endpoint belongs to is the thing that decides
        // which account type may call it, and a single route could only discover
        // that from the token, which would mean the caller naming the
        // application they believe they are in. A route per application makes the
        // application part of the URL — the administrator application calls the
        // administrators' URL — so the refusal cannot be talked round by a client
        // that has been handed the wrong token.
        //
        // `auth:sanctum` is who you are and `authorised` is what you may do, and
        // both are named on every route rather than applied to a group: the
        // ability differs per application, and a group could only express the one
        // they all share, which is none. Order matters and is the declaration
        // order: an unauthenticated request is answered before the store is
        // looked at, so there is nothing to compare and nothing to disclose.
        //
        // The super administrator route requires the wildcard its token carries,
        // and requires nothing else. That is what makes it the most powerful
        // account type in the platform rather than the one with the most
        // abilities listed on a page: the ability list for it is a single name,
        // and any route that names an ability it does not hold is unreachable.
        Route::get('/users/me', CurrentAccountController::class)
            ->middleware(['auth:sanctum', 'authorised:store=users,ability=users:*'])
            ->name('users.me');

        Route::get('/workers/me', CurrentAccountController::class)
            ->middleware(['auth:sanctum', 'authorised:store=workers,ability=workers:*'])
            ->name('workers.me');

        Route::get('/admins/me', CurrentAccountController::class)
            ->middleware(['auth:sanctum', 'authorised:store=admins,ability=admins:*'])
            ->name('admins.me');

        Route::get('/super-admins/me', CurrentAccountController::class)
            ->middleware(['auth:sanctum', 'authorised:store=super_admins,ability=*'])
            ->name('super-admins.me');

        // Reading another record by identifier, twice over.
        //
        // The administrator application's own route, where the only record a
        // token may read is its owner's. The identifier is in the URL because a
        // person navigating their own application has one, and because the
        // endpoint that *cannot* be navigated and can only be called directly is
        // the one worth having: a nonexistent id and another administrator's id
        // are answered identically, so the route cannot be walked to discover
        // which identifiers exist.
        //
        // `whereNumber` keeps zero and the negatives out, because `UserId`
        // refuses them and they are not identifiers anybody holds. It is a
        // constraint on what a caller may say rather than a rule about who they
        // are, so it discloses nothing.
        Route::get('/admins/{admin}', AdministratorRecordController::class)
            ->whereNumber('admin')
            ->middleware(['auth:sanctum', 'authorised:store=admins,ability=admins:*'])
            ->name('admins.record');

        // The same read, reached across the store boundary, and guarded by the
        // ability that crosses it. Two routes rather than one with a conditional
        // because the two are different facts about the caller: an administrator
        // is entitled to its own record as a matter of course, and to anybody
        // else's only by holding `accounts:read`. One route would have to decide
        // between those answers from a parameter, and a parameter is something the
        // caller chooses.
        Route::get('/super-admins/admins/{admin}', AdministratorRecordController::class)
            ->whereNumber('admin')
            ->middleware(['auth:sanctum', 'authorised:store=super_admins,ability=accounts:read'])
            ->name('super-admins.admins.record');
    });
