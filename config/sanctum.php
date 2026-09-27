<?php

use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Laravel\Sanctum\Http\Middleware\AuthenticateSession;

/*
|--------------------------------------------------------------------------
| Token lifetimes
|--------------------------------------------------------------------------
|
| Two credentials, two lifetimes, and the reason they differ is the whole
| design.
|
| The ACCESS token is held in memory and never written to browser storage, so
| injected script cannot read it. That is only worth anything if it is short:
| a token nobody can read is still a token that outlives the decision which
| issued it, and a revocation cannot reach a browser that already holds one.
| So it expires in minutes, and the application renews it before it does.
|
| The RENEWAL token is the opposite trade, and it is a real one. It has to
| survive a page reload, which means it has to be in browser storage, which
| means injected script CAN read it. It is therefore worth as little as
| possible: it can only mint a new access token, it is rotated on every single
| use so a stolen copy is good once, and it expires quickly whether or not it
| is used. When a domain name exists it becomes an httpOnly cookie instead and
| this lifetime can be lengthened; until then, short is the honest answer.
|
| `expiration` below is deliberately left null. It is Sanctum's global setting
| and it would apply to renewal tokens too, capping them at the access token's
| lifetime and making renewal impossible. The two lifetimes are therefore set
| per token, on the `expires_at` column, which Sanctum checks regardless.
|
*/

return [

    /*
    |--------------------------------------------------------------------------
    | Access token lifetime
    |--------------------------------------------------------------------------
    |
    | Minutes. Long enough that an active person is not interrupted, short
    | enough that a token read out of memory by a crash dump or a shoulder
    | surfer is close to useless.
    |
    */

    'access_lifetime_minutes' => (int) env('SESSION_ACCESS_LIFETIME', 15),

    /*
    |--------------------------------------------------------------------------
    | Renewal token lifetime
    |--------------------------------------------------------------------------
    |
    | Minutes, and deliberately several times the access token's. A renewal
    | token that expired as fast as the access token it replaces would mean
    | signing in again every few minutes, which is what makes people choose to
    | remember longer passwords than they should.
    |
    | This is a hard ceiling, not an idle timeout: the token dies on schedule
    | whether it was used or not. Rotation means a used token is spent
    | immediately, so "used recently" and "still valid" are different things
    | and the second cannot be extended by holding on to the first.
    |
    */

    'renewal_lifetime_minutes' => (int) env('SESSION_RENEWAL_LIFETIME', 1440),

    /*
    |--------------------------------------------------------------------------
    | Sanctum
    |--------------------------------------------------------------------------
    |
    | The rest of Sanctum's own configuration, unchanged from its defaults.
    | Written out because the file now exists, and a partial config would
    | silently fall back to the framework's for every key it omits.
    |
    */

    'expiration' => null,

    'token_prefix' => env('SANCTUM_TOKEN_PREFIX', ''),

    'middleware' => [
        'authenticate_session' => AuthenticateSession::class,
        'encrypt_cookies' => EncryptCookies::class,
        'validate_csrf_token' => ValidateCsrfToken::class,
    ],

    'guard' => ['web'],

];
