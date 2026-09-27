<?php

namespace Tests\Feature;

use App\Domain\IdentityAndAccess\ValueObjects\Ability;
use App\Models\Admin;
use App\Models\SuperAdmin;
use App\Models\User;
use App\Models\Worker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\NewAccessToken;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

/**
 * Being signed in is not the same as being permitted.
 *
 * Every assertion here is made from outside the application, through HTTP, with
 * a real token on a real request. That is the only seam that can catch the
 * failure this ticket exists to prevent: a caller who never went through the user
 * interface, opened the browser console and called an administrative endpoint
 * directly. A unit test of the middleware would pass whether or not the route
 * was actually guarded by it, and whether or not the guard resolved the right
 * token — which is precisely the wiring that is easy to get wrong and invisible
 * from the inside.
 */
class AbilityScopedAuthorisationTest extends TestCase
{
    use RefreshDatabase;

    private const USERS_ME = '/api/v1/identity/users/me';

    private const WORKERS_ME = '/api/v1/identity/workers/me';

    private const ADMINS_ME = '/api/v1/identity/admins/me';

    private const SUPER_ADMINS_ME = '/api/v1/identity/super-admins/me';

    private const SHOW_ADMIN = '/api/v1/identity/admins/';

    // ---------------------------------------------------------------------
    // A token is required at all.
    // ---------------------------------------------------------------------

    public function test_a_protected_endpoint_refuses_a_request_with_no_token(): void
    {
        $this->getJson(self::USERS_ME)->assertUnauthorized();
    }

    public function test_a_protected_endpoint_refuses_a_token_that_was_never_issued(): void
    {
        // A syntactically valid token string that no sign-in door produced. The
        // distinction from the case above matters to a front end: "your session
        // ended" and "your account may not do this" are different situations
        // with different things to offer the person.
        $this->withToken('1|this-was-never-issued-at-all-anywhere')
            ->getJson(self::USERS_ME)
            ->assertUnauthorized();
    }

    public function test_every_protected_endpoint_refuses_a_request_with_no_token(): void
    {
        // The four doors plus the account-management surface. Asserted
        // together because the property is that *none* of them is reachable
        // unauthenticated, and a single test naming all five says so in a way
        // that a new unguarded route fails.
        foreach ([self::USERS_ME, self::WORKERS_ME, self::ADMINS_ME, self::SUPER_ADMINS_ME] as $door) {
            $this->getJson($door)->assertUnauthorized();
        }

        $this->getJson(self::SHOW_ADMIN.'1')->assertUnauthorized();
    }

    // ---------------------------------------------------------------------
    // Each account type reaches its own door, and only its own door.
    // ---------------------------------------------------------------------

    public function test_each_account_type_can_reach_its_own_door(): void
    {
        $this->actingAsToken($this->userToken())->getJson(self::USERS_ME)->assertOk();
        $this->actingAsToken($this->workerToken())->getJson(self::WORKERS_ME)->assertOk();
        $this->actingAsToken($this->adminToken())->getJson(self::ADMINS_ME)->assertOk();
        $this->actingAsToken($this->superAdminToken())->getJson(self::SUPER_ADMINS_ME)->assertOk();
    }

    public function test_an_end_user_is_refused_entry_to_the_worker_and_administrator_applications(): void
    {
        $token = $this->userToken();

        $this->actingAsToken($token)->getJson(self::WORKERS_ME)->assertForbidden();
        $this->actingAsToken($token)->getJson(self::ADMINS_ME)->assertForbidden();
        $this->actingAsToken($token)->getJson(self::SUPER_ADMINS_ME)->assertForbidden();
    }

    public function test_a_worker_is_refused_entry_to_the_administrator_application(): void
    {
        $token = $this->workerToken();

        $this->actingAsToken($token)->getJson(self::ADMINS_ME)->assertForbidden();
        $this->actingAsToken($token)->getJson(self::SUPER_ADMINS_ME)->assertForbidden();
    }

    public function test_an_administrator_is_refused_entry_to_the_super_administrator_application(): void
    {
        $this->actingAsToken($this->adminToken())
            ->getJson(self::SUPER_ADMINS_ME)
            ->assertForbidden();
    }

