<?php

/*
|--------------------------------------------------------------------------
| The four front-end applications
|--------------------------------------------------------------------------
|
| One place that names all four applications: the account type each one signs
| in as, and the address it is served from.
|
| The addresses are here rather than in a list inside config/cors.php because
| they are needed in more than one place, and because they change together.
| Acquiring a domain name later is an edit to this file plus the reverse
| proxy's virtual hosts — no image, no compose file, and no application code.
|
| Each address may be overridden per deployment by an environment variable of
| the same name, so a private network and a public one differ without a code
| change. The default is the address used in local development.
|
| Addresses are written as origins — scheme, host and port together — and
| never as patterns. A pattern is a guess about a hostname, and a wildcard
| would allow any site on the internet to call this API with a token. It also
| means these entries work unchanged whether an application is reached by port
| or by hostname, which is the whole point of listing an origin rather than a
| host.
|
*/

return [

    /*
    |----------------------------------------------------------------------
    | Applications
    |----------------------------------------------------------------------
    |
    | The key is the application's directory under apps/. `account_type` is the
    | value the back end's `account.can` middleware compares a token against,
    | and it must match the guard the application's sign-in route uses. The
    | four applications and the four account types are one-to-one, so an
    | application that is missing here is an application whose tokens the back
    | end would refuse at every door.
    |
    */

    'user' => [
        'account_type' => 'users',
        'origin' => env('FIXMATE_USER_ORIGIN', 'http://localhost:3000'),
    ],

    'worker' => [
        'account_type' => 'workers',
        'origin' => env('FIXMATE_WORKER_ORIGIN', 'http://localhost:3001'),
    ],

    'admin' => [
        'account_type' => 'admins',
        'origin' => env('FIXMATE_ADMIN_ORIGIN', 'http://localhost:3002'),
    ],

    'super-admin' => [
        'account_type' => 'super_admins',
        'origin' => env('FIXMATE_SUPER_ADMIN_ORIGIN', 'http://localhost:3003'),
    ],

];
