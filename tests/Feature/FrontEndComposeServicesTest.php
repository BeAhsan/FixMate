<?php

namespace Tests\Feature;

use Symfony\Component\Yaml\Yaml;
use Tests\TestCase;

/**
 * The four applications have to be declared in three places that are edited by
 * hand, and nothing joins them at run time.
 *
 * The places are `config/applications.php` (the account type and the address),
 * `docker-compose.yml` (how a developer runs one) and `docker-compose.prod.yml`
 * (what the VPS runs). Nothing computes the third from the first: the
 * applications are named as literal YAML keys and the images as literal image
 * references, because a derived name would have to reproduce the `-app` suffix
 * that separates `apps/user` from `user-app` — which is the exact confusion the
 * pipeline's build loop already hit once, failing with "lstat
 * apps/user-app: no such file or directory" after the back end had been pushed
 * under a tag that was then half a release.
 *
 * So the names are written out and this test is what keeps them in step. It
 * exists because of the failure mode the comment in docker-compose.prod.yml
 * warns about: a front end published on an address `config/applications.php`
 * does not grant is a browser whose every request is refused by CORS, and the
 * symptom is a sign-in that fails with no error the sign-in screen is able to
 * show. Nothing else in the system notices — the container is healthy, nginx
 * serves the export, and the request dies at the API's own door.
 *
 * The development stack was the gap this found. It had no front ends at all, so
 * `docker compose up -d --build` brought up the API and nothing to sign in
 * with, and the only way to run an application locally was the production file —
 * which sets `pull_policy: always` and therefore tries to pull locally-built
 * images from a registry that has never heard of them.
 *
 * Symfony's YAML parser is used rather than regular expressions, so re-indenting
 * a compose file does not break this, and it resolves the `<<: *front-end` merge
 * keys — which is what lets the health check and the memory limit be asserted
 * here at all.
 */
class FrontEndComposeServicesTest extends TestCase
{
    /** @var array<string, array{account_type: string, origin: string}> */
    private array $applications;

    /** @var array<string, array<string, mixed>> */
    private array $development;

    /** @var array<string, array<string, mixed>> */
    private array $production;

    protected function setUp(): void
    {
        parent::setUp();

        $this->applications = config('applications');
        $this->development = $this->services('docker-compose.yml');
        $this->production = $this->services('docker-compose.prod.yml');

        // A test that parsed nothing passes every assertion below for the wrong
        // reason, so the parse is asserted rather than assumed. This is the same
        // guard DeploymentMatchesThePipelineTest puts in its setUp.
        $this->assertNotEmpty(
            $this->applications,
            'config/applications.php resolved to nothing, so every assertion here would pass vacuously.',
        );
        $this->assertNotEmpty(
            $this->development,
            'docker-compose.yml yielded no services, so every assertion here would pass vacuously.',
        );
        $this->assertNotEmpty(
            $this->production,
            'docker-compose.prod.yml yielded no services, so every assertion here would pass vacuously.',
        );
    }

    // ---------------------------------------------------------------------

    public function test_there_are_four_applications(): void
    {
        // Not a count for its own sake. Four is the number the other three files
        // in this repository each assert, and a fifth application added here
        // without a compose service would be an application whose origin the back
        // end grants to nothing.
        $this->assertCount(
            4,
            $this->applications,
            'The number of front-end applications changed. Each one needs a service in BOTH compose '
            .'files, a Dockerfile of its own, and an origin here — and the checks that follow all '
            .'name this number.',
        );
    }

    public function test_every_application_has_a_directory_and_a_dockerfile(): void
    {
        foreach (array_keys($this->applications) as $name) {
            $this->assertDirectoryExists(
                base_path("apps/{$name}"),
                "apps/{$name} is missing. The key in config/applications.php names the application's "
                .'directory, so a key with no directory is an application nothing serves.',
            );

            $this->assertFileExists(
                base_path("apps/{$name}/Dockerfile"),
                "apps/{$name}/Dockerfile is missing. Every application is built, pushed, deployed and "
                .'rolled back as its own image, so an application without a Dockerfile is one that '
                .'cannot be built at all.',
            );
        }
    }

