<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * The four applications exist as four *thin* applications, and that is the
 * property this test exists to keep.
 *
 * The spec's arrangement is one repository, four front ends, shared packages. The
 * failure mode it names explicitly is the interesting one: an application that
 * grows its own copy of the sign-in flow or the shell. Nothing about that breaks
 * — every application still builds, still runs, still signs in — and the cost is
 * paid later, as four copies of a security flow that drift apart. By then the
 * duplication is invisible in review because each copy is individually reasonable.
 *
 * So it is asserted here, over the whole repository, from outside the workspace.
 * The alternative — trusting four sets of eyes — is how four copies arrive.
 */
class FrontEndApplicationsTest extends TestCase
{
    private const APPLICATIONS = ['user', 'worker', 'admin', 'super-admin'];

    /**
     * Files that are allowed to be identical across applications.
     *
     * A short list, and every entry has a reason:
     *
     * - `test/static-export.test.ts` tests a property of the *packaging*, which
     *   is the same everywhere. It is the one genuinely duplicated file per
     *   application, and allowing it by name is cheaper than inventing a shared
     *   location for a test that has to be runnable from inside each application.
     * - `next.config.ts`, `postcss.config.mjs` and `tsconfig.json` are three lines
     *   of configuration each, and a shared one would need a parameterised import
     *   to know which application it was configuring.
     * - `app/globals.css` is the Tailwind entry point. It differs by nothing
     *   today; if one application ever needs a rule of its own, the test below
     *   will say so precisely.
     * - `.env.example` is a template for the build argument, and there is one
     *   value in it.
     * - `app/providers.tsx`, `app/sign-in/page.tsx` and
     *   `app/change-password/page.tsx` are **pure delegation**. Each renders one
     *   component imported from `@fixmate/session` and contains no logic, so there
     *   is nothing in them an application could legitimately want to change: what
     *   differs between the four is which operations the session binds, and that
     *   lives in `lib/application.ts`. They are identical because they are not
     *   allowed to be anything else — the test above fails if one of them grows a
     *   `<form>` or a `fetch`.
     */
    private const ALLOWED_IDENTICAL = [
        'test/static-export.test.ts',
        'next.config.ts',
        'postcss.config.mjs',
        'tsconfig.json',
        'app/globals.css',
        '.env.example',
        'app/providers.tsx',
        'app/sign-in/page.tsx',
        'app/change-password/page.tsx',
    ];

    public function test_all_four_applications_exist(): void
    {
        foreach (self::APPLICATIONS as $application) {
            $this->assertDirectoryExists(
                base_path("apps/{$application}"),
                "the {$application} application does not exist",
            );
            $this->assertFileExists(
                base_path("apps/{$application}/Dockerfile"),
                "the {$application} application has no Dockerfile of its own",
            );
        }
    }

    /**
     * Every application is a deployable image in its own right.
     *
     * Four Dockerfiles rather than one parameterised by name, because the four
     * are built, pushed, health-checked and rolled back separately. Asserted as
     * four files rather than a naming convention because a convention is a
     * promise and this is a check.
     */
    public function test_each_application_builds_its_own_image(): void
    {
        foreach (self::APPLICATIONS as $application) {
            $dockerfile = (string) file_get_contents(base_path("apps/{$application}/Dockerfile"));

            // The context is the repository root, never the application's own
            // directory: the workspace hoists node_modules to the root and
            // `npm ci` needs a lockfile naming every member.
            $this->assertStringContainsString(
                "-f apps/{$application}/Dockerfile",
                $dockerfile,
                "the {$application} Dockerfile does not document building itself",
            );
            $this->assertStringContainsString(
                "npm run build --workspace=@fixmate/{$application}-app",
                $dockerfile,
                "the {$application} Dockerfile does not build its own workspace member",
            );
        }
    }

