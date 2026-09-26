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
| No routes are declared yet. Each bounded context brings its own route group,
| middleware and throttle; the Identity and Access context is the first.
|
*/

use App\Http\Controllers\Auth\UserLoginController;

// Identity and Access context routes
Route::prefix('v1/identity')
    ->middleware(['api'])
    ->group(function () {
        // End user sign-in (users guard)
        Route::post('/users/sign-in', UserLoginController::class)
            ->name('users.signin');
    });