    public function test_the_development_stack_builds_one_image_per_application_from_its_own_dockerfile(): void
    {
        foreach (array_keys($this->applications) as $name) {
            $service = $name.'-app';

            $this->assertArrayHasKey(
                $service,
                $this->development,
                "docker-compose.yml has no `{$service}` service, so `docker compose up --build` brings up "
                .'the API with nothing to sign in with. Every application needs a service in development '
                .'as well as in production.',
            );

            // The pair written out, because the image name and the directory name differ by `-app` and
            // that is the thing worth asserting rather than assuming.
            $this->assertSame(
                "apps/{$name}/Dockerfile",
                $this->development[$service]['build']['dockerfile'] ?? null,
                "docker-compose.yml's `{$service}` should build from apps/{$name}/Dockerfile.",
            );

            $this->assertSame(
                "fixmate/{$service}:dev",
                $this->development[$service]['image'] ?? null,
                "docker-compose.yml's `{$service}` should be its own image. A front end sharing an image "
                .'with another front end is a front end that cannot be rolled back on its own, which is '
                .'the whole reason the four are separate.',
            );
        }
    }

    public function test_the_development_front_ends_are_built_against_the_development_api_address(): void
    {
        // APP_URL is what the API is published on in the development stack, and
        // NEXT_PUBLIC_API_URL is baked into each export at build time with no
        // runtime override. If the two drift, a developer's front end is built
        // pointing at an address nothing serves and every request fails in the
        // browser, which is a much worse afternoon than a failing build.
        $api_url = $this->development['app']['environment']['APP_URL'] ?? null;

        $this->assertIsString(
            $api_url,
            'docker-compose.yml does not give the `app` service an APP_URL, so the front ends cannot be '
            .'checked against the address the API is actually published on.',
        );

        foreach (array_keys($this->applications) as $name) {
            $service = $name.'-app';
            $baked = $this->development[$service]['build']['args']['NEXT_PUBLIC_API_URL'] ?? null;

            // The value is a ${VAR:-default} reference, so the default is what
            // matters: it is what a developer with nothing in their .env gets.
            $this->assertSame(
                $api_url,
                $this->defaultOf($baked),
                "docker-compose.yml builds `{$service}` against a different address than docker-compose.yml "
                ."publishes the API on ('{$api_url}'). NEXT_PUBLIC_API_URL is inlined into the export at "
                .'build time and has no runtime override, so this is not a warning — every request from '
                .'that front end fails in the browser.',
            );
        }
    }

    public function test_both_stacks_publish_each_application_where_the_back_end_grants_access(): void
    {
        foreach ($this->applications as $name => $application) {
            $service = $name.'-app';
            $origin = $application['origin'];

            // The whole point of the check. An origin is scheme, host and port,
            // and the port is the part that drifts: move a compose service to a
            // free port to dodge a conflict on your own machine and CORS starts
            // refusing the browser, with the front end healthy and the export
            // served.
            $origin_port = parse_url($origin, PHP_URL_PORT);

            $this->assertNotNull(
                $origin_port,
                "config/applications.php gives '{$name}' an origin of '{$origin}' with no port, so there is "
                .'no port to check the compose files against. An origin without a port cannot be compared '
                .'to a published port, which means the two can disagree with nothing noticing.',
            );

            foreach (['docker-compose.yml' => $this->development, 'docker-compose.prod.yml' => $this->production] as $file => $stack) {
                // Asserted here rather than relied on from another test, because a
                // test that indexes a key another test asserts the presence of
                // fails with an undefined-key error rather than with the reason
                // the service is missing — and each test has to be readable on
                // its own.
                $this->assertArrayHasKey(
                    $service,
                    $stack,
                    "{$file} has no `{$service}` service, so it publishes nothing for that application on "
                    ."any port. config/applications.php grants '{$origin}', which nothing is serving.",
                );

                $this->assertSame(
                    (string) $origin_port,
                    $this->publishedPort($stack[$service]),
                    "{$file} publishes `{$service}` on a different port than config/applications.php grants "
                    ."'{$origin}' on. The front end is healthy and serving its export, and every request it "
                    .'makes to the API is refused by CORS — which surfaces as a sign-in that fails with '
                    .'nothing to show for it.',
                );
            }
        }
    }

    public function test_neither_stack_declares_a_front_end_the_back_end_does_not_know(): void
    {
        $known = array_map(
            static fn (string $name): string => $name.'-app',
            array_keys($this->applications),
        );

        foreach (['docker-compose.yml' => $this->development, 'docker-compose.prod.yml' => $this->production] as $file => $stack) {
            $declared = array_values(array_filter(
                array_keys($stack),
                static fn (string $service): bool => str_ends_with($service, '-app'),
            ));

            sort($declared);
            $expected = $known;
            sort($expected);

            $this->assertSame(
                $expected,
                $declared,
                "{$file} declares front-end services that are not the applications config/applications.php "
                .'lists, or is missing one it lists. A service with no matching application is a front end '
                .'the back end grants no origin to, so every request it makes is refused; an application '
                .'with no matching service is one nobody can reach.',
            );
        }
    }

