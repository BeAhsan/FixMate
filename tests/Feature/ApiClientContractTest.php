<?php

namespace Tests\Feature;

use App\Console\ApiClientContract;
use Illuminate\Filesystem\Filesystem;
use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The drift check, exercised as a test.
 *
 * A drift check that has only ever been run against a matching contract proves
 * nothing: a check that always passes is indistinguishable from no check at all.
 * So each case here takes the contract away from the back end in a specific way
 * and asserts the check notices, which is the only evidence that it would
 * notice a real rename.
 *
 * The contract is read and compared directly rather than by shelling out to the
 * command, so a failure points at the specific disagreement instead of at an
 * exit code.
 */
class ApiClientContractTest extends TestCase
{
    private Filesystem $files;

    private string $generated;

    protected function setUp(): void
    {
        parent::setUp();

        $this->files = new Filesystem;
        $this->generated = storage_path('app/testing-api-client-'.bin2hex(random_bytes(6)));
        $this->files->ensureDirectoryExists($this->generated);

        $this->artisan('api-client:generate', ['--path' => $this->generated, '--quiet' => true])
            ->assertSuccessful();
    }

    protected function tearDown(): void
    {
        $this->files->deleteDirectory($this->generated);

        parent::tearDown();
    }

    public function test_generation_produces_a_typed_function_for_the_sign_in_route(): void
    {
        $source = (string) file_get_contents($this->generated.'/routes/users/index.ts');

        $this->assertStringContainsString("url: '/api/v1/identity/users/sign-in'", $source);
        $this->assertStringContainsString('methods: ["post"]', $source);
    }

    public function test_a_matching_back_end_and_contract_produce_no_violations(): void
    {
        $this->assertSame([], $this->violationsFor(null));
    }

    public function test_a_renamed_route_is_detected(): void
    {
        // What a rename looks like: the route keeps its name and verb but moves.
        $this->assertNotSame([], $this->violationsFor([
            'users.signin' => $this->apiRoute('api/v1/identity/users/sign-in', 'post', 'users.signin'),
        ], path: '/api/v1/identity/user/sign-in'));
    }

    public function test_a_removed_route_is_detected(): void
    {
        $problems = $this->violationsFor([]);

        $this->assertNotSame([], $problems);
        $this->assertStringContainsString('no API route named "users.signin"', $this->describe($problems));
    }

    public function test_a_changed_verb_is_detected(): void
    {
        $problems = $this->violationsFor([
            'users.signin' => $this->apiRoute('api/v1/identity/users/sign-in', 'get', 'users.signin'),
        ]);

        $this->assertNotSame([], $problems);
        $this->assertMatchesRegularExpression('/now answers .*get/i', $this->describe($problems));
    }

    public function test_a_new_route_the_front_ends_were_not_told_about_is_detected(): void
    {
        // A name the contract cannot possibly contain, so this stays a test of
        // "an undeclared route is caught" as the account types are added. Naming
        // a real route here would stop being a new route the moment that route
        // was added to the contract, and the test would quietly stop testing it.
        $routes = $this->apiRoutes();
        $routes['undeclared.signin'] = $this->apiRoute(
            'api/v1/identity/undeclared/sign-in', 'post', 'undeclared.signin'
        );

        $problems = $this->violationsFor($routes);

        $this->assertNotSame([], $problems);
        $this->assertStringContainsString('undeclared.signin', $this->describe($problems));
        $this->assertStringContainsString('no operation in the contract', $this->describe($problems));
    }

    public function test_a_contract_operation_with_no_binding_in_the_client_is_detected(): void
    {
        // The real contract, plus one operation the client does not bind. Kept
        // additive so the assertion is about the missing binding specifically
        // rather than about whichever real operation happens to be absent.
        $contract = new ApiClientContract([
            ...ApiClientContract::load(base_path())->operations(),
            ['name' => 'signInNobody', 'route' => 'nobody.signin', 'method' => 'post', 'path' => '/api/v1/identity/nobody/sign-in'],
        ]);

        $routes = $this->apiRoutes();
        $routes['nobody.signin'] = $this->apiRoute('api/v1/identity/nobody/sign-in', 'post', 'nobody.signin');

        $problems = $contract->violations($this->generated, $routes);

        $this->assertNotSame([], $problems);
        // The check reports by route name, which is what a person reading the
        // failure needs: it is the route in routes/api.php they have to look at.
        $this->assertStringContainsString('nobody.signin', $this->describe($problems));
        $this->assertStringContainsString('is not bound in', $this->describe($problems));
    }

    public function test_the_check_command_passes_against_the_committed_contract(): void
    {
        $this->artisan('api-client:check')->assertSuccessful();
    }

