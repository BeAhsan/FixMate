<?php

namespace Tests\Feature;

use App\Application\IdentityAndAccess\Exceptions\CannotPromoteSelf;
use App\Application\IdentityAndAccess\Exceptions\CannotSuspendSelf;
use App\Application\IdentityAndAccess\UseCases\PromoteAdminToSuperAdmin;
use App\Application\IdentityAndAccess\UseCases\SuspendAdminAccount;
use App\Domain\IdentityAndAccess\ValueObjects\Ability;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;
use App\Models\Admin;
use App\Models\SuperAdmin;
use App\Models\User;
use App\Models\Worker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\NewAccessToken;
use Tests\TestCase;

/**
 * A super administrator managing accounts across the whole platform.
 *
 * Ticket 11, written and recorded as done, with no commit behind it. This is the
 * test that would have said so, and the reason it is worth writing carefully is
 * that the absence was invisible: the use cases did not exist, the routes did not
 * exist, and nothing in the suite was looking for them.
 *
 * Every assertion is made from outside the application, over HTTP, with a real
 * token. A unit test of a use case would pass whether or not the route was wired
 * to it, whether or not the route was guarded, and whether or not the guard
 * resolved the right token — which is the wiring, and the wiring is the part that
 * is easy to get wrong and impossible to see from the inside.
 */
class SuperAdministerAccountsTest extends TestCase
{
    use RefreshDatabase;

    private const ACCOUNTS = '/api/v1/identity/accounts';

    private const ADMINS = '/api/v1/identity/admins/';

    private const ADMINS_ME = '/api/v1/identity/admins/me';

    private const ADMINS_RENEW = '/api/v1/identity/admins/session/renew';

    // ---------------------------------------------------------------------
    // The directory: every account, every type, one list. Story 40.
    // ---------------------------------------------------------------------

    public function test_a_super_administrator_sees_every_account_across_all_four_types(): void
    {
        $user = User::factory()->create(['name' => 'A Customer']);
        $worker = Worker::factory()->create(['name' => 'A Worker']);
        $admin = Admin::factory()->create(['name' => 'An Administrator']);
        $superAdmin = SuperAdmin::factory()->create(['name' => 'A Super Administrator']);

        // The caller is a fifth account and is in the directory like any other —
        // a super administrator auditing who has access can see themselves, and
        // that is not a leak. The four created above are asserted by name so the
        // caller's presence neither satisfies nor breaks the assertion.
        $response = $this->actingAsToken($this->superAdminToken())
            ->getJson(self::ACCOUNTS)
            ->assertOk();

        $rows = collect($response->json('data'));

        $this->assertCount(5, $rows, 'Four accounts plus the caller who is asking.');

        // The account type is on every row, so a list mixing four types is
        // self-describing rather than four lists a front end has to correlate.
        // Grouped, in the domain's own order of account types.
        $this->assertSame(
            ['users', 'workers', 'admins', 'super_admins'],
            $rows->pluck('type')->unique()->values()->all(),
            'The rows should come back grouped by account type, in the domain\'s own order.',
        );

        $names = $rows->pluck('name')->all();
        foreach (['A Customer', 'A Worker', 'An Administrator', 'A Super Administrator'] as $name) {
            $this->assertContains($name, $names, "'{$name}' should be in the directory.");
        }

        // Each row carries its own store's identifier, and identifiers are only
        // meaningful together with the type — the directory is the proof that a
        // bare number from one table says nothing about another.
        $this->assertSame($user->id, $rows->firstWhere('name', 'A Customer')['id']);
        $this->assertSame($superAdmin->id, $rows->firstWhere('name', 'A Super Administrator')['id']);
    }

    public function test_the_directory_reports_each_accounts_own_status(): void
    {
        Admin::factory()->create(['status' => 'active']);
        Admin::factory()->create(['status' => 'suspended']);
        Admin::factory()->create(['status' => 'pending']);

        $rows = $this->actingAsToken($this->superAdminToken())
            ->getJson(self::ACCOUNTS)
            ->assertOk()
            ->json('data');

        // Filtered to administrators. The token helper creates a super
        // administrator caller, who is in the directory too and is active, so
        // reading every row's status would pick up a fourth value this assertion is
        // not about.
        $statuses = array_column(
            array_values(array_filter($rows, fn (array $row): bool => $row['type'] === 'admins')),
            'status',
        );
        sort($statuses);

        // Suspended and pending accounts are listed, not hidden. A directory that
        // omitted them would make a suspension indistinguishable from a deletion,
        // which is the outcome this whole surface exists to prevent.
        $this->assertSame(['active', 'pending', 'suspended'], $statuses);
    }

