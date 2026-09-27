<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The four applications are browsers and this is a JSON API, so every request
 * they make is cross-origin. These tests assert that from outside, with a real
 * `Origin` header, because the failure they guard against is invisible from
 * PHP: the request reaches the application, the response is correct, and the
 * *browser* throws the result away.
 */
class CrossOriginRequestsTest extends TestCase
{
    use RefreshDatabase;

    /**
     * A preflight is sent before the real request, and it is a request to a URL
     * that does not exist — the framework answers it from middleware before
     * routing. So a broken CORS configuration is invisible to any test that
     * only posts to the sign-in route, which is why this asks for the method
     * and headers the client actually sends.
     */
    public function test_an_application_origin_may_preflight_the_sign_in_route(): void
    {
        $response = $this->withHeaders([
            'Origin' => config('applications.user.origin'),
            'Access-Control-Request-Method' => 'POST',
            'Access-Control-Request-Headers' => 'content-type',
        ])->options('/api/v1/identity/users/sign-in');

        $response->assertSuccessful();
        $response->assertHeader(
            'Access-Control-Allow-Origin',
            config('applications.user.origin'),
        );
        $this->assertStringContainsStringIgnoringCase(
            'POST',
            (string) $response->headers->get('Access-Control-Allow-Methods'),
        );
    }

    /**
     * All four, not just the one the first application uses. A front end that
     * is missing from the list works for everyone except the person using it,
     * and the symptom is a browser console message rather than a failed
     * deployment, so the omission has to be caught here instead.
     */
    #[DataProvider('applicationOrigins')]
    public function test_every_application_origin_is_allowed(string $application): void
    {
        $origin = config("applications.{$application}.origin");

        $this->withHeaders(['Origin' => $origin])
            ->options('/api/v1/identity/users/sign-in', headers: [
                'Access-Control-Request-Method' => 'POST',
            ])
            ->assertHeader('Access-Control-Allow-Origin', $origin);
    }

    /**
     * @return array<string, array{string}>
     */
    public static function applicationOrigins(): array
    {
        return [
            'user' => ['user'],
            'worker' => ['worker'],
            'admin' => ['admin'],
            'super admin' => ['super-admin'],
        ];
    }

    /**
     * The refusal is the point of listing origins rather than patterns.
     *
     * A wildcard, or any pattern matching a hostname, would let any site on the
     * internet call this API with a token. The request still reaches the
     * application either way — CORS is enforced by the browser, not here — so
     * what is asserted is the *absence* of the allow header, which is what the
     * browser acts on.
     */
    public function test_an_unknown_origin_is_not_granted_access(): void
    {
        $response = $this->withHeaders([
            'Origin' => 'http://attacker.example',
            'Access-Control-Request-Method' => 'POST',
        ])->options('/api/v1/identity/users/sign-in');

        $response->assertSuccessful();
        $response->assertHeaderMissing('Access-Control-Allow-Origin');
    }

    /**
     * Same address, different port, is a different origin. A browser treats
     * them as unrelated, so allowing one and not the other is correct — and it
     * is the reason the list is written as origins rather than as hosts, since
     * a host-only rule would wrongly let this through.
     */
    public function test_the_same_host_on_a_different_port_is_not_allowed(): void
    {
        $origin = config('applications.user.origin');
        $otherPort = preg_replace('/:\d+$/', ':9999', $origin);

        $response = $this->withHeaders([
            'Origin' => $otherPort,
            'Access-Control-Request-Method' => 'POST',
        ])->options('/api/v1/identity/users/sign-in');

        $response->assertSuccessful();
        $response->assertHeaderMissing('Access-Control-Allow-Origin');
    }

    /**
     * A real sign-in from a real application origin, end to end.
     *
     * Preflight alone is not enough: a configuration that answers the preflight
     * and then withholds the header from the actual response leaves an
     * application that gets a correct answer and cannot read it.
     */
    public function test_a_real_sign_in_from_an_application_origin_succeeds(): void
    {
        $password = 'password123';

        User::factory()->create([
            'email' => 'test@example.com',
            'password' => bcrypt($password),
            'status' => 'active',
        ]);

        $response = $this->withHeaders([
            'Origin' => config('applications.user.origin'),
        ])->postJson('/api/v1/identity/users/sign-in', [
            'email' => 'test@example.com',
            'password' => $password,
        ]);

        $response->assertOk();
        $response->assertHeader(
            'Access-Control-Allow-Origin',
            config('applications.user.origin'),
        );
        $this->assertNotEmpty($response->json('data.token'));
    }

    /**
     * The health endpoint is polled by Docker and the deploy script from inside
     * the container network, where there is no Origin header at all. CORS must
     * not turn that into a failure, and it must not add an allow header to a
     * request that did not ask for one.
     */
    public function test_a_request_without_an_origin_is_unaffected(): void
    {
        $response = $this->get('/up');

        $response->assertOk();
        $response->assertHeaderMissing('Access-Control-Allow-Origin');
    }

    /**
     * The list is built from config/applications.php rather than written out
     * again here, so this fails if an application is added and the CORS list is
     * not — which is the omission the preflight test above cannot see.
     */
    public function test_every_application_in_the_configuration_is_in_the_allowed_list(): void
    {
        $expected = array_values(array_map(
            fn (array $application): string => $application['origin'],
            config('applications'),
        ));

        $this->assertSame($expected, config('cors.allowed_origins'));
        $this->assertCount(4, $expected, 'There are four applications, and each needs an address.');
    }

    /**
     * Origins are matched exactly, so the pattern list must be empty.
     *
     * There is no separate "support patterns" switch: fruitcake/php-cors reads
     * `allowed_origin_patterns` directly, and `configureAllowedOriginPatterns()`
     * will even convert a wildcard *found in `allowed_origins`* into a pattern.
     * So an empty pattern list is the whole guarantee, and asserting a
     * `supports_origin_patterns` key would be asserting a setting that does not
     * exist and that nothing reads.
     */
    public function test_origins_are_not_treated_as_patterns(): void
    {
        $this->assertSame([], config('cors.allowed_origin_patterns'));
        $this->assertNotContains('*', config('cors.allowed_origins'));
    }
}