    public function test_the_verb_is_read_from_the_routes_own_generated_block(): void
    {
        // The regression this exists for, and it is worth being precise about
        // which way it fails.
        //
        // Wayfinder writes every route in a named group into one module, so
        // `users/index.ts` now holds four routes: three POSTs and one GET. A check
        // that reads the first `methods:` in the file answers for the sign-in, and
        // for as long as every operation in every group was a POST the wrong answer
        // agreed with the right one — so the check passed for the wrong reason and
        // nobody could tell.
        //
        // The contract below therefore records the verb the *first* block really
        // has: post. A check reading the first block finds post, agrees with this
        // contract, and reports nothing. Only a check reading this route's own
        // block sees get and reports the disagreement. So a green result here would
        // mean the bug is back, not that the check is lenient.
        $operations = array_map(
            fn (array $operation): array => $operation['name'] === 'currentUser'
                ? ['name' => 'currentUser', 'route' => 'users.me', 'method' => 'post', 'path' => '/api/v1/identity/users/me']
                : $operation,
            ApiClientContract::load(base_path())->operations(),
        );

        $problems = (new ApiClientContract($operations))->violations($this->generated, $this->apiRoutes());

        $this->assertNotSame([], $problems);
        // Both halves report it independently: the live route answers GET/HEAD,
        // and the generated block for `users.me` answers get/head. The second is
        // the one this test is about — the first would be caught by any verb check.
        $this->assertStringContainsString(
            'the route "/api/v1/identity/users/me" now answers GET/HEAD, the contract says POST',
            $this->describe($problems),
        );
        $this->assertStringContainsString(
            'the generated function answers get/head, the contract says post',
            $this->describe($problems),
        );
    }

    public function test_a_moved_parameterised_route_is_detected(): void
    {
        // A parameterised URL is the case that needs saying out loud: the
        // generated URL is `/api/v1/identity/admins/{admin}`, so a comparison that
        // walks braces naively stops inside `{admin}` and is left holding a URL
        // that was never there.
        //
        // The real contract passing already covers the truncation, because a
        // truncated block never contains the full path and would report a
        // violation against the true one. This test is the other direction — a
        // deliberately wrong placeholder — and it is here so the reason the
        // matching test is meaningful is written down where it will be read.
        $contract = new ApiClientContract([
            ['name' => 'showAdmin', 'route' => 'admins.show', 'method' => 'get', 'path' => '/api/v1/identity/admins/{id}'],
        ]);

        $problems = $contract->violations($this->generated, $this->apiRoutes());

        $this->assertStringContainsString('does not carry the URL', $this->describe($problems));
        $this->assertStringContainsString('/api/v1/identity/admins/{id}', $this->describe($problems));
    }

    public function test_a_hyphenated_route_name_is_matched_to_its_camel_case_export(): void
    {
        // The route is `admins.forgot-password` and the generated export is
        // `forgotPassword`, so finding the block means reproducing a transform the
        // generator owns.
        //
        // Asserted with a deliberately wrong path rather than a correct one,
        // because the two failure modes have different messages: a check that
        // failed to find the block at all would report "generation produced no
        // definition", and this asserts it got as far as comparing URLs. That
        // distinction is the whole point — finding the wrong block and finding no
        // block are different bugs and need different fixes.
        $contract = new ApiClientContract([
            [
                'name' => 'forgotPasswordAdmin',
                'route' => 'admins.forgot-password',
                'method' => 'post',
                'path' => '/api/v1/identity/admins/forgot-password-v2',
            ],
        ]);

        $problems = $contract->violations($this->generated, $this->apiRoutes());

        $this->assertStringContainsString('does not carry the URL', $this->describe($problems));
        $this->assertStringNotContainsString('produced no definition', $this->describe($problems));
    }

    public function test_an_export_name_that_is_a_suffix_of_another_does_not_match_it(): void
    {
        // Anchoring the lookup. `me` must not match a hypothetical `time.definition`
        // in the same module, and the cheapest way to keep that true as routes are
        // added is to assert the anchor is doing something — so this asks for an
        // export that is a suffix of a real one and requires that it is *not* found.
        $contract = new ApiClientContract([
            ['name' => 'ime', 'route' => 'users.ime', 'method' => 'get', 'path' => '/api/v1/identity/users/me'],
        ]);

        $problems = $contract->violations($this->generated, $this->apiRoutes());

        $this->assertStringContainsString('produced no definition', $this->describe($problems));
    }

    /**
     * Run the contract's comparison against an alternative view of the back end.
     *
     * @param  array<string, RoutingRoute>|null  $routes  null to use the real routes.
     * @return array<int, array{0: string, 1: string}>
     */
    private function violationsFor(?array $routes, ?string $path = null): array
    {
        $contract = ApiClientContract::load(base_path());

        if ($path !== null) {
            // Simulate the moved route by rewriting the recorded path, which is
            // what a front end that had been built against the old URL expects.
            $contract = new ApiClientContract([
                ['name' => 'signInUser', 'route' => 'users.signin', 'method' => 'post', 'path' => $path],
            ]);
        }

        return $contract->violations($this->generated, $routes ?? $this->apiRoutes());
    }

    /**
     * @return array<string, RoutingRoute>
     */
    private function apiRoutes(): array
    {
        $routes = [];

        foreach (Route::getRoutes() as $route) {
            if ($route->getName() && Str::startsWith($route->uri(), 'api/')) {
                $routes[$route->getName()] = $route;
            }
        }

        return $routes;
    }

    private function apiRoute(string $uri, string $method, string $name): RoutingRoute
    {
        return (new RoutingRoute([$method], $uri, []))->name($name);
    }

    /**
     * @param  array<int, array{0: string, 1: string}>  $problems
     */
    private function describe(array $problems): string
    {
        return implode("\n", array_map(fn (array $problem): string => $problem[1], $problems));
    }
}
