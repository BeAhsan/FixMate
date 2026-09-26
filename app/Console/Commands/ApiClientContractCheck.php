<?php

namespace App\Console\Commands;

use App\Console\ApiClientContract;
use Illuminate\Console\Command;
use Illuminate\Filesystem\Filesystem;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;

/**
 * The drift check: the one check that catches a renamed route before a user does.
 *
 * The generated client is not committed, so `git diff` on it would be vacuous.
 * What is committed instead is the front ends' *expectation* of the contract,
 * in packages/api-client/contract.json, and this command asserts that
 * regenerating the client from the back end's actual routes still produces it.
 *
 * It fails in both directions, because both are real mistakes:
 *
 *   - A route the front ends use no longer exists, moved, or changed verb.
 *   - A new API route was added without the front ends being told about it.
 *
 * The comparison is made against a fresh generation, so this command never
 * depends on whatever happens to be sitting on disk.
 *
 * This command knows nothing about wayfinder. It asks api-client:generate to do
 * the generating and then reads what came out, so a change in the generator's
 * interface stays in GenerateApiClient.
 */
class ApiClientContractCheck extends Command
{
    protected $signature = 'api-client:check';

    protected $description = 'Regenerate the typed API client and fail if it no longer matches what the front ends expect';

    /**
     * The prefix bootstrap/app.php mounts routes/api.php under. Every route a
     * front-end application may call lives below it, which is also what makes a
     * route "the back end's API" rather than scaffolding such as Fortify's own
     * /login, which no application is allowed to call.
     */
    private const API_PREFIX = 'api/';

    public function handle(Filesystem $files): int
    {
        $contract = ApiClientContract::load(base_path());
        $temporary = $this->temporaryOutputPath($files);

        try {
            $exit = Artisan::call('api-client:generate', [
                '--path' => $temporary,
                '--quiet' => true,
            ]);

            if ($exit !== self::SUCCESS) {
                $this->components->error('The typed client could not be generated, so the contract cannot be checked.');

                return self::FAILURE;
            }

            $this->components->info(sprintf('Regenerated the typed client into %s.', $temporary));

            $problems = $contract->violations($temporary, $this->apiRoutes());
        } finally {
            $files->deleteDirectory($temporary);
        }

        if ($problems === []) {
            $this->components->info(sprintf(
                'The generated client still matches the contract (%d operation(s)).',
                count($contract->operations()),
            ));

            return self::SUCCESS;
        }

        $this->components->error('The generated client no longer matches what the front ends expect:');

        foreach ($problems as [$what, $detail]) {
            $this->line(sprintf('  <fg=red>%s</> %s', $what, $detail));
        }

        $this->components->warn(sprintf(
            'If the change is intended, update %s and the operations module in packages/api-client/src, then re-run this command.',
            ApiClientContract::MANIFEST_PATH,
        ));

        return self::FAILURE;
    }

    private function temporaryOutputPath(Filesystem $files): string
    {
        $parent = $files->isDirectory(storage_path('app')) ? storage_path('app') : sys_get_temp_dir();
        $path = $parent.'/api-client-drift-'.bin2hex(random_bytes(6));

        $files->ensureDirectoryExists($path);

        return $path;
    }

    /**
     * Every route the back end serves under the API prefix, keyed by route name.
     *
     * @return array<string, \Illuminate\Routing\Route>
     */
    private function apiRoutes(): array
    {
        $apiRoutes = [];

        foreach (Route::getRoutes() as $route) {
            if (! $route->getName() || ! Str::startsWith($route->uri(), self::API_PREFIX)) {
                continue;
            }

            $apiRoutes[$route->getName()] = $route;
        }

        return $apiRoutes;
    }
}
