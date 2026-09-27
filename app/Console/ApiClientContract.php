<?php

namespace App\Console;

use Illuminate\Routing\Route;

/**
 * The front ends' recorded expectation of the back end's API.
 *
 * The generated client is not committed, so there is nothing for `git diff` to
 * compare. What is committed is this manifest: for every operation a front-end
 * application calls, the route name it was generated from, the HTTP verb, and
 * the URL path that URL must produce. It is a duplication of the back end's own
 * route table on purpose — a drift check cannot detect a change it does not
 * have an independent record of. Both sides change together or the check fails.
 *
 * The manifest is plain JSON rather than a PHP array so that the TypeScript
 * package can read the same file, and so that it looks like a contract document
 * rather than more PHP.
 */
class ApiClientContract
{
    /**
     * Where the expectation lives, relative to the repository root.
     */
    public const MANIFEST_PATH = 'packages/api-client/contract.json';

    /**
     * The hand-written module that binds generated routes to named operations.
     */
    public const OPERATIONS_PATH = 'packages/api-client/src/operations.ts';

    /**
     * @param  array<int, array{name: string, route: string, method: string, path: string}>  $operations
     */
    public function __construct(
        private readonly array $operations,
    ) {}

    /**
     * Read the manifest, failing loudly if it is absent or malformed.
     *
     * A missing manifest is a failure, not an empty contract: an empty contract
     * would make the drift check pass while the front ends had nothing to call.
     */
    public static function load(string $root): self
    {
        $path = $root.'/'.self::MANIFEST_PATH;

        if (! is_file($path)) {
            throw new \RuntimeException("The API client contract is missing: {$path}");
        }

        $decoded = json_decode((string) file_get_contents($path), true);

        if (! is_array($decoded) || ! is_array($decoded['operations'] ?? null)) {
            throw new \RuntimeException("The API client contract is malformed: {$path}");
        }

        $operations = [];

        foreach ($decoded['operations'] as $operation) {
            foreach (['name', 'route', 'method', 'path'] as $key) {
                if (! is_string($operation[$key] ?? null) || $operation[$key] === '') {
                    throw new \RuntimeException("The API client contract has an operation with no '{$key}': {$path}");
                }
            }

            $operations[] = [
                'name' => $operation['name'],
                'route' => $operation['route'],
                'method' => strtolower($operation['method']),
                'path' => '/'.ltrim($operation['path'], '/'),
            ];
        }

        return new self($operations);
    }

    /**
     * @return array<int, array{name: string, route: string, method: string, path: string}>
     */
    public function operations(): array
    {
        return $this->operations;
    }

    /**
     * Compare a fresh generation and the back end's live routes against the
     * recorded expectation, and describe every disagreement.
     *
     * @param  string  $generatedPath  The directory the client was generated into.
     * @param  array<string, Route>  $apiRoutes  The back end's named routes under the API prefix.
     * @return array<int, array{0: string, 1: string}> Human-readable problems, empty when there are none.
     */
    public function violations(string $generatedPath, array $apiRoutes, ?string $root = null): array
    {
        $root ??= base_path();
        $problems = [];

        foreach ($this->operations as $operation) {
            $problems = [...$problems, ...$this->checkBackEnd($operation, $apiRoutes)];
            $problems = [...$problems, ...$this->checkGenerated($operation, $generatedPath)];
            $problems = [...$problems, ...$this->checkBinding($operation, $root)];
        }

        return [...$problems, ...$this->checkForUndeclaredRoutes($apiRoutes)];
    }

