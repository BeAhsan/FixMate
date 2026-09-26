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
