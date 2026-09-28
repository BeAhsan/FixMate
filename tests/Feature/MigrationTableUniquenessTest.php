<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * Two migrations must never create the same table.
 *
 * This guard exists because a stale untracked migration can survive a pull
 * silently when its filename differs from the pushed one — the pull does not
 * conflict, both files land, and the failure appears at test time as a
 * "table already exists" error whose cause points nowhere near the real
 * problem. This test catches that at the repository level before it can
 * reach a database.
 *
 * Every migration file in database/migrations/ is read, and every table name
 * passed to Schema::create(...) is extracted. A table claimed by two
 * different migration files is a failure naming both files.
 */
class MigrationTableUniquenessTest extends TestCase
{
    /** @var array<string, list<string>> table name => migration files that create it */
    private array $claims = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->claims = $this->extractClaims();
    }

    /**
     * @return array<string, list<string>>
     */
    private function extractClaims(): array
    {
        $migrations = glob(base_path('database/migrations/*.php'));

        $claims = [];

        foreach ($migrations as $file) {
            $contents = file_get_contents($file);

            // Extract every table name passed to Schema::create('name', ...)
            preg_match_all("/Schema::create\('([^']+)'/", $contents, $matches);

            foreach ($matches[1] as $table) {
                $claims[$table][] = basename($file);
            }
        }

        return $claims;
    }

    public function test_no_two_migrations_create_the_same_table(): void
    {
        $duplicates = array_filter(
            $this->claims,
            static fn (array $files): bool => count($files) > 1,
        );

        $this->assertEmpty(
            $duplicates,
            'The following tables are created by more than one migration file: '
            .collect($duplicates)->map(
                static fn (array $files, string $table): string => "{$table} is claimed by ".implode(' and ', $files),
            )->join('; ').'.',
        );
    }

    public function test_every_migration_file_is_parsed_for_schema_create_calls(): void
    {
        $this->assertNotEmpty(
            $this->claims,
            'No Schema::create calls were found in any migration file. The '
            .'extraction regex may need updating, and this test is checking '
            .'nothing.',
        );
    }
}
