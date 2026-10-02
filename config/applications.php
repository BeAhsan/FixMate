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
    | `routes_not_yet_built` is the product intent that has no screen behind it
    | yet. See its own block below before adding to it.
    |
    */

    'user' => [
        'account_type' => 'users',
        'origin' => env('FIXMATE_USER_ORIGIN', 'http://localhost:3000'),
        'routes_not_yet_built' => [],
    ],

    'worker' => [
        'account_type' => 'workers',
        'origin' => env('FIXMATE_WORKER_ORIGIN', 'http://localhost:3001'),
        'routes_not_yet_built' => ['/jobs/', '/availability/', '/earnings/', '/account/'],
    ],

    'admin' => [
        'account_type' => 'admins',
        'origin' => env('FIXMATE_ADMIN_ORIGIN', 'http://localhost:3002'),
        'routes_not_yet_built' => ['/bookings/', '/workers/', '/customers/', '/reports/'],
    ],

    'super-admin' => [
        'account_type' => 'super_admins',
        'origin' => env('FIXMATE_SUPER_ADMIN_ORIGIN', 'http://localhost:3003'),
        'routes_not_yet_built' => ['/admins/', '/audit/'],
    ],

    /*
    |----------------------------------------------------------------------
    | Routes that have no screen yet
    |----------------------------------------------------------------------
    |
    | Each of these was a navigation entry in that application's `sections`
    | list, and every one of them was a link that 404'd for a signed-in person.
    | Nothing failed at build time: `ApplicationShell` renders whatever it is
    | handed, so the navigation compiled, the image was pushed, and the link
    | was only broken to the person who followed it.
    |
    | They are listed here rather than left in place for two reasons. A link
    | that leads nowhere is worse than a missing link, because it looks like it
    | works. And a route that is declared but not built is a claim the
    | repository cannot check; once it is written down here it is a claim
    | something can, and a stale one fails the suite.
    |
    | The list is checked in both directions by
    | `tests/Feature/FrontEndNavigationResolvesTest.php`:
    |
    | - a route here that has grown a page must be removed from here, and its
    |   navigation entry restored at the same time;
    | - a route here that has been given a navigation entry back must also be
    |   removed from here, because the entry would then 404 again.
    |
    | So restoring one is two edits in the same commit, which is the point:
    | the page and the link land together or neither does.
    |
    | ## `user:/bookings/` was on this list, and it was the one entry that was
    | not simply missing
    |
    | There was no list of bookings anywhere in this repository — no bookings
    | table, no bookings route, and only one booking screen at
    | `/booking-details/`. Rather than delete the navigation entry, it was
    | repointed at that screen, because a link to nothing is a worse mismatch
    | than a plural noun pointing at a single booking.
    |
    | **That was a deferral and it has now been paid.** `GET /users/bookings` had
    | a route, a controller and a typed operation with nothing calling it, so the
    | endpoint existed to serve a page that had been deferred. `apps/user/app/
    | bookings/page.tsx` is that page and the tab is repointed at it; `/bookings/`
    | is off this list and the tab's "Bookings" is a list again.
    |
    | The screen reads `has_quote` per row to decide whether that row is a link,
    | because `/booking-details/` is one page pinned to one booking and a static
    | export has no per-booking route. So the list is not merely a page here: it is
    | the navigation, and the detail screen is a destination it reaches.
    |
    | `/bookings/` on `admin` below is a **different route** and is still unbuilt.
    | An administrator listing every booking on the platform is not the customer's
    | own visits, and nothing in this repository answers it.
    |
    */

];
