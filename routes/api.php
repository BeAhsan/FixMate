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

use App\Domain\IdentityAndAccess\ValueObjects\Ability;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;
use App\Http\Controllers\Accounts\ShowAdminController;
use App\Http\Controllers\Auth\AdminLoginController;
use App\Http\Controllers\Auth\AdminPasswordResetController;
use App\Http\Controllers\Auth\CurrentAccountController;
use App\Http\Controllers\Auth\RenewSessionController;
use App\Http\Controllers\Auth\SignOutController;
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

        // The authenticated surface.
        //
        // Everything above this line is reachable without a token, because a
        // person has to be able to sign in before they have one. Everything below
        // requires a bearer token AND is guarded by `account.can`, which checks
        // both the account type the route belongs to and, where one is named, an
        // ability on the token. That second check is the reason the user
        // interface is allowed to hide navigation: a caller who ignores the
        // interface entirely is refused by the same rule.
        //
        // `auth:sanctum` resolves the token's owner. It is named explicitly
        // because the application's default guard is the session-based `users`
        // guard, which is not what an API token should be resolved by — and a
        // forgotten `auth:` would otherwise read the session cookie instead,
        // which is a different credential arriving at a bearer-token API.
        Route::middleware('auth:sanctum')->group(function () {
            // Who am I, one door per application.
            //
            // Four routes rather than one shared `/me`, because the four
            // applications each have their own address and each calls its own
            // door. A token presented at the wrong one is refused by the
            // account-type half of `account.can`, which is what makes "an end
            // user is refused entry to the worker application" a property of a
            // real request. The account type is written here from the enum rather
            // than as a literal, so renaming a case cannot leave a route
            // guarding against an account type that no longer exists.
            Route::get('/users/me', CurrentAccountController::class)
                ->middleware('account.can:'.AccountType::User->value)
                ->name('users.me');

            Route::get('/workers/me', CurrentAccountController::class)
                ->middleware('account.can:'.AccountType::Worker->value)
                ->name('workers.me');

            Route::get('/admins/me', CurrentAccountController::class)
                ->middleware('account.can:'.AccountType::Admin->value)
                ->name('admins.me');

            Route::get('/super-admins/me', CurrentAccountController::class)
                ->middleware('account.can:'.AccountType::SuperAdmin->value)
                ->name('super-admins.me');

            // Renew the session, and sign out of it.
            //
            // Four doors each, for the same reason the four `me` doors above
            // exist: each application calls its own, and a token presented at
            // the wrong one is refused. Renewal is the one route a renewal
            // token may call, and `session.can` is the only middleware that
            // will let one through - `account.can`, which every other route
            // uses, refuses it precisely because it is a credential that lives
            // in browser storage.
            //
            // Sign-out is guarded by `auth:sanctum` alone. It deliberately does
            // not take `account.can`, because that would refuse a renewal token
            // - and an expired access token is the normal reason for signing
            // out, so refusing the renewal token would leave a working one in
            // storage that signs the person straight back in. Revoking tokens
            // can only affect the account presenting them, so there is nothing
            // for a guard to protect on this route.
            foreach ([
                'users' => AccountType::User,
                'workers' => AccountType::Worker,
                'admins' => AccountType::Admin,
                'super-admins' => AccountType::SuperAdmin,
            ] as $segment => $type) {
                Route::post("/{$segment}/session/renew", RenewSessionController::class)
                    ->middleware('session.can:'.$type->value)
                    ->name("{$segment}.session.renew");

                Route::post("/{$segment}/sign-out", SignOutController::class)
                    ->name("{$segment}.sign-out");
            }

            // The account-management surface: a super administrator only.
            //
            // Both halves are named, and each refuses a different caller for a
            // different reason. The ability is what refuses an administrator —
            // they are the right kind of account and the function is simply not
            // theirs — and the account type is what refuses everybody else. An
            // end user, a worker, and an administrator all get the same 403 here,
            // and they get it whether or not the identifier in the path exists.
            Route::get('/admins/{admin}', ShowAdminController::class)
                ->middleware('account.can:'.AccountType::SuperAdmin->value.','.Ability::ACCOUNTS_READ)
                // Positive integers only, which is the same rule `UserId`
                // enforces. Constrained here so that `/admins/abc` and
                // `/admins/0` are a 404 rather than a type error surfacing as a
                // 500 — an unhandled error on a route that takes an identifier
                // is exactly what this ticket exists to prevent, and it would be
                // the first thing an attacker typed.
                ->where('admin', '[1-9][0-9]*')
                ->name('admins.show');
        });
    });
