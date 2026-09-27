<?php

namespace App\Console\Commands;

use App\Console\ApiClientContract;
use App\Console\ApiDocumentation;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;

/**
 * The OpenAPI document's drift check.
 *
 * Separate from `api-client:check` because the two answer different questions
 * and fail for different reasons. That one regenerates the client and compares
 * it to the contract, and it is about whether a front end can still call what it
 * used to call. This one asks whether the document still describes the API, and
 * it is about whether a reader — or a tool generating a client from the
 * document rather than from the routes — is being told the truth.
 *
 * The overlap is deliberate rather than deduplicated. Both read the same route
 * table, and both compare a committed description against it, because the two
 * descriptions are committed independently and either one can be updated alone.
 * Sharing the comparison would mean one command that passes when both are wrong
 * in the same way, and this repository has already seen a check that passed for
 * the wrong reason.
 */
class ApiDocumentationCheck extends Command
{
    protected $signature = 'api-docs:check';

    protected $description = 'Fail if the OpenAPI document no longer describes the API the back end actually serves';

    /**
     * The prefix bootstrap/app.php mounts routes/api.php under. The same rule
     * ApiClientContractCheck uses, and for the same reason: the health endpoint
     * and any package route are not part of the API a front end calls.
     */
    private const API_PREFIX = 'api/';

    public function handle(): int
    {
        $documentation = ApiDocumentation::load(base_path());
        $contract = ApiClientContract::load(base_path());

        $problems = $documentation->violations($contract, $this->apiRoutes());

        if ($problems === []) {
            $this->components->info(sprintf(
                'The OpenAPI document still describes the API (%d operation(s)).',
                count($documentation->operations()),
            ));

            return self::SUCCESS;
        }

        $this->components->error(sprintf(
            'The OpenAPI document no longer describes the API the back end serves (%s):',
            ApiDocumentation::DOCUMENT_PATH,
        ));

        foreach ($problems as [$what, $detail]) {
            $this->line(sprintf('  <fg=red>%s</> %s', $what, $detail));
        }

        $this->components->warn('If the change is intended, update the document, then re-run this command.');

        return self::FAILURE;
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