    public function test_the_directory_carries_no_password_material(): void
    {
        Admin::factory()->create();

        $row = $this->actingAsToken($this->superAdminToken())
            ->getJson(self::ACCOUNTS)
            ->assertOk()
            ->json('data.0');

        // Asserted by key rather than by value: the point is that no field of this
        // name may appear, and a hash would differ on every run.
        $this->assertArrayNotHasKey('password', $row);
        $this->assertArrayNotHasKey('password_hash', $row);
        $this->assertArrayNotHasKey('passwordHash', $row);
        $this->assertSame(
            ['type', 'id', 'name', 'email', 'status'],
            array_keys($row),
            'The row should carry exactly these five fields and no others.',
        );
    }

    public function test_the_directory_is_refused_to_every_account_type_but_a_super_administrator(): void
    {
        Admin::factory()->create();

        $this->actingAsToken($this->userToken())->getJson(self::ACCOUNTS)->assertForbidden();
        $this->actingAsToken($this->workerToken())->getJson(self::ACCOUNTS)->assertForbidden();
        $this->actingAsToken($this->adminToken())->getJson(self::ACCOUNTS)->assertForbidden();
        $this->actingAsToken($this->superAdminToken())->getJson(self::ACCOUNTS)->assertOk();
    }

    public function test_the_directory_requires_a_token(): void
    {
        $this->getJson(self::ACCOUNTS)->assertUnauthorized();
    }

    // ---------------------------------------------------------------------
    // Suspending. Story 39.
    // ---------------------------------------------------------------------

    public function test_a_super_administrator_can_suspend_an_administrator(): void
    {
        $admin = Admin::factory()->create(['status' => 'active']);

        $response = $this->actingAsToken($this->superAdminToken())
            ->postJson(self::ADMINS.$admin->id.'/suspend')
            ->assertOk();

        $this->assertSame('suspended', $response->json('data.status'));
        $this->assertSame('suspended', $admin->fresh()->status);
    }

    public function test_suspending_keeps_the_record_rather_than_removing_it(): void
    {
        $admin = Admin::factory()->create(['name' => 'Kept On Record']);

        $this->actingAsToken($this->superAdminToken())
            ->postJson(self::ADMINS.$admin->id.'/suspend')
            ->assertOk();

        // The record, and the identity on it, survive. An account that could be
        // deleted is an account whose history can be deleted with it.
        $this->assertDatabaseHas('admins', [
            'id' => $admin->id,
            'name' => 'Kept On Record',
            'status' => 'suspended',
        ]);
    }

    public function test_a_suspended_account_is_refused_at_the_access_door_at_once(): void
    {
        $admin = Admin::factory()->create(['status' => 'active']);
        $token = $admin->createToken('api', ['admins:*']);

        // Proved working first, so the refusal afterwards cannot be a false
        // positive from a token that never worked.
        $this->actingAsToken($token)->getJson(self::ADMINS_ME)->assertOk();

        $this->actingAsToken($this->superAdminToken())
            ->postJson(self::ADMINS.$admin->id.'/suspend')
            ->assertOk();

        // No revocation happens anywhere in the suspension path. The status is
        // re-read on every authorised request, so this is refused because the
        // account's status changed - and that is the whole of the mechanism.
        $this->actingAsToken($token)->getJson(self::ADMINS_ME)->assertForbidden();
    }

    public function test_a_suspended_account_cannot_renew_its_session_either(): void
    {
        $admin = Admin::factory()->create(['status' => 'active']);
        $renewal = $admin->createToken('api', [Ability::SESSION_RENEW]);

        $this->actingAsToken($this->superAdminToken())
            ->postJson(self::ADMINS.$admin->id.'/suspend')
            ->assertOk();

        // The second door. A guard that only closed the access door would leave a
        // renewal token in browser storage that buys a new access token forever,
        // and the suspension would be undone by a page reload.
        $this->actingAsToken($renewal)->postJson(self::ADMINS_RENEW)->assertForbidden();
    }

