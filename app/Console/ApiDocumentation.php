<?php

namespace App\Console;

use Illuminate\Routing\Route;

/**
 * The API's OpenAPI document, and what it claims about the back end.
 *
 * `contract.json` records what the front ends expect in four fields: a name, a
 * route, a verb and a path. An OpenAPI document is the same expectation written
 * for people and for tools instead — schemas, descriptions, security — and it
 * can go wrong in every way the manifest can plus a good many of its own: a
 * `$ref` that names a schema which does not exist, a public operation on a route
 * that sits behind a token, an account type claimed for a route that checks a
 * different one.
 *
 * So it is checked rather than trusted, and it is checked against two
 * independent things rather than against itself:
 *
 *   - the contract, which is itself checked against the route table, and
 *   - the route table directly, for everything the contract does not record.
 *
 * The second is the interesting one. The contract has no field for a security
 * requirement, so nothing in the existing drift check would notice a document
 * that documented `GET /admins/{admin}` as reachable without a token. The route's
 * own middleware answers that question authoritatively — `auth:sanctum` is
 * either on the route or it is not — so the check asks the route rather than
 * trusting the sentence.
 *
 * A document that understates what a route requires is the failure worth
 * catching. One that overstates it is a documentation annoyance: a public route
 * described as needing a token, which a reader can see is wrong. Both are
 * reported, but they are not the same severity, and the ordering of the two
 * checks below is what makes the dangerous one impossible to miss.
 */
class ApiDocumentation
{
    /**
     * Where the document lives, relative to the repository root.
     */
    public const DOCUMENT_PATH = 'packages/api-client/openapi.json';

    /**
     * The middleware that means "this route needs a token".
     *
     * Named rather than inferred from the absence of it, because "needs no
     * token" is what a route looks like when a developer forgot to add it, and a
     * check that treated that as the answer would call a broken route correct.
     */
    private const AUTH_MIDDLEWARE = 'auth:sanctum';

    /**
     * The middleware that names the account type, and optionally an ability.
     */
    private const AUTHORISATION_MIDDLEWARE = 'account.can';

    /**
     * The HTTP verbs a path may be documented under.
     *
     * Everything else in a `paths` object is a path-template variable — `admins.show`
     * is a template, not a verb — and a document that put a template at the same
     * level as a verb would be describing a path in terms of another path. The
     * specification allows it, and it is a real way for a hand-written document
     * to go quietly wrong, so it is treated as a path rather than ignored.
     */
    private const VERBS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

    /**
     * @param  array<int, array{operationId: string, route: string, method: string, path: string, secured: bool, accountType: string|null, ability: string|null}>  $operations
     * @param  array<string, mixed>  $document
     */
    private function __construct(
        private readonly array $operations,
        private readonly array $document,
    ) {}

    /**
     * Read the document, failing loudly if it is absent or malformed.
     *
     * A missing document is a failure rather than an empty one, for the reason
     * {@see ApiClientContract::load()} gives: an empty expectation passes every
     * check and asserts nothing.
     */
    public static function load(string $root): self
    {
        $path = $root.'/'.self::DOCUMENT_PATH;

        if (! is_file($path)) {
            throw new \RuntimeException("The OpenAPI document is missing: {$path}");
        }

        $document = json_decode((string) file_get_contents($path), true);

        if (! is_array($document)) {
            throw new \RuntimeException("The OpenAPI document is malformed: {$path}");
        }

        return new self(self::parse($document), $document);
    }

    /**
     * Every operation the document describes, keyed by its operation id.
     *
     * @return array<string, array{operationId: string, route: string, method: string, path: string, secured: bool, accountType: string|null, ability: string|null}>
     */
    public function operations(): array
    {
        return $this->operations;
    }

    /**
     * Describe every disagreement between the document and the back end.
     *
     * @param  ApiClientContract  $contract  The front ends' recorded expectation.
     * @param  array<string, Route>  $apiRoutes  The back end's named routes under the API prefix.
     * @return array<int, array{0: string, 1: string}> Human-readable problems, empty when there are none.
     */
    public function violations(ApiClientContract $contract, array $apiRoutes): array
    {
        $problems = [];

        foreach ($contract->operations() as $operation) {
            $problems = [...$problems, ...$this->checkDocumented($operation)];
        }

        $problems = [...$problems, ...$this->checkAgainstTheBackEnd($apiRoutes)];
        $problems = [...$problems, ...$this->checkForUndocumentedOperations($contract)];
        $problems = [...$problems, ...$this->checkReferences()];

        return $problems;
    }

