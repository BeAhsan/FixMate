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
use App\Http\Controllers\Accounts\IndexAccountsController;
use App\Http\Controllers\Accounts\PromoteAdminController;
use App\Http\Controllers\Accounts\ShowAdminController;
use App\Http\Controllers\Accounts\SuspendAdminController;
use App\Http\Controllers\Auth\AdminLoginController;
use App\Http\Controllers\Auth\AdminPasswordResetController;
use App\Http\Controllers\Auth\ChangePasswordController;
use App\Http\Controllers\Auth\CurrentAccountController;
use App\Http\Controllers\Auth\RenewSessionController;
use App\Http\Controllers\Auth\SignOutController;
use App\Http\Controllers\Auth\SuperAdminLoginController;
use App\Http\Controllers\Auth\SuperAdminPasswordResetController;
use App\Http\Controllers\Auth\UserLoginController;
use App\Http\Controllers\Auth\UserPasswordResetController;
use App\Http\Controllers\Auth\WorkerLoginController;
use App\Http\Controllers\Auth\WorkerPasswordResetController;
use App\Http\Controllers\Catalog\IndexProductsController;
use App\Http\Middleware\EnsurePasswordChanged;
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
        Route::middleware(['auth:sanctum', EnsurePasswordChanged::ALIAS])->group(function () {
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
                // Renewal is exempt, and used not to be. See the block comment
                // below the loop, which is the long version; the short version is
                // that an access token bought by a renewal is still refused by this
                // guard on every route except the two exempt ones, so renewing buys
                // no reach - it only keeps the person from being thrown back to the
                // sign-in screen by a page reload in the middle of choosing a
                // password. The response now reports `must_change_password`, so the
                // front end can put them back where they were.
                Route::post("/{$segment}/session/renew", RenewSessionController::class)
                    ->middleware('session.can:'.$type->value)
                    ->withoutMiddleware(EnsurePasswordChanged::ALIAS)
                    ->name("{$segment}.session.renew");

                // `withoutMiddleware` rather than a path check inside the guard, so the
                // exemption is visible on the route and cannot be forgotten when a
                // route is added.
                //
                // Sign-out is exempt because refusing it would be a trap. A person on
                // a shared device who must change their password is *most* entitled to
                // end the session, and signing out revokes their own tokens - a
                // strictly larger reduction in their access than the guard could
                // produce.
                Route::post("/{$segment}/sign-out", SignOutController::class)
                    ->withoutMiddleware(EnsurePasswordChanged::ALIAS)
                    ->name("{$segment}.sign-out");
            }

            // Three routes are exempt from `EnsurePasswordChanged`: the change
            // itself, sign-out, and renewal. The first two always were and their
            // reasons are on the routes. Renewal is the one that changed, and the
            // change is worth being precise about, because the obvious argument
            // against it is strong and wrong.
            //
            // The argument against: a renewal token lives in browser storage, where
            // injected script can read it, and if it can keep buying access tokens
            // then "you must change your password" is undone by standing still.
            //
            // Why that does not follow: **the access token it buys is refused by this
            // very guard.** `EnsurePasswordChanged` sits on the group, and the only
            // two routes out of it are the change and sign-out. A renewal therefore
            // mints a token that can reach nothing - not `me`, not the catalogue, not
            // another account's records. It cannot undo the rule, because the rule is
            // enforced on the token's *use* and not on the token's existence.
            // Refusing renewal bought no security; it bought a page reload in the
            // middle of choosing a password.
            //
            // And that was not hypothetical. Renewal is how a session survives a
            // reload, because the access token is in memory only. The sequence was:
            // sign in, be routed to the change screen, start choosing a password,
            // refresh or lose the connection, renewal refused with a 403, session
            // dropped, and the sign-in screen says "your account cannot be used at
            // the moment, please contact an administrator" - which is false, and
            // sends a person with a working account to an administrator for a
            // password they can change themselves. Story 21 is about a shared
            // password never being in use; it is not about the person being unable
            // to reach the form that fixes it.
            //
            // What makes this safe rather than merely defensible is that the renewal
            // response reports `must_change_password`, so a front end restoring a
            // session from storage learns the account is still flagged and routes
            // back to the change screen. Before, the only honest thing a front end
            // could have done with that 403 was parse the message - which this
            // repository forbids elsewhere, for exactly the reason it should be
            // forbidden here. A field the back end sends beats a sentence a client
            // reverse-engineers.
            //
            // The test that pinned the old behaviour was
            // `test_renewal_is_refused_too_which_is_the_whole_point`. It now
            // asserts the opposite in a form that would catch a regression: the
            // renewal succeeds, AND the access token it mints is still refused
            // everywhere else. The second half was the point all along.

            // Replace the signed-in account's password.
            //
            // Four doors for the same reason the four `me` doors and the four
            // sign-out doors exist: each application calls its own, and a token
            // presented at the wrong one is refused.
            //
            // `account.can` with the account type and **no ability**, which is
            // deliberate and not an omission. Changing your own password is not a
            // privilege - it is the one thing every signed-in account may do - so
            // there is no ability to name, and inventing one would put a token claim
            // in front of a self-service action.
            //
            // Four doors rather than one `/{type}/password/change`, and the reason is
            // not tidiness. **Laravel does not substitute route parameters inside a
            // middleware string**: `account.can:{type}` passes the literal text
            // `{type}` through, which is not an account type, so the guard aborted
            // with a 500 on the first call. Writing the type into the path *and* the
            // guard as two literals means they cannot drift apart, and it matches the
            // four `me` doors and the four sign-out doors above.
            //
            // Exempt from its own guard, or the account could not reach the only
            // route that would help it.
            foreach ([
                'users' => AccountType::User,
                'workers' => AccountType::Worker,
                'admins' => AccountType::Admin,
                'super-admins' => AccountType::SuperAdmin,
            ] as $segment => $type) {
                Route::post("/{$segment}/password/change", ChangePasswordController::class)
                    ->middleware('account.can:'.$type->value)
                    ->withoutMiddleware(EnsurePasswordChanged::ALIAS)
                    ->name("{$segment}.password.change");
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

            // The directory: every account of every type, in one list.
            //
            // `accounts:read` rather than the wildcard, so the route states what it
            // needs and a future account type with a narrower set is a one-word
            // change. The account type is stated too, and it is the half that
            // refuses an end user, a worker and an administrator alike: they are
            // all the wrong kind of account, and they all get the same 403.
            Route::get('/accounts', IndexAccountsController::class)
                ->middleware('account.can:'.AccountType::SuperAdmin->value.','.Ability::ACCOUNTS_READ)
                ->name('accounts.index');

            // Suspend, and promote. Two abilities rather than one, because they are
            // two different powers: withdrawing access is something almost any
            // system needs an administrator to be able to do, while handing out the
            // most powerful account type is not. Sharing an ability would mean
            // granting one granted the other, and there would be no way back.
            //
            // POST, not PATCH, and no request body: neither operation takes
            // parameters beyond the identifier, and a body would be a place for a
            // caller to put a status of their own choosing. The only question is
            // whether, and the path already answers it.
            Route::post('/admins/{admin}/suspend', SuspendAdminController::class)
                ->middleware('account.can:'.AccountType::SuperAdmin->value.','.Ability::ACCOUNTS_SUSPEND)
                ->where('admin', '[1-9][0-9]*')
                ->name('admins.suspend');

            Route::post('/admins/{admin}/promote', PromoteAdminController::class)
                ->middleware('account.can:'.AccountType::SuperAdmin->value.','.Ability::ACCOUNTS_PROMOTE)
                ->where('admin', '[1-9][0-9]*')
                ->name('admins.promote');
        });
    });

// Catalog context routes
//
// The catalogue is public, so this group is the only one in the file that
// deliberately names no `auth:sanctum` and no `account.can`. That absence is the
// contract, not an oversight: the front end is coded against an unauthenticated
// `GET /api/products`, and adding a guard here would turn every catalogue request
// into a 401. Keep it stated here and in IndexProductsController.
//
// No `v1/` prefix, unlike the Identity group above, because the path is fixed by
// that contract. AGENTS.md notes the prefix belongs to "whichever ticket adds the
// first real route group", and this is that group - so the decision is recorded
// on ZAL-9 rather than made silently here. Adding `/v1` to a path a front end
// has already been written against is a breaking change, and doing it after the
// first release is a migration. Worth deciding on its own ticket, not as a
// side-effect of shipping a catalogue.
Route::middleware(['api'])->group(function () {
    Route::get('/products', IndexProductsController::class)
        ->name('products.index');
});
