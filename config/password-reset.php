<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Password reset landing pages
    |--------------------------------------------------------------------------
    |
    | The back end serves no pages, so the link in a reset email cannot point
    | at a route here. It points at the front end that owns the account type,
    | and this is where each of those four addresses is recorded. They are keyed
    | by the account type's broker name — the same name the route's controller
    | selects — so a worker link cannot be built with the customer page's URL by
    | accident: the key is not a parameter, it comes from the case.
    |
    | The token and the address travel in the query string, because the reset
    | form is a client-rendered page that has to read them before it can decide
    | what to show. Neither is a secret on its own — the token is useless
    | without the account it was issued for, and the address is already known to
    | whoever asked for the reset — and the token stops working the moment it is
    | spent or ages out.
    |
    | These are configuration rather than constants because the four front ends
    | are deployed separately and will not all live on one host, and a reset
    | link is only recoverable at the address that was current when it was sent.
    |
    */

    'urls' => [
        'users' => env('PASSWORD_RESET_URL_USERS', 'http://localhost:3000/reset-password'),
        'workers' => env('PASSWORD_RESET_URL_WORKERS', 'http://localhost:3001/reset-password'),
        'admins' => env('PASSWORD_RESET_URL_ADMINS', 'http://localhost:3002/reset-password'),
        'super_admins' => env('PASSWORD_RESET_URL_SUPER_ADMINS', 'http://localhost:3003/reset-password'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Reset requests per minute, per address
    |--------------------------------------------------------------------------
    |
    | A reset endpoint that is not throttled is two problems at once: it can be
    | used to flood somebody else's inbox, and the refusals a throttled endpoint
    | produces are one of the few honest answers a rate limit can give. The
    | count is per account type, for the same reason sign-in is — exhausting one
    | store's allowance must not stop the same person recovering an account in
    | another. AppServiceProvider holds the limiters themselves.
    |
    | This is the route-level limit. The broker carries a second one of its own,
    | per address, which is what stops a person burning through their mailbox
    | with a client that changes address casing to get a fresh allowance.
    |
    */

    'max_attempts' => (int) env('AUTH_PASSWORD_RESET_MAX_ATTEMPTS', 5),

    'decay_minutes' => (int) env('AUTH_PASSWORD_RESET_DECAY_MINUTES', 1),

];
