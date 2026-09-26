<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;

/**
 * Produces the generated typed client that all four front-end applications import.
 *
 * This class is the ONLY place in the repository that knows laravel/wayfinder's
 * interface: which artisan command to run, which flags it takes, and where its
 * output lands. Wayfinder is in public beta and that interface may change, so
 * when it does, the fix is made here and nowhere else. The TypeScript package
 * that consumes the output knows nothing about wayfinder at all.
 *
 * Generation is an explicit step rather than a Vite plugin hook because the back
 * end no longer has a front-end build to hang it on. It runs in the throwaway
 * PHP container, before the front-end images are built from the same workspace.
 *
 * The generated output is NOT committed. See ApiClientContractCheck for the
 * check that stands in for committing it.
 */
class GenerateApiClient extends Command
{
    /**
     * The wayfinder artisan command, with every flag it is given.
     *
     * Held as a constant so that a change in wayfinder's interface is a change
     * to one string, and so the command below reads as "run the generator".
     */
    private const GENERATOR = 'wayfinder:generate';

    /**
     * Where the generated TypeScript is written, relative to the repository root.
     *
     * Under `src/generated/` rather than `src/` directly, because wayfinder
     * prunes every file it did not write from the directories it owns. Anything
     * hand-written must live outside those directories or it will be deleted.
     */
    public const OUTPUT_PATH = 'packages/api-client/src/generated';

    protected $signature = 'api-client:generate
                            {--path= : Write somewhere other than the shared package, for the drift check}';

    protected $description = 'Generate the shared typed API client from this application\'s routes';

    public function handle(): int
    {
        // A cached route file is a previous deployment's route list. Generating
        // from it produces a client for routes that no longer exist, so the
        // cache is cleared first every time.
        Artisan::call('route:clear', ['--quiet' => true]);

        $path = $this->option('path') ?: static::outputPath();

        $this->components->info(sprintf('Generating the typed API client into %s', $path));

        $exit = Artisan::call(static::GENERATOR, [
            '--path' => $path,
            '--with-form' => true,
        ]);

        if ($exit !== self::SUCCESS) {
            $this->components->error('Wayfinder generation failed.');

            return self::FAILURE;
        }

        $this->components->info('Typed API client generated.');

        return self::SUCCESS;
    }

    /**
     * The absolute path of the generated output inside the shared package.
     */
    public static function outputPath(): string
    {
        return base_path(static::OUTPUT_PATH);
    }
}