    /**
     * No application contains a copy of the sign-in flow.
     *
     * Checked by fingerprint rather than by file size or by a list of expected
     * files, because both rot. A `<form>`, a `fetch` call or a router call under
     * an application's `app/` directory is the shape a copied sign-in screen
     * takes, and it is the thing that must not happen.
     */
    public function test_no_application_contains_a_copy_of_the_sign_in_flow(): void
    {
        foreach ($this->applicationSourceFiles() as $application => $files) {
            foreach ($files as $file) {
                $contents = (string) file_get_contents($file);

                // The sign-in page delegates to the shared screen. Anything that
                // builds a form, talks to the network, or navigates is a copy.
                if (! str_contains($file, 'app/sign-in/page.tsx')) {
                    continue;
                }

                $this->assertDoesNotMatchRegularExpression(
                    '/<form|fetch\(|router\.(push|replace)|operations\./',
                    $this->withoutComments($contents),
                    "{$application} contains a copy of the sign-in flow in {$file}. "
                    .'Import SignInScreen from @fixmate/session instead.',
                );
            }
        }
    }

    /**
     * No application contains a copy of the shell.
     *
     * The shell is `<AppShell>` from `@fixmate/ui`. An application that rendered
     * its own header and navigation would have copied it, and the four would
     * begin to differ in ways nobody chose.
     */
    public function test_no_application_contains_a_copy_of_the_shell(): void
    {
        foreach ($this->applicationSourceFiles() as $application => $files) {
            foreach ($files as $file) {
                $contents = $this->withoutComments((string) file_get_contents($file));

                $this->assertStringNotContainsString(
                    '<header',
                    $contents,
                    "{$application} appears to render its own header in {$file}. "
                    .'Use ApplicationShell from @fixmate/session.',
                );
            }
        }
    }

    /**
     * No application names another account type's operations.
     *
     * The front end's copy of a rule the back end also enforces. If an
     * application could name `signInAdmin`, the only thing stopping it would be
     * the back end's `account.can` — and the failure would be a 403 at sign-in
     * rather than a failed build. Asserting it here means the mistake is a
     * failing test.
     */
    public function test_no_application_names_another_account_type_operations(): void
    {
        $operations = [
            'signInUser', 'signInWorker', 'signInAdmin', 'signInSuperAdmin',
            'renewSessionUser', 'renewSessionWorker', 'renewSessionAdmin', 'renewSessionSuperAdmin',
            'signOutUser', 'signOutWorker', 'signOutAdmin', 'signOutSuperAdmin',
            'currentUser', 'currentWorker', 'currentAdmin', 'currentSuperAdmin',
        ];

        foreach ($this->applicationSourceFiles() as $application => $files) {
            foreach ($files as $file) {
                // The one file allowed to name this application's own key, which
                // is how the session layer knows which door to use. The map from
                // that key to the operations lives in @fixmate/session, and
                // `FrontEndSessionMapTest` checks it against the back end.
                if (str_contains($file, 'lib/application.ts')) {
                    continue;
                }

                $contents = (string) file_get_contents($file);

                foreach ($operations as $operation) {
                    $this->assertStringNotContainsString(
                        $operation,
                        $contents,
                        "{$application} names the operation {$operation} in {$file}. "
                        .'Operations are bound to an application by @fixmate/session, not by the application itself.',
                    );
                }
            }
        }
    }

    /**
     * Each application's definition is the only place it names itself.
     *
     * `application: '<key>'` is what the session layer turns into four
     * operations, and it is deliberately not an account type string. An
     * application that said `accountType: 'admins'` would be a second place
     * where the mapping from application to store is decided.
     */
    public function test_each_application_declares_exactly_its_own_key(): void
    {
        foreach (self::APPLICATIONS as $application) {
            $definition = (string) file_get_contents(base_path("apps/{$application}/lib/application.ts"));

            $this->assertMatchesRegularExpression(
                "/application:\s*'".preg_quote($application, '/')."'/",
                $definition,
                "the {$application} application does not declare its own key",
            );

            $this->assertDoesNotMatchRegularExpression(
                '/accountType:\s*/',
                $definition,
                "the {$application} definition names an account type directly; "
                .'the application key is what the session layer maps.',
            );
        }
    }

