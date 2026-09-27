<?php

namespace Tests\Feature;

use App\Console\ApiClientContract;
use App\Console\ApiDocumentation;
use Illuminate\Filesystem\Filesystem;
use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The OpenAPI drift check, exercised as a test.
 *
 * A drift check that has only ever been run against a matching document proves
 * nothing — a check that always passes is indistinguishable from no check at
 * all. So each case here takes the document away in one specific way and
 * asserts the check notices.
 *
 * The cases worth reading twice are the security ones. A document that
 * understates what a route requires is not a stale document, it is a document
 * that tells a reader to send no token to an endpoint that refuses callers
 * without one, and nothing else in this repository would notice: the contract
 * has no field for a security requirement, and the generated client reads routes
 * rather than the document. So that case is asserted directly, in the direction
 * the mistake would be made in.
 *
 * The document is written to a temporary root and loaded from there rather than
 * being mutated in place, so a test that fails cannot leave the committed
 * document broken for the next one.
 */
class ApiDocumentationTest extends TestCase
{
    private const DOCUMENT = ApiDocumentation::DOCUMENT_PATH;

    private Filesystem $files;

    private string $root;

    protected function setUp(): void
    {
        parent::setUp();

        $this->files = new Filesystem;
        $this->root = storage_path('app/testing-api-docs-'.bin2hex(random_bytes(6)));

        $this->files->ensureDirectoryExists($this->root.'/packages/api-client');
        $this->files->copy(base_path(self::DOCUMENT), $this->root.'/'.self::DOCUMENT);
    }

    protected function tearDown(): void
    {
        $this->files->deleteDirectory($this->root);

        parent::tearDown();
    }

    // ---------------------------------------------------------------------
    // The committed document
    // ---------------------------------------------------------------------

    public function test_the_check_command_passes_against_the_committed_document(): void
    {
        $this->artisan('api-docs:check')->assertSuccessful();
    }

    public function test_the_document_describes_every_operation_the_contract_records(): void
    {
        // The positive half of the count. A document that quietly lost an
        // operation would be caught by the command, but the direction that
        // matters is which one: a document is read by people looking for an
        // endpoint, so a missing one is worse than an extra one, and asserting
        // the count is what makes "quietly lost" a test failure rather than a
        // diff someone has to notice.
        $documented = array_keys(ApiDocumentation::load(base_path())->operations());
        $recorded = array_column(ApiClientContract::load(base_path())->operations(), 'name');

        sort($documented);
        sort($recorded);

        $this->assertSame($recorded, $documented);
    }

    public function test_exactly_the_guarded_routes_are_documented_as_needing_a_token(): void
    {
        // Derived from the route table rather than written as a list of five, so
        // that adding a sixth protected route without documenting its security
        // fails this test rather than needing the list updated first.
        $guarded = [];

        foreach ($this->apiRoutes() as $name => $route) {
            if (in_array('auth:sanctum', $route->gatherMiddleware(), true)) {
                $guarded[] = $name;
            }
        }

        $documented = [];

        foreach (ApiDocumentation::load(base_path())->operations() as $operation) {
            if ($operation['secured']) {
                $documented[] = $operation['route'];
            }
        }

        sort($guarded);
        sort($documented);

        $this->assertNotSame([], $guarded, 'the route table has no guarded API route, so this test would pass for free');
        $this->assertSame($guarded, $documented);
    }

    public function test_every_documented_schema_reference_resolves(): void
    {
        // Asserted here as well as by the check, so that a failure names the
        // operation whose response became unreadable rather than arriving as a
        // list of pointers with no indication of where they were used.
        $document = json_decode((string) file_get_contents(base_path(self::DOCUMENT)), true);

        $this->assertIsArray($document);
        $this->assertArrayHasKey('openapi', $document);
        $this->assertStringStartsWith('3.', $document['openapi']);

        foreach (['SignInRequest', 'CurrentAccountResponse', 'ErrorResponse', 'ThrottledResponse'] as $schema) {
            $this->assertArrayHasKey($schema, $document['components']['schemas'], "{$schema} is referenced by an operation");
        }
    }

    // ---------------------------------------------------------------------
    // Security, the failure that would not otherwise be caught
    // ---------------------------------------------------------------------

