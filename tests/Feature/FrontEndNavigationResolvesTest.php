<?php

namespace Tests\Feature;

use App\Domain\IdentityAndAccess\ValueObjects\AccountType;
use Tests\TestCase;

/**
 * Every navigation entry a person of an account type can actually see must have a
 * page behind it.
 *
 * ## Why this is a repository-wide test and not four front-end tests
 *
 * The failure it exists to prevent is *per application* — one application's
 * `sections` list naming a route that application never built — but the way to
 * find it is not. A test inside `apps/admin` can see only `apps/admin`, and it
 * would be one of four files asserting the same property, three of which would
 * have to be edited whenever the set of applications changed. This walks all four
 * from outside, which is the same reasoning that puts the sign-in duplication
 * rule in `FrontEndApplicationsTest` rather than in a per-application vitest file.
 *
 * ## The failure mode
 *
 * Nothing about it is wrong locally. `ApplicationShell` renders whatever `sections`
 * it is handed, so the navigation builds, the image is pushed, every other check
 * passes — and the link 404s for every person who clicks it. It is only
 * observable by following it, which is what no check in this repository did.
 *
 * ## Why it reads the back end's ability sets rather than guessing
 *
 * The first version of this asserted only *ungated* entries, on the reasoning
 * that an entry carrying `requiredAbility` is filtered out for an account without
 * that ability. That reasoning is right about three of the four account types and
 * wrong about the fourth, and the fourth is the one that matters.
 *
 * `canReach` in `@fixmate/ui` is `abilities.includes('*') || abilities.includes(required)`.
 * A super administrator's token carries `*`, so **every** gated entry is reachable
 * for them — including the two in `apps/super-admin` that have no page. Testing
 * only ungated entries reported eight broken links and silently passed over two
 * more, and it would have done so forever, because the entries it skipped are
 * gated and would stay gated.
 *
 * The ability sets are decided in exactly one place, `AccountType::abilities()`,
 * and this test is PHP, so it can read them rather than re-deriving them. A
 * change to an account type's abilities therefore moves what this test demands
 * without this file being touched, which is the property that makes it a guard
 * rather than a snapshot.
 *
 * The two rules it evaluates are kept deliberately in step by their own tests:
 * `packages/ui/test/components.test.ts` asserts `canReach` against the wildcard,
 * and `AccountTypeTest` asserts these four ability sets. If either moves, one of
 * those two fails and says so.
 */
class FrontEndNavigationResolvesTest extends TestCase
{
    /**
     * Every application, mapped to the account type whose door it is.
     *
     * Read from `config/applications.php` rather than written out, because the
     * mapping between an account type and an application's directory is already
     * declared there and a second copy of it in a test is a second thing to keep in
     * step. The config is keyed *by* the application key, with `account_type` as a
     * field inside each entry.
     *
     * @return array<string, string> application key => account type value
     */
    private function applications(): array
    {
        $applications = config('applications');

        $this->assertIsArray($applications, 'config/applications.php should be an array');

        $mapped = [];

        foreach ($applications as $application => $configuration) {
            $this->assertArrayHasKey(
                'account_type',
                $configuration,
                "config/applications.php entry {$application} should name an account_type"
            );

            $mapped[$application] = $configuration['account_type'];
        }

        return $mapped;
    }

    /**
     * Each application's `sections` list, read out of its configuration file.
     *
     * Parsed rather than imported, for two reasons. A front-end test importing
     * `lib/application.ts` would evaluate `resolveApiBaseUrl(process.env
     * .NEXT_PUBLIC_API_URL)` at module scope, and that throws when the address is
     * missing — which it is under `npm test`, because no build has run and the
     * Dockerfile passes the address as a build argument rather than a runtime one.
     * And the file is TypeScript, so it has to be read as text either way.
     *
     * @return list<array{href: string, requiredAbility: string|null}>
     */
    private function sectionsFor(string $application): array
    {
        $path = $this->applicationPath($application).'/lib/application.ts';

        $this->assertFileExists($path);

        $source = file_get_contents($path);

        // Non-greedy and dot-matches-newline, so the match stops at the closing
        // bracket of this array rather than running on into the call below it.
        $this->assertSame(
            1,
            preg_match('/const sections\s*=\s*\[(.*?)\n\]/s', $source, $matches),
            "{$application}/lib/application.ts should declare one literal sections array",
        );

        preg_match_all('/\{([^}]*)\}/s', $matches[1], $entries);

        $sections = [];

        foreach ($entries[1] as $entry) {
            preg_match("/href:\s*'([^']+)'/", $entry, $href);
            preg_match("/requiredAbility:\s*'([^']+)'/", $entry, $ability);

            if ($href === []) {
                continue;
            }

            $sections[] = [
                'href' => $href[1],
                'requiredAbility' => $ability === [] ? null : $ability[1],
            ];
        }

        return $sections;
    }