    public function test_the_development_stack_does_not_ask_compose_to_pull_what_it_builds(): void
    {
        // `pull_policy: always` is correct in production, where every image comes
        // from a registry. In development it makes Compose pull
        // `fixmate/user-app:dev` instead of building it, and the failure is
        // `pull access denied` — which reads like a credentials problem and is
        // not one. Asserted because the production file is the model this one
        // was written from, and the setting would be easy to copy across.
        foreach ($this->development as $service => $definition) {
            if (! str_ends_with($service, '-app')) {
                continue;
            }

            $this->assertArrayNotHasKey(
                'pull_policy',
                $definition,
                "docker-compose.yml sets `pull_policy` on `{$service}`. In development the image is built "
                .'locally, so Compose will try to pull it from a registry that has never heard of it.',
            );
        }
    }

    public function test_both_stacks_build_each_application_from_the_same_dockerfile(): void
    {
        // Each service carries two references to its image - `image` for the
        // registry and `build` for reproducing it from this repository - in both
        // stacks. The two files are edited by hand, so the only thing keeping
        // them pointing at the same Dockerfile is this test.
        //
        // The pairing is the trap: the directory is `apps/user` and the image is
        // `user-app`. A `build.dockerfile` that names the image rather than the
        // directory fails with "lstat apps/user-app: no such file or directory" -
        // the same failure the pipeline's build loop produced on its first front
        // end, after the back end had already been pushed under a tag that was
        // then half a release.
        foreach (array_keys($this->applications) as $name) {
            $service = $name.'-app';

            $this->assertSame(
                "apps/{$name}/Dockerfile",
                $this->production[$service]['build']['dockerfile'] ?? null,
                "docker-compose.prod.yml's `{$service}` should build from apps/{$name}/Dockerfile. The image "
                ."is `{$service}` and the directory is `apps/{$name}`; they differ by an `-app` suffix, and "
                .'naming one in terms of the other produces a path that does not exist.',
            );
        }
    }

    public function test_the_production_front_ends_require_the_api_address_rather_than_defaulting_it(): void
    {
        // NEXT_PUBLIC_API_URL is inlined into the export at build time and has no
        // runtime override. So in production a fallback is worse than a missing
        // value: the build succeeds, the wrong address is baked in, and every
        // request fails in the browser — from a healthy container, serving a
        // correct export, against a back end that is up and serving. The
        // development stack gets a default on purpose, because localhost:8000 is
        // the address that stack actually publishes the API on; that argument does
        // not transfer to a deployment whose API address is not knowable here.
        foreach (array_keys($this->applications) as $name) {
            $service = $name.'-app';
            $arg = $this->production[$service]['build']['args']['NEXT_PUBLIC_API_URL'] ?? null;

            $this->assertIsString(
                $arg,
                "docker-compose.prod.yml's `{$service}` passes no NEXT_PUBLIC_API_URL build argument, so the "
                .'export is built with no address to call and `lib/api.ts` throws at module load.',
            );

            $this->assertMatchesRegularExpression(
                '/^\$\{NEXT_PUBLIC_API_URL:\?.+\}$/',
                $arg,
                "docker-compose.prod.yml's `{$service}` gives NEXT_PUBLIC_API_URL a fallback (\${VAR:-default}) "
                .'rather than requiring it (${VAR:?message}). The value is baked into the image, so a wrong '
                .'default ships a front end that cannot reach its API and reports success while doing it.',
            );
        }
    }

    // ---------------------------------------------------------------------

    /**
     * @return array<string, array<string, mixed>>
     */
    private function services(string $file): array
    {
        $path = base_path($file);

        $this->assertFileExists($path, "{$file} should be readable.");

        $parsed = Yaml::parseFile($path);

        $this->assertIsArray($parsed, "{$file} did not parse into an array.");
        $this->assertArrayHasKey('services', $parsed, "{$file} has no `services` key.");

        return $parsed['services'];
    }

    /**
     * The host port a service publishes, taken from the default in its
     * ${PORT:-NNNN}:80 mapping.
     */
    private function publishedPort(array $service): ?string
    {
        $mapping = $service['ports'][0] ?? null;

        if (! is_string($mapping)) {
            return null;
        }

        return preg_match('/:-(\d+)\}(?::\d+)?$/', $mapping, $matches) === 1 ? $matches[1] : null;
    }

    /**
     * The default inside a ${VAR:-default} or ${VAR:?message} reference, which is
     * the value somebody gets with nothing set.
     */
    private function defaultOf(mixed $reference): ?string
    {
        if (! is_string($reference)) {
            return null;
        }

        return preg_match('/^\$\{[A-Z_]+:-([^}]*)\}$/', $reference, $matches) === 1 ? $matches[1] : null;
    }
}