    public function test_suspending_is_refused_to_an_administrator_even_though_they_are_an_administrator(): void
    {
        $admin = Admin::factory()->create();
        $other = Admin::factory()->create();

        // They are the right kind of account for the table and the function is
        // simply not theirs. `admins:*` does not include `accounts:suspend`.
        $this->actingAsToken($this->adminTokenFor($admin))
            ->postJson(self::ADMINS.$other->id.'/suspend')
            ->assertForbidden();

        $this->assertSame('active', $other->fresh()->status);
    }

    public function test_suspending_is_refused_at_the_door_before_the_identifier_is_read(): void
    {
        $admin = Admin::factory()->create();

        // A super administrator is not an administrator, so `/admins/{id}/suspend`
        // has nothing to suspend *about* them and the account-type half of the
        // guard answers first. Which is worth asserting: it means the 404-versus-403
        // distinction the other controller worries about cannot arise here either,
        // because the caller is refused before the path parameter means anything.
        $this->actingAsToken($this->superAdminToken())
            ->postJson(self::ADMINS.$admin->id.'/suspend')
            ->assertOk();
    }

    public function test_the_use_case_refuses_a_caller_suspending_themselves(): void
    {
        $admin = Admin::factory()->create(['status' => 'active']);

        $useCase = app(SuspendAdminAccount::class);

        // Called directly, and deliberately. Over HTTP this is unreachable: an
        // administrator is refused by the ability check and a super administrator
        // is refused by the account-type check, so no request can reach the line.
        // The rule is kept anyway as the thing that holds if either ability is ever
        // widened, and this is the only assertion that can see it. Claiming HTTP
        // coverage here would be claiming a test that cannot fail.
        $this->expectException(CannotSuspendSelf::class);

        $useCase->execute(
            id: $admin->id,
            callerType: AccountType::Admin,
            callerId: $admin->id,
        );
    }

    public function test_the_use_case_allows_a_caller_suspecting_somebody_else(): void
    {
        $caller = Admin::factory()->create(['status' => 'active']);
        $other = Admin::factory()->create(['status' => 'active']);

        // The negative case, so the assertion above is not passing for the wrong
        // reason: an administrator identifier that is not the caller's is allowed,
        // and only their own is refused.
        $suspended = app(SuspendAdminAccount::class)->execute(
            id: $other->id,
            callerType: AccountType::Admin,
            callerId: $caller->id,
        );

        $this->assertSame('suspended', $suspended->status->value);
        $this->assertSame('active', $caller->fresh()->status, 'The caller should be untouched.');
    }

    public function test_suspending_an_administrator_who_does_not_exist_is_a_404(): void
    {
        $this->actingAsToken($this->superAdminToken())
            ->postJson(self::ADMINS.'999999/suspend')
            ->assertNotFound();
    }

    public function test_a_malformed_identifier_is_a_404_and_not_a_server_error(): void
    {
        $this->actingAsToken($this->superAdminToken())
            ->postJson(self::ADMINS.'abc/suspend')
            ->assertNotFound();

        $this->actingAsToken($this->superAdminToken())
            ->postJson(self::ADMINS.'0/suspend')
            ->assertNotFound();
    }

    // ---------------------------------------------------------------------
    // Promoting. Story 41.
    // ---------------------------------------------------------------------

    public function test_promoting_creates_a_super_administrator_and_suspends_the_administrator(): void
    {
        $admin = Admin::factory()->create([
            'name' => 'Promoted Person',
            'email' => 'promoted@example.com',
            'password' => Hash::make('a-password'),
            'status' => 'active',
        ]);

        $response = $this->actingAsToken($this->superAdminToken())
            ->postJson(self::ADMINS.$admin->id.'/promote')
            ->assertOk();

        $this->assertSame('super_admins', $response->json('data.account.type'));
        $this->assertSame('Promoted Person', $response->json('data.account.name'));
        $this->assertSame('promoted@example.com', $response->json('data.account.email'));

        // A record was created in the other table, with a store-assigned
        // identifier that is not the administrator's.
        $created = SuperAdmin::where('email', 'promoted@example.com')->sole();
        $this->assertNotSame(
            $admin->id,
            $created->id,
            'Identifiers are per table, so the new record must not reuse the administrator\'s.',
        );

        // And the administrator record is suspended, not deleted: access moved
        // between tables and the history of the old role survives.
        $this->assertDatabaseHas('admins', ['id' => $admin->id, 'status' => 'suspended']);
    }