    /**
     * The routes an application has built, as a static export would write them.
     *
     * A static export turns `/booking-details/` into `booking-details/index.html`,
     * so the source equivalent is `app/booking-details/page.tsx`. Checking the
     * page rather than the export keeps this working on a clean checkout with
     * nothing built, which is the same guarantee `static-export.test.ts` relies on.
     *
     * @return list<string>
     */
    private function routesFor(string $application): array
    {
        $appDirectory = $this->applicationPath($application).'/app';

        $this->assertDirectoryExists($appDirectory);

        /*
         * A recursive iterator and not `glob`, because `glob` has no globstar: it
         * treats a doubled asterisk as a single one, so it matches
         * `app/account/page.tsx` and *not* `app/page.tsx` — the dashboard, because
         * that is zero directories rather than one.
         *
         * The first version used `glob` and reported `/` dead in all four
         * applications, which reads exactly like a catastrophic finding and is in
         * fact a missing file-glob feature. The dashboard is the one route every
         * application certainly has.
         *
         * (Written as a line comment rather than a docblock because the glob
         * pattern contains a comment terminator, and a docblock would end inside
         * its own first sentence.)
         */
        $pages = [];

        $files = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($appDirectory, \FilesystemIterator::SKIP_DOTS),
        );

        foreach ($files as $file) {
            if ($file->isFile() && $file->getFilename() === 'page.tsx') {
                $pages[] = $file->getPathname();
            }
        }

        $routes = [];

        foreach ($pages as $page) {
            // The dashboard's page is `app/page.tsx`, whose directory *is* `app/`,
            // so the relative path trims to the empty string. That empty string is
            // the root route, and it is matched as such below.
            $routes[] = trim(str_replace($appDirectory, '', dirname($page)), '/');
        }

