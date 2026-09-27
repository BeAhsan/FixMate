<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds `must_change_password` to all four credential stores.
 *
 * Story 21: an account whose password was set by something other than its owner -
 * by `fixmate:create-account`, by a seeder, or by an import - is holding a
 * password nobody chose, and must replace it before it is used for anything.
 *
 * Added to all four tables rather than to a shared `accounts` table because there
 * is no shared table: four stores, four tables, and the flag is a property of a
 * credential in one of them. A fifth account type needs a fifth column, which is
 * the same cost that table already costs.
 *
 * `false` by default, and that default is the whole design. Every account that
 * exists today chose its own password through a reset, so every account that
 * exists today is unaffected: adding the column changes no behaviour, and a
 * deployment of this migration is a no-op for live accounts. Only accounts created
 * *by a system* opt in.
 *
 * `boolean` and not an enum or a timestamp, because there is one bit of state here
 * and no third value. The interesting questions - when it was set, by whom, whether
 * it was acknowledged - are audit-trail questions, and a general audit trail is
 * out of scope in the specification.
 *
 * Indexed? No. The column is read on every authorised request, and an index would
 * not be used: the lookup is by primary key and the flag is a column on the row
 * that has already been fetched. It is not queried across the table anywhere.
 */
return new class extends Migration
{
    /**
     * The four credential stores, by table name.
     *
     * Written out rather than read from `AccountType`, because a migration is a
     * record of what the database looked like on a particular day. Resolving the
     * list from a class that will be edited later means this migration's meaning
     * changes with it: adding a fifth account type would retroactively make this
     * file claim to have touched a table that did not exist when it ran.
     *
     * The expand/contract rule from the deployment notes applies here. This is an
     * additive change with a default, so it is safe to deploy and safe to roll
     * back — the column is ignored by code that predates it.
     */
    private const TABLES = ['users', 'workers', 'admins', 'super_admins'];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->boolean('must_change_password')->default(false);
            });
        }
    }

    public function down(): void
    {
        // Dropped rather than neutralised. Once a deployment has run this, no
        // account should still be flagged — the ones that were would have been
        // forced through the change — so keeping the column serves nothing and
        // leaves four near-empty columns to reason about forever.
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->dropColumn('must_change_password');
            });
        }
    }
};
