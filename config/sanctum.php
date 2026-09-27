<?php

/*
|--------------------------------------------------------------------------
| Sanctum
|--------------------------------------------------------------------------
|
| The only option that matters on this platform is the first one, and it is here
| because of what the default does.
|
| With no `guard` key at all, Sanctum falls back to `['web']` and its guard
| checks that session guard *before* it looks at the bearer token. The `web` guard
| is not this repository's — it is merged in underneath `config/auth.php` from
| the framework's own defaults, so it exists whether or not it was declared here,
| driving a session and resolving through the `users` provider. It is not
| currently reachable, because nothing in this API signs anybody into a session.
|
| If it ever were, the result would be an account that had presented no token at
| all being handed a `TransientToken`, whose `abilities` are `['*']` and whose
| `can()` returns true unconditionally. Every ability check in the platform would
| pass for it, and the account type check would pass too, because the `web`
| provider resolves an end user. An empty array says there is no session to fall
| back to, which makes a presented bearer token the only way in — the property
| the whole ability model is built on.
|
| The rest of the defaults are left alone deliberately. `expiration` and the
| other token settings are not set in this file so that publishing Sanctum's own
| configuration later is an edit rather than a merge, and so that nothing here
| looks like an opinion about token lifetime.
|
*/

return [

    /*
    |--------------------------------------------------------------------------
    | Stateful Domains
    |--------------------------------------------------------------------------
    |
    | No session guard is consulted before the bearer token. Empty, and it must
    | stay empty — see above.
    |
    */

    'guard' => [],

];