    /**
     * The files that are allowed to be identical really are, and nothing else is.
     *
     * Two halves, and both matter. The first catches an unlisted copy. The second
     * catches an entry in {@see self::ALLOWED_IDENTICAL} that has quietly stopped
     * being true — a "these may match" list that grows to excuse whatever is
     * there stops meaning anything at all.
     */
    public function test_only_the_allowed_files_are_identical_across_applications(): void
    {
        $reference = 'user';
        $digests = [];

        foreach (self::APPLICATIONS as $application) {
            foreach ($this->allFiles("apps/{$application}") as $relative) {
                $digests[$relative][$application] = md5_file(base_path("apps/{$application}/{$relative}"));
            }
        }

        $unexpected = [];
        $staleAllowances = [];

        foreach ($digests as $relative => $perApplication) {
            // Present in all four is part of the claim. Without this, a file
            // that exists in exactly one application has one distinct digest and
            // reads as "identical everywhere" — which is how a README in one
            // application would be reported as unlisted duplication.
            if ($relative === 'README.md') {
                // Per-application documentation, and expected to differ: it names
                // the image and the address. Checked on its own terms below.
                continue;
            }

            if (count($perApplication) !== count(self::APPLICATIONS)) {
                $missing = array_diff(self::APPLICATIONS, array_keys($perApplication));

                $this->assertSame(
                    [],
                    $missing,
                    "{$relative} exists in some applications and not others. "
                    .'Every application should have the same set of files, or the difference is deliberate and belongs in a test.',
                );

                continue;
            }

            $distinct = array_unique($perApplication);

            if (count($distinct) === 1) {
                if (! in_array($relative, self::ALLOWED_IDENTICAL, true)) {
                    $unexpected[] = $relative;
                }

                continue;
            }

            // Allowed to differ, and did not. The allowance is stale.
            if (in_array($relative, self::ALLOWED_IDENTICAL, true)) {
                $staleAllowances[] = $relative;
            }
        }

        $this->assertSame(
            [],
            $unexpected,
            'these files are identical in all four applications but are not on the allowed list. '
            .'Either the duplication is a mistake, or the file belongs on the list with a reason.',
        );

        $this->assertSame(
            [],
            $staleAllowances,
            'these files are on the allowed-identical list but differ between applications, '
            .'so the allowance has stopped meaning anything. Remove it.',
        );
    }

    /**
     * Every application builds a page the packaging check can identify.
     *
     * Each carries its own `data-export-marker`, so a check that fetches the four
     * images can tell which is which. A shared marker would pass a test that only
     * looked at one of them.
     */
    public function test_each_application_marks_its_own_export(): void
    {
        foreach (self::APPLICATIONS as $application) {
            $page = (string) file_get_contents(base_path("apps/{$application}/app/page.tsx"));

            $this->assertStringContainsString(
                "data-export-marker=\"{$application}-app\"",
                $page,
                "the {$application} application does not carry its own export marker",
            );
        }
    }

    /**
     * Every application declares the three scripts the workspace root relies on.
     *
     * The root `build` does not pass `--if-present`, so a member without a
     * `build` script fails the whole build — deliberately, because a front end
     * that silently does not build is a front end nobody notices is broken.
     */
    public function test_every_application_declares_the_scripts_the_root_build_needs(): void
    {
        foreach (self::APPLICATIONS as $application) {
            $manifest = json_decode(
                (string) file_get_contents(base_path("apps/{$application}/package.json")),
                true,
                flags: JSON_THROW_ON_ERROR,
            );

            foreach (['build', 'typecheck', 'test'] as $script) {
                $this->assertArrayHasKey(
                    $script,
                    $manifest['scripts'] ?? [],
                    "the {$application} application declares no {$script} script",
                );
            }

            // The three shared packages, by name. An application that reached for
            // a relative path across the workspace would be depending on the
            // directory layout rather than on the package.
            foreach (['@fixmate/api-client', '@fixmate/session', '@fixmate/ui'] as $package) {
                $this->assertArrayHasKey(
                    $package,
                    $manifest['dependencies'] ?? [],
                    "the {$application} application does not depend on {$package}",
                );
            }
        }
    }

