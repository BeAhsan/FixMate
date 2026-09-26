<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * The authentication surface of the API.
 *
 * A package that registers its own routes is not inert until it has been
 * configured, and this test is what makes that true here rather than assumed.
 * Laravel Fortify was installed, and its auto-discovered service provider put
 * `POST /login`, `POST /logout`, `POST /forgot-password`, `POST /reset-password`
 * and two confirm-password routes on a back end that is meant to expose four
 * token-based sign-in endpoints and nothing else. Those routes were session-based
 * and authenticated against the users table.
 *
 * They returned a 500 rather than working, but only because the rate limiter they
 * referenced had never been registered — an accident of omission, not a decision.
 * A test asserting the absence of these routes would have failed at the moment
 * the package was installed, instead of being discovered later by reading
 * `route:list`.
 */
class AuthenticationSurfaceTest extends TestCase
{
    /**
     * Routes that authenticate, or that exist to manage an authenticated
     * session, by any means other than an API token.
     *
     * `sanctum/csrf-cookie` is listed here and then explicitly allowed below.
     * It belongs to Sanctum's cookie-based SPA authentication, which this
     * application does not use: the four front ends hold a bearer token in
     * memory and authenticate with it, and the planned httpOnly refresh cookie
     * is set by this back end rather than negotiated with Sanctum. So the route
     * is unused surface rather than a hole, and it is tracked rather than
     * suppressed because suppressing it costs a configuration change and
     * removes an option the session upgrade path might want.
     *
     * @var array<int, string>
     */
    private const SESSION_AUTH_ROUTES = [
        'login',
        'logout',
        'register',
        'forgot-password',
        'reset-password',
        'verify-email',
        'user/confirm-password',
        'user/confirmed-password-status',
        'user/two-factor-authentication',
        'user/confirmed-two-factor-authentication',
        'user/two-factor-recovery-codes',
        'user/two-factor-recovery-code',
    ];

    /**
     * Top-level routes that are not under /api and are not a health check.
     *
     * @var array<int, string>
     */
    private const ALLOWED_TOP_LEVEL_ROUTES = [
        'up',
        'storage/{path}',
        // See SESSION_AUTH_ROUTES: unused, tracked, not a hole.
        'sanctum/csrf-cookie',
        '_boost/browser-logs',
    ];

    public function test_no_session_based_authentication_routes_are_exposed(): void
    {
        $registered = collect(Route::getRoutes()->getRoutes())
            ->map(fn ($route) => $route->uri())
            ->unique()
            ->all();

        $leaked = array_values(array_intersect(self::SESSION_AUTH_ROUTES, $registered));

        $this->assertSame(
            [],
            $leaked,
            'the API exposes session-based authentication routes: '.implode(', ', $leaked)
            .'. Authentication is by API token only, through the per-account-type sign-in endpoints.'
        );
    }

    public function test_the_only_authentication_routes_are_the_sign_in_endpoints(): void
    {
        $authenticationRoutes = collect(Route::getRoutes()->getRoutes())
            ->filter(fn ($route) => str_contains($route->uri(), 'sign-in'))
            ->map(fn ($route) => $route->uri())
            ->unique()
            ->sort()
            ->values()
            ->all();

        $this->assertSame([
            'api/v1/identity/admins/sign-in',
            'api/v1/identity/super-admins/sign-in',
            'api/v1/identity/users/sign-in',
            'api/v1/identity/workers/sign-in',
        ], $authenticationRoutes);
    }

    public function test_no_route_is_registered_outside_the_api_prefix(): void
    {
        // Everything the application serves is JSON under /api, with the
        // exceptions of the health endpoint the deploy script polls, the
        // framework's own storage routes for local disk, and the tracked
        // exceptions named in ALLOWED_TOP_LEVEL_ROUTES. A new top-level route is
        // a new public surface and should be a deliberate decision.
        $unexpected = collect(Route::getRoutes()->getRoutes())
            ->map(fn ($route) => $route->uri())
            ->reject(fn (string $uri) => str_starts_with($uri, 'api/') || in_array($uri, self::ALLOWED_TOP_LEVEL_ROUTES, true))
            ->unique()
            ->values()
            ->all();

        $this->assertSame([], $unexpected, 'unexpected top-level routes: '.implode(', ', $unexpected));
    }
}