    /**
     * The back end must still serve the URL the front ends expect.
     *
     * @param  array{name: string, route: string, method: string, path: string}  $operation
     * @param  array<string, Route>  $apiRoutes
     * @return array<int, array{0: string, 1: string}>
     */
    private function checkBackEnd(array $operation, array $apiRoutes): array
    {
        $route = $apiRoutes[$operation['route']] ?? null;

        if (! $route) {
            return [[
                $operation['name'].':',
                sprintf('no API route named "%s" exists any more.', $operation['route']),
            ]];
        }

        $problems = [];

        if ('/'.$route->uri() !== $operation['path']) {
            $problems[] = [
                $operation['name'].':',
                sprintf('is at "%s", the contract says "%s".', '/'.$route->uri(), $operation['path']),
            ];
        }

        if (! in_array(strtoupper($operation['method']), $route->methods(), true)) {
            $problems[] = [
                $operation['name'].':',
                sprintf(
                    'the route "%s" now answers %s, the contract says %s.',
                    $operation['path'],
                    implode('/', $route->methods()),
                    strtoupper($operation['method']),
                ),
            ];
        }

        return $problems;
    }

    /**
     * The generated function must carry the URL and verb the contract records.
     *
     * This is the half the back end cannot check on its own: whether the
     * generator still emits a usable function for the route. A change in
     * wayfinder's template that quietly dropped the url, say, is caught here and
     * not in a browser.
     *
     * @param  array{name: string, route: string, method: string, path: string}  $operation
     * @return array<int, array{0: string, 1: string}>
     */
    private function checkGenerated(array $operation, string $generatedPath): array
    {
        $file = $generatedPath.'/routes/'.$this->generatedRoutePath($operation['route']);

        if (! is_file($file)) {
            return [[
                $operation['name'].':',
                sprintf('generation produced no function for route "%s" (expected %s).', $operation['route'], $file),
            ]];
        }

        $source = (string) file_get_contents($file);

        // Scoped to *this* route's own definition block, and that scoping is the
        // whole point. Wayfinder writes every route in a named group into one
        // module — `users/index.ts` holds the sign-in, both reset halves, the me
        // endpoint and anything else on the users group — so reading the first
        // `methods:` in the file answers for whichever route was emitted first,
        // not for the one being checked.
        //
        // That was not a bug while every operation in every group was a POST: the
        // first route emitted happens to be the sign-in, so the wrong answer
        // agreed with the right one for all twelve operations and the check
        // passed for the wrong reason. It surfaced the moment a group got a GET,
        // which is why it is worth recording rather than quietly narrowing.
        $definition = $this->definitionBlock($source, $this->exportName($operation['route']));

        if ($definition === null) {
            return [[
                $operation['name'].':',
                sprintf('generation produced no definition for route "%s".', $operation['route']),
            ]];
        }

        $problems = [];

        if (! str_contains($definition, "'".$operation['path']."'")) {
            $problems[] = [
                $operation['name'].':',
                sprintf('the generated function does not carry the URL %s.', $operation['path']),
            ];
        }

        // `methods: ["post"]` for a single-verb route, `methods: ["get", "head"]`
        // for one that answers more than one.
        preg_match('/methods:\s*\[([^\]]*)\]/', $definition, $matches);

        $verbs = array_map(
            fn (string $verb): string => trim($verb, " \t\n\r\0\x0B\"'"),
            explode(',', $matches[1] ?? ''),
        );
        $verbs = array_values(array_filter($verbs));

        if (! in_array($operation['method'], $verbs, true)) {
            $problems[] = [
                $operation['name'].':',
                sprintf(
                    'the generated function answers %s, the contract says %s.',
                    $verbs === [] ? 'nothing' : implode('/', $verbs),
                    $operation['method'],
                ),
            ];
        }

        return $problems;
    }

    /**
     * The `methods`/`url` block wayfinder emits for one named export.
     *
     * The block is matched as far as the `} satisfies` that terminates it rather
     * than as far as the first `}` after the opening brace, because a route with a
     * parameter in it puts a `{placeholder}` inside the `url` string — `admins/{admin}`
     * — and a non-greedy brace match stops inside that placeholder and returns a
     * block with the URL cut off mid-string. Anchoring on `satisfies` is what the
     * generator actually emits, and a parameterised route is the common case, not
     * the exotic one.
     *
     * The lookup is anchored to a non-identifier character before the export name
     * so that asking for `me` cannot match a hypothetical `time.definition` in the
     * same module.
     *
     * @return string|null Null when the module has no definition for that export.
     */
    private function definitionBlock(string $source, string $export): ?string
    {
        $matched = preg_match(
            '/(?<![\w$])'.preg_quote($export, '/').'\.definition\s*=\s*\{(.*?)\}\s*satisfies/s',
            $source,
            $matches,
        );

        return $matched === 1 ? $matches[1] : null;
    }