    public function test_a_promoted_person_can_sign_in_at_the_super_administrator_door(): void
    {
        $password = 'the-password-they-had';
        $admin = Admin::factory()->create([
            'email' => 'moved@example.com',
            'password' => Hash::make($password),
            'status' => 'active',
        ]);

        $this->actingAsToken($this->superAdminToken())
            ->postJson(self::ADMINS.$admin->id.'/promote')
            ->assertOk();

        // The password hash travelled with the record, so promotion does not
        // silently invalidate the person's credentials.
        $this->postJson('/api/v1/identity/super-admins/sign-in', [
            'email' => 'moved@example.com',
            'password' => $password,
        ])->assertOk();
    }

    public function test_promotion_is_not_warned_about_while_the_role_is_narrow(): void
    {
        $admin = Admin::factory()->create();

        // One super administrator exists: the caller, created by the token helper.
        // That is not "more than a couple", so there is nothing to say.
        $response = $this->actingAsToken($this->superAdminToken())
            ->postJson(self::ADMINS.$admin->id.'/promote')
            ->assertOk();

        $this->assertNull(
            $response->json('data.warning'),
            'The warning key should be present and null rather than absent.',
        );
        $this->assertArrayHasKey('warning', $response->json('data'));
    }

    public function test_promotion_is_warned_about_once_the_role_is_held_by_more_than_a_couple_of_people(): void
    {
        // One here, plus the caller the token helper makes: two, which is a couple.
        // Promoting makes it three, and the warning should describe the two.
        SuperAdmin::factory()->create();
        $admin = Admin::factory()->create();

        $response = $this->actingAsToken($this->superAdminToken())
            ->postJson(self::ADMINS.$admin->id.'/promote')
            ->assertOk();

        $this->assertSame(2, SuperAdmin::count() - 1, 'Two existed before this promotion.');
        $warning = $response->json('data.warning');

        $this->assertIsString($warning, 'A third super administrator should carry a warning.');
        // The count describes the role as it is, not as it will be. "There are
        // already 2" is a fact the reader can check; "there will be 3" is a
        // prediction they have to trust.
        $this->assertStringContainsString('2', $warning);
    }

    public function test_promoting_somebody_who_already_holds_the_role_is_refused(): void
    {
        $admin = Admin::factory()->create(['email' => 'both@example.com']);
        SuperAdmin::factory()->create(['email' => 'both@example.com']);

        // The unique index on the column would refuse this insert anyway. Left as a
        // 500 it would say "the platform is broken" to somebody whose account is
        // merely in an unusual state.
        $this->actingAsToken($this->superAdminToken())
            ->postJson(self::ADMINS.$admin->id.'/promote')
            ->assertStatus(409);

        // The caller plus the one that already existed. The refused promotion
        // added nothing.
        $this->assertSame(2, SuperAdmin::count());
        $this->assertSame('active', $admin->fresh()->status);
    }

    public function test_promoting_is_refused_to_an_administrator(): void
    {
        $admin = Admin::factory()->create();
        $other = Admin::factory()->create();

        $this->actingAsToken($this->adminTokenFor($admin))
            ->postJson(self::ADMINS.$other->id.'/promote')
            ->assertForbidden();

        $this->assertSame(0, SuperAdmin::count());
    }

    public function test_promoting_an_administrator_who_does_not_exist_is_a_404(): void
    {
        $this->actingAsToken($this->superAdminToken())
            ->postJson(self::ADMINS.'999999/promote')
            ->assertNotFound();
    }

    public function test_an_administrator_token_is_refused_at_the_promotion_door_even_when_it_carries_the_ability(): void
    {
        $admin = Admin::factory()->create();
        $other = Admin::factory()->create();

        // An administrator token holding `accounts:promote`. No sign-in issues one
        // today, so the ability half of the guard is passed and the account-type
        // half is what refuses. Both halves are named on the route, and this is the
        // one that stops being enough if the account type is ever widened.
        $token = $admin->createToken('api', [Ability::ACCOUNTS_PROMOTE]);

        $this->actingAsToken($token)
            ->postJson(self::ADMINS.$other->id.'/promote')
            ->assertForbidden();

        $this->assertSame(0, SuperAdmin::count());
    }