    /**
     * The contract's operation must be in the document, at the URL and verb it
     * records, and naming the same Laravel route.
     *
     * @param  array{name: string, route: string, method: string, path: string}  $operation
     * @return array<int, array{0: string, 1: string}>
     */
    private function checkDocumented(array $operation): array
    {
        $documented = $this->operations[$operation['name']] ?? null;

        if (! $documented) {
            return [[
                $operation['name'].':',
                sprintf('is in the contract but not in %s.', self::DOCUMENT_PATH),
            ]];
        }

        $problems = [];

        if ($documented['path'] !== $operation['path']) {
            $problems[] = [
                $operation['name'].':',
                sprintf(
                    'is documented at "%s" but the contract records "%s".',
                    $documented['path'],
                    $operation['path'],
                ),
            ];
        }

        if ($documented['method'] !== $operation['method']) {
            $problems[] = [
                $operation['name'].':',
                sprintf(
                    'is documented as %s but the contract records %s.',
                    strtoupper($documented['method']),
                    strtoupper($operation['method']),
                ),
            ];
        }

        if ($documented['route'] !== $operation['route']) {
            $problems[] = [
                $operation['name'].':',
                sprintf(
                    'claims the route "%s" but the contract records "%s". One of them is describing the wrong endpoint.',
                    $documented['route'] !== '' ? $documented['route'] : 'none',
                    $operation['route'],
                ),
            ];
        }

        return $problems;
    }

    /**
     * The document must not describe a route the back end does not serve, and
     * must not describe a secured route as open.
     *
     * @param  array<string, Route>  $apiRoutes
     * @return array<int, array{0: string, 1: string}>
     */
    private function checkAgainstTheBackEnd(array $apiRoutes): array
    {
        $problems = [];

        foreach ($this->operations as $operation) {
            $label = $operation['operationId'].':';

            if ($operation['route'] === '') {
                $problems[] = [
                    $label,
                    'does not say which Laravel route it describes (x-laravel-route). The document cannot be traced back to routes/api.php without it.',
                ];

                continue;
            }

            $route = $apiRoutes[$operation['route']] ?? null;

            if (! $route) {
                $problems[] = [
                    $label,
                    sprintf('describes route "%s", which no longer exists.', $operation['route']),
                ];

                continue;
            }

            $problems = [...$problems, ...$this->checkPath($label, $operation, $route)];
            $problems = [...$problems, ...$this->checkSecurity($label, $operation, $route)];
            $problems = [...$problems, ...$this->checkAuthorisation($label, $operation, $route)];
        }

        return $problems;
    }

    /**
     * @param  array{path: string, method: string}  $operation
     * @return array<int, array{0: string, 1: string}>
     */
    private function checkPath(string $label, array $operation, Route $route): array
    {
        $problems = [];

        if ('/'.$route->uri() !== $operation['path']) {
            $problems[] = [
                $label,
                sprintf('is documented at "%s" but route "%s" is at "%s".', $operation['path'], $route->getName(), '/'.$route->uri()),
            ];
        }

        if (! in_array(strtoupper($operation['method']), $route->methods(), true)) {
            $problems[] = [
                $label,
                sprintf(
                    'is documented as %s but route "%s" answers %s.',
                    strtoupper($operation['method']),
                    $route->getName(),
                    implode('/', $route->methods()),
                ),
            ];
        }

        return $problems;
    }

    /**
     * The document's security requirement must be the route's.
     *
     * Read from the route's gathered middleware, which is where `auth:sanctum`
     * actually lands — it is named on a group in routes/api.php, so it is not in
     * the route's own `middleware()` list and has to be gathered.
     *
     * @param  array{secured: bool}  $operation
     * @return array<int, array{0: string, 1: string}>
     */
    private function checkSecurity(string $label, array $operation, Route $route): array
    {
        $guarded = in_array(self::AUTH_MIDDLEWARE, $route->gatherMiddleware(), true);

        if ($guarded && ! $operation['secured']) {
            return [[
                $label,
                'is documented as needing no security requirement, but the route is behind '.self::AUTH_MIDDLEWARE.'. A caller reading this document would not send a token.',
            ]];
        }

        if (! $guarded && $operation['secured']) {
            return [[
                $label,
                'is documented as needing a token, but the route is not behind '.self::AUTH_MIDDLEWARE.'.',
            ]];
        }

        return [];
    }