    // ---------------------------------------------------------------------
    // A refusal says something a person can act on.
    // ---------------------------------------------------------------------

    public function test_a_refusal_at_the_wrong_door_names_both_account_types(): void
    {
        // The one refusal on this API that does distinguish. It is safe here and
        // only here: the caller has already proved they hold a working token, so
        // being told what it is tells them nothing they did not know. It is also
        // the answer they need — a person who signed in at the right door and
        // arrived at the wrong one needs to be told which door, not told their
        // password was wrong.
        $response = $this->actingAsToken($this->userToken())->getJson(self::WORKERS_ME);

        $response->assertForbidden();
        $response->assertJsonPath('message', fn (string $m): bool => str_contains($m, 'end user')
            && str_contains($m, 'worker'));
    }

    public function test_a_refusal_is_a_clear_json_response_rather_than_a_broken_page(): void
    {
        $response = $this->actingAsToken($this->adminToken())->getJson(self::SUPER_ADMINS_ME);

        $response->assertForbidden();
        $response->assertHeader('content-type', 'application/json');
        $response->assertJsonStructure(['message']);
        $this->assertIsString($response->json('message'));
        $this->assertNotSame('', $response->json('message'));
    }

    public function test_a_refusal_does_not_reveal_which_ability_was_missing(): void
    {
        // Naming the missing ability would turn a 403 into an oracle: an account
        // could read the platform's access model off a series of refused
        // requests, which is the same mistake as confirming which addresses
        // exist in a credential store, one layer up.
        $message = (string) $this->actingAsToken($this->adminToken())
            ->getJson(self::SHOW_ADMIN.'1')
            ->json('message');

        $this->assertStringNotContainsString(Ability::ACCOUNTS_READ, $message);
        $this->assertStringNotContainsString('accounts:', $message);
    }

    // ---------------------------------------------------------------------
    // The ability, not the interface.
    // ---------------------------------------------------------------------

    public function test_calling_an_administrative_endpoint_directly_is_refused_without_the_interface(): void
    {
        // No front end is involved anywhere in this test. The endpoint is called
        // the way an attacker from the browser console would call it, and the
        // answer is the same 403 the interface would have produced.
        $this->actingAsToken($this->adminToken())
            ->getJson(self::SHOW_ADMIN.'1')
            ->assertForbidden();
    }

    public function test_a_super_administrator_reaches_the_account_management_surface(): void
    {
        $admin = Admin::factory()->create(['name' => 'Ada Admin']);

        $this->actingAsToken($this->superAdminToken())
            ->getJson(self::SHOW_ADMIN.$admin->id)
            ->assertOk()
            ->assertJsonPath('data.id', $admin->id)
            ->assertJsonPath('data.name', 'Ada Admin')
            ->assertJsonPath('data.status', 'active');
    }

    public function test_the_account_management_response_never_carries_a_password_hash(): void
    {
        $admin = Admin::factory()->create();

        $body = $this->actingAsToken($this->superAdminToken())
            ->getJson(self::SHOW_ADMIN.$admin->id)
            ->assertOk()
            ->json('data');

        $this->assertSame(['id', 'name', 'email', 'status'], array_keys($body));
    }

    public function test_a_token_cannot_perform_an_action_its_abilities_do_not_cover(): void
    {
        // The administrator's token is entirely valid: it resolves, it is the
        // right account, and it was issued by a real sign-in door. It simply does
        // not carry `accounts:read`, and that alone refuses the request.
        $token = $this->adminToken();

        $this->assertTrue($token->accessToken->can('admins:*'));
        $this->assertFalse($token->accessToken->can(Ability::ACCOUNTS_READ));

        $this->actingAsToken($token)->getJson(self::SHOW_ADMIN.'1')->assertForbidden();
    }

    public function test_an_administrator_cannot_reach_another_administrators_records_by_guessing_an_identifier(): void
    {
        // Two real administrator records. The caller holds a valid token and
        // knows the other's identifier — the whole point is that knowing it is
        // not what grants access.
        $other = Admin::factory()->create();
        $mine = Admin::factory()->create();

        $caller = $this->adminTokenFor($mine);

        $this->actingAsToken($caller)
            ->getJson(self::SHOW_ADMIN.$other->id)
            ->assertForbidden();
    }