    /**
     * The name wayfinder exports a named route under: the last segment, in camelCase.
     *
     * `admins.forgot-password` is exported as `forgotPassword`, and
     * `super-admins.me` as `me` — so the directory is the segments before the last
     * one, and the file is that directory's index.
     *
     * This duplicates a rule the generator owns, and it is the piece of this
     * class most likely to need attention: if wayfinder's transform changes, this
     * stops finding the block and the check reports "generation produced no
     * definition" for every affected operation. That is the intended failure
     * direction — a loud complaint that names a route, rather than a check that
     * quietly reads some other route's block and passes.
     */
    private function exportName(string $routeName): string
    {
        $segments = explode('.', $routeName);
        $segment = (string) end($segments);

        return (string) preg_replace_callback(
            '/-([a-z0-9])/',
            fn (array $match): string => strtoupper($match[1]),
            $segment,
        );
    }

    /**
     * The hand-written binding must still point at the generated function.
     *
     * The contract can be updated without the operations module being updated,
     * and nothing else would notice: the build would pass and the application
     * would call the wrong endpoint at runtime.
     *
     * @param  array{name: string, route: string, method: string, path: string}  $operation
     * @return array<int, array{0: string, 1: string}>
     */
    private function checkBinding(array $operation, string $root): array
    {
        $file = $root.'/'.self::OPERATIONS_PATH;

        if (! is_file($file)) {
            return [[$operation['name'].':', sprintf('the operations module is missing (%s).', $file)]];
        }

        $source = (string) file_get_contents($file);
        $problems = [];

        if (! preg_match('/\b'.preg_quote($operation['name'], '/').'\b/', $source)) {
            $problems[] = [
                $operation['name'].':',
                sprintf('is not bound in %s.', self::OPERATIONS_PATH),
            ];
        }

        $import = $this->generatedImport($operation['route']);

        if (! str_contains($source, $import)) {
            $problems[] = [
                $operation['name'].':',
                sprintf('is not imported with %s in %s.', $import, self::OPERATIONS_PATH),
            ];
        }

        return $problems;
    }

    /**
     * A new API route that no application has been told about is just as broken
     * as a missing one: it is a hole in the contract that nothing will cover.
     *
     * @param  array<string, Route>  $apiRoutes
     * @return array<int, array{0: string, 1: string}>
     */
    private function checkForUndeclaredRoutes(array $apiRoutes): array
    {
        $declared = array_column($this->operations, 'route');
        $undeclared = array_diff(array_keys($apiRoutes), $declared);

        if ($undeclared === []) {
            return [];
        }

        return [[
            'Undeclared:',
            sprintf(
                'the API serves %s but no operation in the contract mentions %s. Add it, or it will never be reachable from a front end.',
                implode(', ', $undeclared),
                count($undeclared) === 1 ? 'it' : 'them',
            ),
        ]];
    }

    /**
     * Where wayfinder writes the functions for a named route, mirroring the
     * generator's own rule: the last segment of the name is the export, and
     * everything before it is the directory, with index.ts as the leaf.
     */
    private function generatedRoutePath(string $routeName): string
    {
        return $this->generatedRouteDirectory($routeName).'/index.ts';
    }

    /**
     * The module specifier operations.ts must import the function from, which is
     * the directory wayfinder wrote it into. A top-level route name such as
     * `logout` lands in the routes barrel itself, so its directory is `.`.
     */
    private function generatedImport(string $routeName): string
    {
        $directory = $this->generatedRouteDirectory($routeName);

        return $directory === '.'
            ? "from './generated/routes'"
            : sprintf("from './generated/routes/%s'", $directory);
    }

    private function generatedRouteDirectory(string $routeName): string
    {
        $segments = explode('.', $routeName);
        array_pop($segments);

        return $segments === [] ? '.' : implode('/', $segments);
    }
}
