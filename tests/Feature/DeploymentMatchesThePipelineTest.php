<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * The README must not disagree with the pipeline about what the pipeline does.
 *
 * The specification names this as the outstanding documentation problem, and calls
 * the pipeline defaults specifically "the kind of stale value that fails silently
 * at deploy time". It was accurate: the README said `PLATFORM` defaulted to
 * `linux/amd64` and `DEPLOY_USER` to `deploy`, while the `Jenkinsfile` said
 * `linux/arm64` and `ahsanmanzoor`. Both machines are Apple silicon, so the README
 * was not merely wrong but wrong in the direction that would push somebody towards
 * an image their VPS cannot exec.
 *
 * Two parameters had been added to the pipeline and never to the README —
 * `DEPLOY_DIR`, and the `API_URL` that the four front ends bake into their exports
 * — and a reader following the README would not have known either existed. An
 * omission is worse than a wrong value: a wrong value is noticed when the build
 * fails, and a missing parameter is not noticed at all.
 *
 * The Jenkinsfile is the source of truth. It is what actually runs, and the
 * `parameters` block's `defaultValue` is what Jenkins shows in the job UI, so a
 * README value that differs from it is wrong twice over.
 *
 * The assertions are deliberately about *coverage* rather than about prose. Parsing
 * a sentence to check it agrees is brittle and would break on a reword, so instead:
 * every parameter must be mentioned, and every non-empty default must appear
 * somewhere in the same bullet. That catches a stale value, a renamed parameter
 * and a forgotten one, and it does not care how the sentence is written.
 */
class DeploymentMatchesThePipelineTest extends TestCase
{
    /** @var array<string, string> parameter name => default value, empty for none */
    private array $parameters = [];

    /** @var array<int, string> every line of the README */
    private array $readme = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->parameters = $this->pipelineParameters();
        $this->readme = $this->readmeLines();

        $this->assertNotEmpty(
            $this->parameters,
            'No parameters were parsed out of the Jenkinsfile. If the parameters block was '
            .'reformatted, this test is checking nothing and will pass.',
        );
    }

    /**
     * @return array<string, string>
     */
    private function pipelineParameters(): array
    {
        $jenkinsfile = $this->repositoryFile('Jenkinsfile');

        // The `parameters` block, and nothing after it. `options {` follows it, and
        // taking the rest of the file would pick up `environment` values that are
        // not parameters at all.
        if (preg_match('/^    parameters \{(.*?)^    \}/ms', $jenkinsfile, $block) !== 1) {
            return [];
        }

        $parameters = [];

        // `name: 'X'` optionally followed by a `defaultValue: 'Y'` inside the same
        // `string(...)` argument. The default is looked for only between one name
        // and the next, so a `choice`'s `choices:` list is never mistaken for a
        // default and a default from a later parameter cannot be attributed to an
        // earlier one.
        preg_match_all(
            "/name: '([A-Z_]+)',(.*?)(?=name: '|\\z)/s",
            $block[1],
            $matches,
            PREG_SET_ORDER,
        );

        foreach ($matches as $match) {
            $name = $match[1];
            $body = $match[2] ?? '';

            $parameters[$name] = preg_match("/defaultValue: '([^']*)'/", $body, $default) === 1
                ? $default[1]
                : '';
        }

        return $parameters;
    }

    /**
     * @return array<int, string>
     */
    private function readmeLines(): array
    {
        $readme = $this->repositoryFile('README.md');

        return array_values(array_filter(
            explode("\n", $readme),
            static fn (string $line): bool => str_starts_with(ltrim($line), '- `'),
        ));
    }

    private function repositoryFile(string $path): string
    {
        $contents = @file_get_contents(base_path($path));

        $this->assertIsString($contents, "{$path} should be readable.");

        return $contents;
    }

    /** @return array<int, string> the bullets that mention this parameter */
    private function readmeBulletsFor(string $parameter): array
    {
        return array_values(array_filter(
            $this->readme,
            static fn (string $line): bool => str_contains($line, '`'.$parameter.'`'),
        ));
    }

    // ---------------------------------------------------------------------

    public function test_the_readme_documents_every_pipeline_parameter(): void
    {
        $undocumented = [];

        foreach (array_keys($this->parameters) as $name) {
            if ($this->readmeBulletsFor($name) === []) {
                $undocumented[] = $name;
            }
        }

        $this->assertSame(
            [],
            $undocumented,
            'These pipeline parameters are not in the README. A reader following the README '
            .'would not know they exist, and an omitted parameter is worse than a wrong one: '
            .'a wrong value fails loudly, a missing one is not noticed at all.'
        );
    }

    public function test_the_readme_states_the_pipeline_default_for_every_parameter_that_has_one(): void
    {
        foreach ($this->parameters as $name => $default) {
            // An empty default is a deliberate "no default", such as an optional
            // public URL. There is nothing to keep in step, only the requirement
            // itself, which the first test covers by demanding the bullet exists.
            if ($default === '') {
                continue;
            }

            $bullets = $this->readmeBulletsFor($name);

            $this->assertNotSame(
                [],
                $bullets,
                "The README does not mention the {$name} parameter at all.",
            );

            $stale = array_values(array_filter(
                $bullets,
                static fn (string $line): bool => ! str_contains($line, $default),
            ));

            $this->assertSame(
                [],
                $stale,
                "The README's bullet for {$name} does not state the pipeline's default of "
                ."'{$default}'. Either the README is stale or the pipeline is, and the "
                .'pipeline is the one that runs.',
            );
        }
    }

    public function test_the_readme_does_not_claim_a_default_the_pipeline_does_not_have(): void
    {
        // The other direction. A README that invents a default for a parameter the
        // pipeline leaves empty is telling somebody to expect a value that will
        // never be there.
        foreach ($this->parameters as $name => $default) {
            if ($default !== '') {
                continue;
            }

            foreach ($this->readmeBulletsFor($name) as $line) {
                $this->assertDoesNotMatchRegularExpression(
                    '/defaults? to/i',
                    $line,
                    "The README gives {$name} a default, but the pipeline's parameters block "
                    .'gives it none. An invented default is worse than none stated.',
                );
            }
        }
    }

    public function test_the_registry_is_named_in_all_three_places_the_readme_lists(): void
    {
        $readme = $this->repositoryFile('README.md');

        foreach ([
            'Jenkinsfile' => 'IMAGE_NAME',
            'deploy/env.example' => 'APP_IMAGE',
            'deploy/jenkins/secrets/config.example' => 'IMAGE_REPO',
        ] as $file => $variable) {
            $this->assertStringContainsString(
                $file,
                $readme,
                "The README's list of places to change the registry name is missing {$file}.",
            );
            $this->assertStringContainsString(
                $variable,
                $readme,
                "The README should name the {$variable} variable in {$file}.",
            );
        }
    }
}