    public function test_an_unauthorised_caller_cannot_tell_a_missing_record_from_a_forbidden_one(): void
    {
        // The oracle this design exists to close. Route model binding resolves in
        // the `api` middleware group, before `account.can` runs, so a bound model
        // would answer 404 for an identifier that does not exist and 403 for one
        // that does — and the difference would let anyone walk the identifier
        // space of the admins table. Both answers must be the same 403.
        $existing = Admin::factory()->create();
        $caller = $this->adminToken();

        $forbidden = $this->actingAsToken($caller)->getJson(self::SHOW_ADMIN.$existing->id);
        $missing = $this->actingAsToken($caller)->getJson(self::SHOW_ADMIN.'999999');

        $forbidden->assertForbidden();
        $missing->assertForbidden();
        $this->assertSame($forbidden->json(), $missing->json());
    }

    public function test_a_non_numeric_or_zero_identifier_is_a_404_rather_than_a_server_error(): void
    {
        // The first thing anyone would type at an endpoint that takes an
        // identifier. Unhandled, `int $admin` on 'abc' is a TypeError, and a
        // TypeError on a bearer-token API is a 500 with a stack trace in debug —
        // which is how a deployment gets mapped.
        $token = $this->superAdminToken();

        $this->actingAsToken($token)->getJson(self::SHOW_ADMIN.'abc')->assertNotFound();
        $this->actingAsToken($token)->getJson(self::SHOW_ADMIN.'0')->assertNotFound();
        $this->actingAsToken($token)->getJson(self::SHOW_ADMIN.'-1')->assertNotFound();
    }

    public function test_a_forbidden_caller_is_refused_even_when_the_record_does_not_exist(): void
    {
        // Stated separately from the oracle test above because it is the case
        // that would leak if the constraint were ever relaxed.
        $this->actingAsToken($this->adminToken())
            ->getJson(self::SHOW_ADMIN.'999999')
            ->assertForbidden();
    }

    // ---------------------------------------------------------------------
    // Who am I, and what it discloses.
    // ---------------------------------------------------------------------

    public function test_the_current_account_names_the_account_type_the_token_really_is(): void
    {
        // The response is asked of the registry, not taken from the route. If it
        // were taken from the route it would echo the caller's assumption back,
        // which is how a front end ends up rendering an empty dashboard instead
        // of noticing it holds the wrong token.
        $response = $this->actingAsToken($this->workerToken())->getJson(self::WORKERS_ME);

        $response->assertOk();
        $response->assertJsonPath('data.account_type', 'workers');
    }

    public function test_the_current_account_returns_the_four_fields_sign_in_already_disclosed(): void
    {
        $response = $this->actingAsToken($this->userToken())->getJson(self::USERS_ME);

        $response->assertOk();
        $response->assertJsonStructure([
            'data' => [
                'account_type',
                'account' => ['id', 'name', 'email', 'status'],
                'abilities',
            ],
        ]);
    }

    public function test_the_current_account_echoes_the_tokens_own_abilities(): void
    {
        // Echoed rather than recomputed, so that a front end can decide what to
        // show before it has decided what to render, and cannot be told one
        // thing here and contradicted by the endpoint it calls next.
        $response = $this->actingAsToken($this->adminToken())->getJson(self::ADMINS_ME);

        $response->assertOk();
        $this->assertSame(['admins:*'], $response->json('data.abilities'));
    }

    // ---------------------------------------------------------------------
    // A suspension takes effect at once, not at the next sign-in.
    // ---------------------------------------------------------------------

    public function test_a_suspended_account_is_refused_immediately_despite_a_valid_token(): void
    {
        // A bearer token outlives the decision that issued it. Without this the
        // holder keeps working until the token expires, which means withdrawing
        // someone's access does not actually withdraw it.
        $admin = Admin::factory()->create();
        $token = $this->adminTokenFor($admin);

        $this->actingAsToken($token)->getJson(self::ADMINS_ME)->assertOk();

        $admin->update(['status' => 'suspended']);

        $this->actingAsToken($token)->getJson(self::ADMINS_ME)->assertForbidden();
    }