    /**
     * Every application documents itself, and names its own image.
     *
     * The four READMEs are the one set of files that is *expected* to differ —
     * each names the image it builds and the port it is published on, and a
     * shared one would name the wrong one. So they are checked for the property
     * that actually matters instead of being compared for equality.
     */
    public function test_every_application_documents_its_own_image(): void
    {
        foreach (self::APPLICATIONS as $application) {
            $readme = base_path("apps/{$application}/README.md");

            $this->assertFileExists($readme, "the {$application} application has no README");
            $this->assertStringContainsString(
                "fixmate/{$application}-app",
                (string) file_get_contents($readme),
                "the {$application} README does not name its own image",
            );
        }
    }

    /**
     * Strip comments before fingerprinting.
     *
     * A comment is not code, and a rule expressed as a fingerprint has to ignore
     * prose or it fails on the documentation of the rule — which is exactly what
     * happened here: the sign-in page's own docblock names `<form>`, `fetch` and
     * `router.push` while explaining that it must contain none of them.
     */
    private function withoutComments(string $source): string
    {
        $withoutBlocks = preg_replace('#/\*.*?\*/#s', '', $source) ?? $source;

        return preg_replace('#(^|[^:])//.*$#m', '$1', $withoutBlocks) ?? $withoutBlocks;
    }

    /**
     * Source files under an application's `app/` and `lib/`, keyed by application.
     *
     * @return array<string, list<string>>
     */
    private function applicationSourceFiles(): array
    {
        $files = [];

        foreach (self::APPLICATIONS as $application) {
            $found = [];

            foreach (['app', 'lib'] as $directory) {
                foreach ($this->allFiles("apps/{$application}/{$directory}") as $relative) {
                    if (str_ends_with($relative, '.tsx') || str_ends_with($relative, '.ts')) {
                        // The walked directory is part of the path. Dropping it
                        // produced `apps/user/layout.tsx` for a file that lives at
                        // `apps/user/app/layout.tsx`.
                        $found[] = base_path("apps/{$application}/{$directory}/{$relative}");
                    }
                }
            }

            $files[$application] = $found;
        }

        return $files;
    }

    /**
     * Every file under a directory, relative to it, excluding build output.
     *
     * @return list<string>
     */
    private function allFiles(string $directory): array
    {
        $root = base_path($directory);

        if (! is_dir($root)) {
            return [];
        }

        $found = [];
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS),
        );

        foreach ($iterator as $file) {
            $relative = substr((string) $file->getPathname(), strlen($root) + 1);

            // Build output and installed dependencies are not source, and
            // comparing them across applications would compare several hundred
            // generated files. The first segment is checked as well as the whole
            // path, because at an application's root the relative path *begins*
            // with the directory name and `str_contains('/out/')` misses it.
            $segments = explode('/', $relative);
            // `next-env.d.ts` is written by `next build` and is gitignored; it
            // exists only in an application somebody has built locally, which
            // would otherwise read as a difference between the four.
            $excluded = ['out', '.next', 'node_modules', 'next-env.d.ts', 'tsconfig.tsbuildinfo'];

            if (in_array($segments[0], $excluded, true) || str_contains($relative, 'node_modules')) {
                continue;
            }

            $found[] = $relative;
        }

        sort($found);

        return $found;
    }
}