    /**
     * The account type and ability the document claims must be the ones the
     * route's `account.can` middleware names.
     *
     * This is the check that keeps a document from quietly understating an
     * endpoint's requirements: `x-required-account-type` is the sentence a reader
     * trusts about who may call something, and it is compared here against the
     * route's own argument rather than against the author's memory.
     *
     * @param  array{accountType: string|null, ability: string|null}  $operation
     * @return array<int, array{0: string, 1: string}>
     */
    private function checkAuthorisation(string $label, array $operation, Route $route): array
    {
        [$type, $ability] = $this->authorisationOf($route);
        $problems = [];

        if ($operation['accountType'] !== $type) {
            $problems[] = [
                $label,
                sprintf(
                    'claims the account type "%s" but the route guards %s.',
                    $operation['accountType'] ?? 'none',
                    $this->quoted($type, 'no account type'),
                ),
            ];
        }

        if ($operation['ability'] !== $ability) {
            $problems[] = [
                $label,
                sprintf(
                    'claims the ability "%s" but the route requires %s.',
                    $operation['ability'] ?? 'none',
                    $this->quoted($ability, 'no ability'),
                ),
            ];
        }

        return $problems;
    }

    /**
     * A value in quotes, or a phrase when there is nothing to quote.
     *
     * So that "requires no ability" reads as a sentence rather than as
     * `requires "no ability"`, which looks like a value called "no ability"
     * rather than the absence of one.
     */
    private function quoted(?string $value, string $whenAbsent): string
    {
        return $value === null ? $whenAbsent : '"'.$value.'"';
    }

    /**
     * The account type and ability a route's `account.can` middleware names.
     *
     * @return array{0: string|null, 1: string|null}
     */
    private function authorisationOf(Route $route): array
    {
        foreach ($route->gatherMiddleware() as $middleware) {
            if (! str_starts_with($middleware, self::AUTHORISATION_MIDDLEWARE.':')) {
                continue;
            }

            $arguments = explode(',', substr($middleware, strlen(self::AUTHORISATION_MIDDLEWARE) + 1));

            return [
                $arguments[0] ?? null,
                $arguments[1] ?? null,
            ];
        }

        return [null, null];
    }

    /**
     * A documented operation the contract does not describe is a hole: nothing
     * would generate a client for it, so it is a promise the front ends cannot
     * keep.
     *
     * @return array<int, array{0: string, 1: string}>
     */
    private function checkForUndocumentedOperations(ApiClientContract $contract): array
    {
        $documented = array_keys($this->operations);
        $undocumented = array_diff($documented, array_column($contract->operations(), 'name'));

        if ($undocumented === []) {
            return [];
        }

        return [[
            'Undocumented:',
            sprintf(
                'the document describes %s but no operation in the contract mentions %s. No front end can call %s.',
                implode(', ', $undocumented),
                count($undocumented) === 1 ? 'it' : 'them',
                count($undocumented) === 1 ? 'it' : 'them',
            ),
        ]];
    }

    /**
     * Every `$ref` in the document must resolve.
     *
     * A local reference is the one editing mistake a hand-written document makes
     * constantly, and nothing else in this repository would notice: a schema
     * named wrong is a schema no reader can find, and the response it was
     * supposed to describe simply has no description.
     *
     * @return array<int, array{0: string, 1: string}>
     */
    private function checkReferences(): array
    {
        $problems = [];

        foreach (array_unique($this->referencesIn($this->document)) as $reference) {
            if ($this->resolves($reference)) {
                continue;
            }

            $problems[] = [
                'Unresolvable:',
                sprintf(
                    'the document references %s, which does not exist. A schema that cannot be found is a response nobody can read.',
                    $reference,
                ),
            ];
        }

        return $problems;
    }