    public function test_a_protected_route_documented_as_requiring_no_token_is_reported(): void
    {
        // The mistake, made the way it would be made: the operation is written,
        // the token requirement is forgotten, and the document reads as though
        // `GET /admins/{admin}` can be called unauthenticated.
        $problems = $this->problemsFor(fn (array $document): array => $this->removeFrom(
            $document,
            '/api/v1/identity/admins/{admin}',
            'get',
            'security',
        ));

        $this->assertStringContainsString(
            'is documented as needing no security requirement, but the route is behind auth:sanctum',
            $problems,
        );
    }

    public function test_a_protected_route_documented_with_an_empty_requirement_is_reported(): void
    {
        // The same mistake written the other way. `"security": []` is a positive
        // statement that the endpoint is public, so it is worse than omitting
        // the key: it looks decided.
        $problems = $this->problemsFor(fn (array $document): array => $this->setOn(
            $document,
            '/api/v1/identity/admins/{admin}',
            'get',
            'security',
            [],
        ));

        $this->assertStringContainsString('needing no security requirement', $problems);
    }

    public function test_a_public_route_documented_as_needing_a_token_is_reported(): void
    {
        // The harmless direction, reported because it is still wrong: a reader
        // would be told to sign in before asking for a sign-in.
        $problems = $this->problemsFor(fn (array $document): array => $this->setOn(
            $document,
            '/api/v1/identity/users/sign-in',
            'post',
            'security',
            [['bearerAuth' => []]],
        ));

        $this->assertStringContainsString(
            'is documented as needing a token, but the route is not behind auth:sanctum',
            $problems,
        );
    }

    // ---------------------------------------------------------------------
    // The account type and ability the document claims
    // ---------------------------------------------------------------------

    public function test_a_claimed_account_type_the_route_does_not_require_is_reported(): void
    {
        $problems = $this->problemsFor(fn (array $document): array => $this->setOn(
            $document,
            '/api/v1/identity/users/me',
            'get',
            'x-required-account-type',
            'workers',
        ));

        $this->assertStringContainsString(
            'claims the account type "workers" but the route guards "users"',
            $problems,
        );
    }

    public function test_an_omitted_ability_claim_on_a_route_that_requires_one_is_reported(): void
    {
        // The direction that matters. `admins.show` names both halves — a super
        // administrator and `accounts:read` — and dropping the ability from the
        // document leaves a sentence that says only "super administrators may
        // read this", which is a weaker and therefore wrong claim about who can
        // call it.
        $problems = $this->problemsFor(fn (array $document): array => $this->removeFrom(
            $document,
            '/api/v1/identity/admins/{admin}',
            'get',
            'x-required-ability',
        ));

        $this->assertStringContainsString(
            'claims the ability "none" but the route requires "accounts:read"',
            $problems,
        );
    }

    public function test_an_ability_claim_on_a_route_that_requires_none_is_reported(): void
    {
        $problems = $this->problemsFor(fn (array $document): array => $this->setOn(
            $document,
            '/api/v1/identity/users/me',
            'get',
            'x-required-ability',
            'accounts:suspend',
        ));

        $this->assertStringContainsString('claims the ability "accounts:suspend" but the route requires no ability', $problems);
    }

    // ---------------------------------------------------------------------
    // The document against the contract and the route table
    // ---------------------------------------------------------------------

    public function test_a_moved_route_is_reported_by_both_the_contract_and_the_back_end(): void
    {
        $problems = $this->problemsFor(fn (array $document): array => $this->move(
            $document,
            '/api/v1/identity/users/me',
            '/api/v1/identity/users/whoami',
        ));

        // Both, because both are true and both are what a reader would be misled
        // by. The contract is the front ends' recorded expectation and the route
        // table is the truth; the document disagreeing with either is a failure,
        // and naming only one of them would suggest the other agrees.
        $this->assertStringContainsString('the contract records "/api/v1/identity/users/me"', $problems);
        $this->assertStringContainsString('but route "users.me" is at "/api/v1/identity/users/me"', $problems);
    }

    public function test_a_document_naming_the_wrong_route_is_reported(): void
    {
        // Two operations can be at the same path and verb and still not be the
        // same endpoint, so the check compares the route name too rather than
        // treating a matching URL as proof of identity.
        $problems = $this->problemsFor(fn (array $document): array => $this->setOn(
            $document,
            '/api/v1/identity/users/me',
            'get',
            'x-laravel-route',
            'workers.me',
        ));

        $this->assertStringContainsString('claims the route "workers.me" but the contract records "users.me"', $problems);
    }