        return $routes;
    }

    private function applicationPath(string $application): string
    {
        return dirname(__DIR__, 2)."/apps/{$application}";
    }

    /**
     * Can this account type reach this section?
     *
     * The same rule as `canReach` in `@fixmate/ui`, written out rather than
     * imported because that is TypeScript in another package and this is PHP. The
     * duplication is deliberate and bounded: two lines, and the front-end copy is
     * asserted by its own test. Copying the *import* would be worse — it would
     * make this test's demand depend on a JavaScript file being parsed by a PHP
     * test runner.
     *
     * @param  list<string>  $abilities
     */
    private function canReach(array $abilities, ?string $required): bool
    {
        if ($required === null) {
            return true;
        }

        return in_array('*', $abilities, true) || in_array($required, $abilities, true);
    }

    public function test_every_reachable_navigation_entry_has_a_page(): void
    {
        $dead = [];

        foreach ($this->applications() as $application => $accountType) {
            $abilities = AccountType::from($accountType)->abilities();
            $routes = $this->routesFor($application);

            foreach ($this->sectionsFor($application) as $section) {
                if (! $this->canReach($abilities, $section['requiredAbility'])) {
                    continue;
                }

                $route = trim($section['href'], '/');

                if (! in_array($route, $routes, true)) {
                    $dead[] = "{$application} ({$accountType}): {$section['href']}";
                }
            }
        }

        $this->assertSame(
            [],
            $dead,
            'these navigation entries are reachable by the account type they sit in, '
            .'and point at routes with no page behind them. Nothing fails at build time '
            .'— the shell renders whatever it is handed — so the link 404s for every '
            .'person who clicks it. Either build the page or remove the entry.'
        );
    }

    public function test_every_unreachable_entry_without_a_page_is_declared_deliberately(): void
    {
        /*
         * The complement of the assertion above, and the reason it is worth stating.
         *
         * An entry no account of an application can reach is not a broken link —
         * nobody is shown it — but it is still a route the application declares it
         * will offer, and "we have not built it yet" is a decision somebody has to
         * make rather than an accident.
         *
         * Asserted in both directions. An entry that has become reachable must
         * leave this list (the test above will then demand a page for it), and an
         * entry whose page has been built should leave it too, because a stale
         * declaration is one more thing that has quietly stopped being true.
         */
        $declared = [
            // The evidence that the ability filter runs on this application: this
            // account type carries `users:*` and nothing else, so it is hidden
            // here while the same entry is shown to a super administrator.
            'user' => ['/accounts/'],
            // An administrator carries `admins:*`, which does not include
            // `accounts:read`, so this entry cannot be shown to an administrator
            // either. Whether that is intended — an administrator being kept out
            // of the account list — is a product question, and it is recorded here
            // rather than answered here.
            'admin' => ['/accounts/'],
        ];

        foreach ($this->applications() as $application => $accountType) {
            $abilities = AccountType::from($accountType)->abilities();
            $routes = $this->routesFor($application);
            $unreachableWithoutPage = [];

            foreach ($this->sectionsFor($application) as $section) {
                if ($section['requiredAbility'] === null) {
                    continue;
                }
                $route = trim($section['href'], '/');
                if (in_array($route, $routes, true)) {
                    continue;
                }
                if ($this->canReach($abilities, $section['requiredAbility'])) {
                    continue;
                }
                $unreachableWithoutPage[] = $section['href'];
            }
            $declaredForApp = $declared[$application] ?? [];
            sort($declaredForApp);
            sort($unreachableWithoutPage);
            $this->assertSame(
                $declaredForApp,
                $unreachableWithoutPage,
                "{$application}'s unreachable entries with no page have changed. If a page "
                .'now exists, or the entry has become reachable, remove it from the '
                .'declared list — the first test will then demand a page.'
            );
        }
    }

    public function test_every_application_declares_a_dashboard_entry(): void
    {
        /*
         * The floor. An application with no unconditional entry has no landing
         * page, and that is true whether or not the entries above resolve — both
         * of the other tests pass vacuously on an empty list, because "no broken
         * links" is trivially true of a navigation nobody can use.
         */
        foreach (array_keys($this->applications()) as $application) {
            $unconditional = array_filter(
                $this->sectionsFor($application),
                fn (array $section): bool => $section['requiredAbility'] === null,
            );

            $this->assertNotEmpty(
                $unconditional,
                "{$application} should declare at least one navigation entry that needs no ability"
            );

            $this->assertContains(
                '/',
                array_column($unconditional, 'href'),
                "{$application}'s first navigation entry should be its dashboard at /"
            );
        }
    }

    public function test_the_config_names_a_page_for_every_account_type(): void
    {
        /*
         * This test walks `config/applications.php`, so it only covers the account
         * types declared there. A fifth account type with no application would be
         * invisible to every assertion above, and this says so rather than letting
         * that happen quietly.
         */
        $this->assertCount(
            count(AccountType::cases()),
            config('applications'),
            'every account type should have an application in config/applications.php, '
            .'or this test does not cover it'
        );
    }

    public function test_no_route_recorded_as_unbuilt_has_a_page(): void
    {
        /*
         * `routes_not_yet_built` in `config/applications.php` is where the intent
         * behind a removed navigation entry is kept, so that "this application will
         * have a jobs screen" survives not being one yet.
         *
         * The list is only worth anything while it is true, and it can stop being
         * true in two ways. A page is built and the entry is not removed, and the
         * list then says something the repository no longer means. That is the
         * version asserted here.
         */
        $builtButStillRecorded = [];

        foreach ($this->applications() as $application => $accountType) {
            $routes = $this->routesFor($application);

            foreach ($this->routesNotYetBuilt($application) as $route) {
                $normalised = trim($route, '/');

                if (in_array($normalised, $routes, true)) {
                    $builtButStillRecorded[] = "{$application}: {$route}";
                }
            }
        }

        $this->assertSame(
            [],
            $builtButStillRecorded,
            'these routes are recorded as unbuilt but a page exists for them. Remove them '
            .'from routes_not_yet_built and restore their navigation entry — restoring '
            .'one is two edits in one commit, so the link and the screen land together.'
        );
    }

    public function test_no_route_recorded_as_unbuilt_is_in_the_navigation(): void
    {
        /*
         * The other direction, and the one that would otherwise be invisible.
         *
         * An entry in both `sections` and `routes_not_yet_built` means a link that
         * 404s has been put back while the route is still recorded as having no
         * page. The first test in this file catches that too, so this is not a new
         * failure — it is a second, more specific message naming the stale record,
         * because the fix is to remove the entry from one list or the other and
         * knowing which one is stale is the whole of the work.
         */
        $bothPlaces = [];

        foreach ($this->applications() as $application => $accountType) {
            $hrefs = array_column($this->sectionsFor($application), 'href');

            foreach ($this->routesNotYetBuilt($application) as $route) {
                if (in_array($route, $hrefs, true)) {
                    $bothPlaces[] = "{$application}: {$route}";
                }
            }
        }

        $this->assertSame(
            [],
            $bothPlaces,
            'these routes are recorded as unbuilt and also present in the navigation. '
            .'The navigation entry is a link to nothing: either remove the entry or '
            .'remove the route from routes_not_yet_built.'
        );
    }

    public function test_every_application_records_its_unbuilt_routes_as_a_list(): void
    {
        /*
         * The key is present on all four, even where it is empty.
         *
         * This is a small thing, and it is here because a missing key reads exactly
         * like an empty one. `config('applications.worker.routes_not_yet_built')`
         * returns `null` for an application with no key and `[]` for one with an
         * empty key, and the two mean different things — "this door has nothing
         * planned" and "nobody has decided yet" — while every caller here treats
         * them identically. Stating that all four have declared the key means the
         * difference cannot be introduced by accident.
         */
        foreach (array_keys($this->applications()) as $application) {
            $value = config("applications.{$application}.routes_not_yet_built");

            $this->assertIsArray(
                $value,
                "{$application} should declare routes_not_yet_built as a list, even if "
                .'that list is empty'
            );
        }
    }

    /**
     * The routes an application has declared it will serve but has not built.
     *
     * @return list<string>
     */
    private function routesNotYetBuilt(string $application): array
    {
        return config("applications.{$application}.routes_not_yet_built") ?? [];
    }
}
