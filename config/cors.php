<?php

/*
|--------------------------------------------------------------------------
| Cross-origin resource sharing
|--------------------------------------------------------------------------
|
| The back end is a JSON API and the four applications are browsers, so every
| request from an application is cross-origin. Without this the browser refuses
| to hand the response to the page, and the failure looks like a network error
| rather than a policy one.
|
| The allowed origins come from config/applications.php, which is the one place
| that names all four addresses. They are listed as origins and never as
| patterns: a wildcard would let any site on the internet call this API with a
| token, and a host pattern is a guess about a name that does not exist yet.
|
*/

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here is where you may define your CORS configuration. Just keep in mind
    | that CORS is a browser security mechanism — you only need to configure
    | it for the routes that the browser will send cross-origin requests to.
    |
    */

    'paths' => ['api/*'],

    'allowed_methods' => ['*'],

    /*
    | Every address from config/applications.php, flattened. Computed rather
    | than written out so that an application cannot be added to the four and
    | forgotten here — a front end that is not in this list works for everyone
    | except the person using it, and the symptom is a browser console message
    | naming the API rather than a failed deployment.
    */
    'allowed_origins' => array_values(array_map(
        fn (array $application): string => $application['origin'],
        config('applications'),
    )),

    /*
    | Origins are matched exactly, so there is nothing for a pattern to do.
    | Laravel's `supports_origin_patterns` stays false, and turning it on would
    | silently start treating these origins as patterns.
    */
    'allowed_origin_patterns' => [],

    /*
    | The access token is a bearer token sent in a header, and the client
    | wrapper sends `credentials: 'omit'` on every request. So cookies are
    | neither required nor wanted: allowing them would let a browser attach a
    | session to a cross-origin call, which is the one ambient credential this
    | API is built not to accept. The renewal token that will eventually be an
    | httpOnly cookie is a later ticket, and it is the reason this line has a
    | comment rather than being simply false.
    */
    'supports_credentials' => false,

    'max_age' => 0,

    'exposed_headers' => [],

    'headers' => [
        'Accept',
        'Authorization',
        'Content-Type',
        'X-Requested-With',
    ],

];