    public function test_a_document_without_x_laravel_route_is_reported(): void
    {
        // Without it the document cannot be traced back to routes/api.php, so a
        // renamed route would leave an operation that still looks right.
        $problems = $this->problemsFor(fn (array $document): array => $this->removeFrom(
            $document,
            '/api/v1/identity/users/me',
            'get',
            'x-laravel-route',
        ));

        $this->assertStringContainsString('does not say which Laravel route it describes', $problems);
    }

    public function test_a_verb_the_route_does_not_answer_is_reported(): void
    {
        $problems = $this->problemsFor(function (array $document): array {
            $document['paths']['/api/v1/identity/users/me']['post'] = $document['paths']['/api/v1/identity/users/me']['get'];
            $document['paths']['/api/v1/identity/users/me']['post']['operationId'] = 'currentUserAsPost';

            return $document;
        });

        // The route table knows the route answers GET, and HEAD with it. A
        // document offering POST for the same path is offering an endpoint that
        // 405s, and the contract check catches the second half of that.
        $this->assertStringContainsString('is documented as POST but route "users.me" answers GET/HEAD', $problems);
    }

    public function test_an_operation_dropped_from_the_document_is_reported(): void
    {
        $problems = $this->problemsFor(function (array $document): array {
            unset($document['paths']['/api/v1/identity/admins/{admin}']);

            return $document;
        });

        $this->assertStringContainsString('is in the contract but not in packages/api-client/openapi.json', $problems);
    }

    public function test_an_operation_the_contract_does_not_have_is_reported(): void
    {
        // A documented endpoint no front end can call is a promise the platform
        // cannot keep: nothing generates a client for it, so it is a route in a
        // document that answers nothing.
        $problems = $this->problemsFor(function (array $document): array {
            $document['paths']['/api/v1/identity/users/sign-out'] = [
                'post' => [
                    'operationId' => 'signOutUser',
                    'x-laravel-route' => 'users.signout',
                    'summary' => 'Not implemented.',
                    'responses' => ['204' => ['description' => 'No content.']],
                ],
            ];

            return $document;
        });

        $this->assertStringContainsString('the document describes signOutUser but no operation in the contract mentions it', $problems);
    }

    // ---------------------------------------------------------------------
    // Structural failures
    // ---------------------------------------------------------------------

    public function test_a_reference_to_a_schema_that_does_not_exist_is_reported(): void
    {
        // The most common editing accident in a hand-written document, and one
        // nothing else would catch: a schema named wrong is a response nobody
        // can read, and the operation that referenced it still looks complete.
        $problems = $this->problemsFor(function (array $document): array {
            $document['paths']['/api/v1/identity/users/me']['get']['responses']['200']['content']['application/json']['schema']['$ref'] = '#/components/schemas/CurrentAccountRespons';

            return $document;
        });

        $this->assertStringContainsString('the document references #/components/schemas/CurrentAccountRespons, which does not exist', $problems);
    }

    public function test_a_reference_into_a_response_that_does_not_exist_is_reported(): void
    {
        $problems = $this->problemsFor(function (array $document): array {
            $document['paths']['/api/v1/identity/users/sign-in']['post']['responses']['429'] = ['$ref' => '#/components/responses/TooManyAttempts'];

            return $document;
        });

        $this->assertStringContainsString('#/components/responses/TooManyAttempts, which does not exist', $problems);
    }

    public function test_a_key_beside_a_verb_that_is_not_a_verb_is_not_read_as_an_operation(): void
    {
        // A path item carries keys that are not operations: `summary`,
        // `description`, `servers`, `parameters` and `$ref` all sit at the same
        // level as the verbs, and the specification allows every one of them. A
        // parser that treated each key of a path item as an HTTP verb would read
        // `parameters` as a method, and the operation it invented would be
        // checked against the route table as though somebody had meant it.
        //
        // The same filter catches a mistyped verb, which is the mistake that
        // matters: `"Get"` is skipped, so the operation simply is not read, and
        // the contract check then reports it as missing from the document. That
        // is the right direction — a loud complaint naming an operation beats a
        // parser that confidently believes the document said GET.
        $documentation = $this->documentationFor(function (array $document): array {
            $document['paths']['/api/v1/identity/users/me']['summary'] = 'Who the customer token belongs to.';
            $document['paths']['/api/v1/identity/users/me']['parameters'] = [];
            $document['paths']['/api/v1/identity/users/me']['Get'] = [
                'operationId' => 'aMistypedVerbIsNotAnOperation',
                'x-laravel-route' => 'users.me',
                'security' => [['bearerAuth' => []]],
                'x-required-account-type' => 'users',
            ];

            return $document;
        });

        $operations = $documentation->operations();

        $this->assertArrayHasKey('currentUser', $operations);
        $this->assertArrayNotHasKey('aMistypedVerbIsNotAnOperation', $operations);
        $this->assertCount(17, $operations, 'only the seventeen real operations should be read');
    }