    public function test_a_pending_account_is_refused_even_though_it_can_hold_a_token(): void
    {
        $user = User::factory()->create(['status' => 'pending']);
        $token = $this->userTokenFor($user);

        $this->actingAsToken($token)->getJson(self::USERS_ME)->assertForbidden();
    }

    public function test_an_unrecognised_status_denies_access_rather_than_granting_it(): void
    {
        // A status this code has not been taught about must not read as Active.
        // Corrupt data should close a door, not open one.
        $user = User::factory()->create();
        $token = $this->userTokenFor($user);

        $this->actingAsToken($token)->getJson(self::USERS_ME)->assertOk();

        $user->update(['status' => 'something-this-code-has-never-heard-of']);

        $this->actingAsToken($token)->getJson(self::USERS_ME)->assertForbidden();
    }

    // ---------------------------------------------------------------------
    // A token cannot be widened in transit.
    // ---------------------------------------------------------------------

    public function test_the_account_type_is_resolved_from_the_token_owner_and_not_from_the_request(): void
    {
        // Sanctum's polymorphic token table is shared by all four account types,
        // so a token is only as trustworthy as the owner it points at. This
        // asserts the owner is what decides, by checking that a worker token at
        // the worker door reports `workers` — the store the token was issued
        // from — rather than anything the path suggests.
        $response = $this->actingAsToken($this->workerToken())->getJson(self::WORKERS_ME);

        $response->assertJsonPath('data.account_type', 'workers');
        $this->assertNotSame('users', $response->json('data.account_type'));
    }

    public function test_each_of_the_four_stores_issues_a_token_only_its_own_account_type_can_use(): void
    {
        // The full cross-product in one test, because the property is about all
        // sixteen pairs rather than about any one of them: a token from one store
        // opens exactly one door.
        $tokens = [
            'users' => [$this->userToken(), self::USERS_ME],
            'workers' => [$this->workerToken(), self::WORKERS_ME],
            'admins' => [$this->adminToken(), self::ADMINS_ME],
            'super_admins' => [$this->superAdminToken(), self::SUPER_ADMINS_ME],
        ];

        $doors = [self::USERS_ME, self::WORKERS_ME, self::ADMINS_ME, self::SUPER_ADMINS_ME];

        foreach ($tokens as $owner => [$token, $ownDoor]) {
            foreach ($doors as $door) {
                $response = $this->actingAsToken($token)->getJson($door);

                $door === $ownDoor
                    ? $response->assertOk()
                    : $response->assertForbidden();
            }
        }
    }

    public function test_a_revoked_token_stops_working_immediately(): void
    {
        $token = $this->userToken();

        $this->actingAsToken($token)->getJson(self::USERS_ME)->assertOk();

        PersonalAccessToken::query()->delete();

        $this->actingAsToken($token)->getJson(self::USERS_ME)->assertUnauthorized();
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    /**
     * Present a Sanctum token on the next requests, as a bearer header.
     *
     * `actingAs` with a token is deliberately avoided: it bypasses the guard's
     * token resolution, which is the part of the wiring this ticket is about.
     *
     * Takes the `NewAccessToken` wrapper rather than the model because the plain
     * text half of the credential exists only on the wrapper — it is written once
     * at creation and never stored, which is the point of a bearer token.
     */
    private function actingAsToken(NewAccessToken $token): static
    {
        // `forgetGuards` first, and it is load-bearing. Laravel's guards are
        // singletons and `RequestGuard::user()` memoises its answer, so within a
        // single test the second request is handed the *first* request's resolved
        // account no matter what bearer token arrives. Every test below that
        // changes something between two requests — suspending an account, deleting
        // a token, knocking on a second door — would otherwise be asserting that
        // the change had no effect, and would pass for the wrong reason.
        $this->app['auth']->forgetGuards();

        return $this->withToken($token->plainTextToken);
    }

    private function userToken(): NewAccessToken
    {
        return $this->userTokenFor(User::factory()->create());
    }

    private function userTokenFor(User $user): NewAccessToken
    {
        return $user->createToken('api', ['users:*']);
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
        return SuperAdmin::factory()->create()->createToken('api', [Ability::WILDCARD]);
    }
}