    /**
     * Every local reference in the document, wherever it is nested.
     *
     * Walked rather than found by encoding the document to JSON and matching
     * against it, because that would have to un-escape the pointers afterwards:
     * `json_encode` turns `/` into `\/`, so `#/components/schemas/SignInRequest`
     * comes back out as `#\/components\/schemas\/SignInRequest` and every
     * reference in the file appears to be missing. Escaping the slashes on the
     * way out would work, and then the check would be one flag away from
     * reporting the whole document as broken.
     *
     * Only local references are collected. An external one is resolved by
     * whatever fetches it, and this check has no business failing over a URL it
     * cannot reach.
     *
     * @param  array<array-key, mixed>  $node
     * @return list<string>
     */
    private function referencesIn(array $node): array
    {
        $references = [];

        foreach ($node as $key => $value) {
            if ($key === '$ref' && is_string($value) && str_starts_with($value, '#')) {
                $references[] = $value;

                continue;
            }

            if (is_array($value)) {
                $references = [...$references, ...$this->referencesIn($value)];
            }
        }

        return $references;
    }

    /**
     * Whether a local JSON pointer resolves against the document.
     */
    private function resolves(string $reference): bool
    {
        $target = $this->document;

        // `ltrim` removes the `#` and the leading `/` together, which is what
        // keeps `explode` from putting an empty first segment in front of the
        // real ones. Kept as a pointer walk rather than an `isset` chain so that
        // a reference into an array value is reported as unresolvable instead of
        // quietly passing on a null.
        foreach (explode('/', ltrim($reference, '#/')) as $segment) {
            $segment = str_replace(['~1', '~0'], ['/', '~'], $segment);

            if (! is_array($target) || ! array_key_exists($segment, $target)) {
                return false;
            }

            $target = $target[$segment];
        }

        return true;
    }

    /**
     * Flatten the document's operations into one record per operation.
     *
     * A duplicate operation id is a failure here rather than a silent overwrite:
     * two operations sharing an id is invalid OpenAPI, and letting the second
     * quietly replace the first would make the rest of these checks assert
     * something other than what the document says.
     *
     * @param  array<string, mixed>  $document
     * @return array<int, array{operationId: string, route: string, method: string, path: string, secured: bool, accountType: string|null, ability: string|null}>
     */
    private static function parse(array $document): array
    {
        $operations = [];

        foreach (($document['paths'] ?? []) as $path => $methods) {
            if (! is_array($methods)) {
                continue;
            }

            foreach ($methods as $method => $operation) {
                // Case-sensitive on purpose. The specification spells the
                // methods in lower case and tooling rejects anything else, so
                // folding `Get` to `get` here would have this check bless a
                // document that no OpenAPI tool will load. Skipped instead, which
                // leaves the operation unread and lets the contract check report
                // it as missing from the document — a complaint that names an
                // operation, rather than a document that looks fine and is not.
                if (! in_array((string) $method, self::VERBS, true) || ! is_array($operation)) {
                    // A path-template variable at the level a verb belongs to. It
                    // is skipped here, because the contract is what decides which
                    // paths exist; anything it does not describe is reported by
                    // checkForUndocumentedOperations() if it is an operation, and
                    // is harmless if it is not.
                    continue;
                }

                $id = $operation['operationId'] ?? null;

                if (! is_string($id) || $id === '') {
                    continue;
                }

                if (isset($operations[$id])) {
                    throw new \RuntimeException(sprintf(
                        'The OpenAPI document has two operations with the id "%s": %s %s and %s %s. An id has to name one operation, or the checks below would assert something other than what the document says.',
                        $id,
                        $operations[$id]['method'],
                        $operations[$id]['path'],
                        strtolower((string) $method),
                        '/'.ltrim((string) $path, '/'),
                    ));
                }

                $operations[$id] = [
                    'operationId' => $id,
                    'route' => is_string($operation['x-laravel-route'] ?? null) ? $operation['x-laravel-route'] : '',
                    'method' => (string) $method,
                    'path' => '/'.ltrim((string) $path, '/'),
                    // An absent `security` means no security, per the
                    // specification — which is exactly the reading that makes
                    // omitting it on a guarded route a caught mistake rather than
                    // a silent lie.
                    'secured' => ! empty($operation['security']),
                    'accountType' => is_string($operation['x-required-account-type'] ?? null) ? $operation['x-required-account-type'] : null,
                    'ability' => is_string($operation['x-required-ability'] ?? null) ? $operation['x-required-ability'] : null,
                ];
            }
        }

        return $operations;
    }
}