    public function test_two_operations_with_one_id_are_refused_rather_than_one_replacing_the_other(): void
    {
        // Letting the second overwrite the first would make every check below
        // assert something other than what the document says, quietly.
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('two operations with the id "currentUser"');

        $this->documentationFor(function (array $document): array {
            $document['paths']['/api/v1/identity/users/me-alias'] = [
                'get' => [
                    'operationId' => 'currentUser',
                    'x-laravel-route' => 'users.me',
                    'security' => [['bearerAuth' => []]],
                    'x-required-account-type' => 'users',
                    'responses' => ['200' => ['description' => 'The same operation twice.']],
                ],
            ];

            return $document;
        });
    }

    public function test_a_missing_document_is_a_failure_rather_than_an_empty_one(): void
    {
        $this->files->delete($this->root.'/'.self::DOCUMENT);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('The OpenAPI document is missing');

        ApiDocumentation::load($this->root);
    }

    public function test_a_malformed_document_is_a_failure_rather_than_an_empty_one(): void
    {
        $this->files->put($this->root.'/'.self::DOCUMENT, '{ not json');

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('The OpenAPI document is malformed');

        ApiDocumentation::load($this->root);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    /**
     * Write the committed document to a temporary root with one change applied,
     * load it from there, and return the problems the check reports.
     *
     * @param  callable(array<string, mixed>): array<string, mixed>  $mutate
     */
    private function problemsFor(callable $mutate): string
    {
        return $this->describe(
            $this->documentationFor($mutate)->violations(
                ApiClientContract::load(base_path()),
                $this->apiRoutes(),
            ),
        );
    }

    /**
     * @param  callable(array<string, mixed>): array<string, mixed>  $mutate
     */
    private function documentationFor(callable $mutate): ApiDocumentation
    {
        $document = $mutate(json_decode((string) file_get_contents(base_path(self::DOCUMENT)), true));

        $this->files->put(
            $this->root.'/'.self::DOCUMENT,
            json_encode($document, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
        );

        return ApiDocumentation::load($this->root);
    }

    /**
     * Set one key on one operation.
     *
     * @param  array<string, mixed>  $document
     * @return array<string, mixed>
     */
    private function setOn(array $document, string $path, string $method, string $key, mixed $value): array
    {
        $document['paths'][$path][$method][$key] = $value;

        return $document;
    }

    /**
     * Remove one key from one operation.
     *
     * @param  array<string, mixed>  $document
     * @return array<string, mixed>
     */
    private function removeFrom(array $document, string $path, string $method, string $key): array
    {
        unset($document['paths'][$path][$method][$key]);

        return $document;
    }

    /**
     * Rename the path an operation is documented at, leaving it in place under
     * the new path so that the check sees a moved endpoint rather than a deleted
     * one and a new one somewhere else.
     *
     * @param  array<string, mixed>  $document
     * @return array<string, mixed>
     */
    private function move(array $document, string $from, string $to): array
    {
        $document['paths'][$to] = $document['paths'][$from];
        unset($document['paths'][$from]);

        return $document;
    }

    /**
     * @param  array<int, array{0: string, 1: string}>  $problems
     */
    private function describe(array $problems): string
    {
        return implode("\n", array_map(fn (array $problem): string => $problem[1], $problems));
    }

    /**
     * @return array<string, RoutingRoute>
     */
    private function apiRoutes(): array
    {
        $apiRoutes = [];

        foreach (Route::getRoutes() as $route) {
            if (! $route->getName() || ! Str::startsWith($route->uri(), 'api/')) {
                continue;
            }

            $apiRoutes[$route->getName()] = $route;
        }

        return $apiRoutes;
    }
}