    public function test_the_use_case_refuses_a_caller_promoting_themselves(): void
    {
        $admin = Admin::factory()->create(['status' => 'active']);

        // Direct call, for the same reason as the suspension guard above: over
        // HTTP the account-type check refuses an administrator before this line.
        // Promotion creates a *second* record, so a person promoting themselves
        // would end up holding two super administrator accounts with two token
        // sets - and a suspension could not close both.
        $this->expectException(CannotPromoteSelf::class);

        app(PromoteAdminToSuperAdmin::class)->execute(
            id: $admin->id,
            callerType: AccountType::Admin,
            callerId: $admin->id,
        );
    }

    // ---------------------------------------------------------------------
    // The four representations. Story 34, and the isolation property.
    // ---------------------------------------------------------------------

    public function test_every_account_type_is_described_by_its_own_type(): void
    {
        User::factory()->create(['email' => 'a@example.com']);
        Worker::factory()->create(['email' => 'b@example.com']);
        Admin::factory()->create(['email' => 'c@example.com']);
        SuperAdmin::factory()->create(['email' => 'd@example.com']);

        // Grouped rather than `keyBy`. `keyBy` would collapse the two super
        // administrator rows - the one created above and the caller the token
        // helper makes - into one, and the assertion below would then be reading
        // whichever row happened to be kept. Grouping keeps every row.
        $rows = collect(
            $this->actingAsToken($this->superAdminToken())
                ->getJson(self::ACCOUNTS)
                ->assertOk()
                ->json('data')
        )->groupBy('type');

        // Every row of every type carries the same five fields and nothing else. A
        // shared summary type with a nullable field per account type would make
        // this depend on somebody remembering to leave the field null; four types
        // with no such field make it unexpressible.
        foreach (['users', 'workers', 'admins', 'super_admins'] as $type) {
            $this->assertNotEmpty($rows->get($type), "The directory should list {$type}.");

            foreach ($rows->get($type) as $row) {
                $this->assertSame(
                    ['type', 'id', 'name', 'email', 'status'],
                    array_keys($row),
                    "A {$type} row should carry exactly the five directory fields.",
                );
            }
        }

        // Each row carries its own store's address, so one account type's view
        // cannot show another's fields.
        $this->assertSame(['a@example.com'], $rows->get('users')->pluck('email')->all());
        $this->assertSame(['b@example.com'], $rows->get('workers')->pluck('email')->all());
        $this->assertSame(['c@example.com'], $rows->get('admins')->pluck('email')->all());

        // Two super administrators, so this one is a containment check rather than
        // an equality: one is the account created above, the other is the caller.
        $this->assertContains('d@example.com', $rows->get('super_admins')->pluck('email')->all());
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    /**
     * Present a Sanctum token on the next requests, as a bearer header.
     *
     * `actingAs` with a token is deliberately avoided: it bypasses the guard's
     * token resolution, which is the part of the wiring under test. `forgetGuards`
     * is load-bearing for the same reason it is in the other suites — Laravel's
     * guards are singletons and `RequestGuard::user()` memoises its answer, so
     * without it the second request would be handed the first request's account
     * and every "the change took effect" assertion here would pass for the wrong
     * reason.
     */
    private function actingAsToken(NewAccessToken $token): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($token->plainTextToken);
    }

    private function userToken(): NewAccessToken
    {
        return User::factory()->create()->createToken('api', ['users:*']);
    }

    private function workerToken(): NewAccessToken
    {
        return Worker::factory()->create()->createToken('api', ['workers:*']);
    }

    private function adminToken(): NewAccessToken
    {
        return $this->adminTokenFor(Admin::factory()->create());
    }

    private function adminTokenFor(Admin $admin): NewAccessToken
    {
        return $admin->createToken('api', ['admins:*']);
    }

    private function superAdminToken(): NewAccessToken
    {
        return $this->superAdminTokenFor(SuperAdmin::factory()->create());
    }

    private function superAdminTokenFor(SuperAdmin $superAdmin): NewAccessToken
    {
        return $superAdmin->createToken('api', [Ability::WILDCARD]);
    }
}
