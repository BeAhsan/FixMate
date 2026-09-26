<?php

namespace Tests\Feature;

use App\Application\IdentityAndAccess\Exceptions\InvalidCredentials;
use App\Models\Admin;
use App\Models\SuperAdmin;
use App\Models\User;
use App\Models\Worker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

/**
 * The super administrator door.
 *
 * The most powerful account type in the platform, so this file asserts the two
 * things that make it safe: that the wildcard ability is issued here and only
 * here, and that the door resolves credentials against its own table and no
 * other.
 */
class SuperAdminSignInTest extends TestCase
{
    use RefreshDatabase;

    private const SUPER_ADMIN_SIGN_IN = '/api/v1/identity/super-admins/sign-in';

    private const ADMIN_SIGN_IN = '/api/v1/identity/admins/sign-in';

    private const USER_SIGN_IN = '/api/v1/identity/users/sign-in';

    private const WORKER_SIGN_IN = '/api/v1/identity/workers/sign-in';

    public function test_super_admin_can_sign_in_at_the_super_admin_sign_in_address(): void
    {
        $password = 'password123';
        $superAdmin = SuperAdmin::factory()->create([
            'email' => 'root@example.com',
            'password' => bcrypt($password),
            'status' => 'active',
        ]);

        $response = $this->postJson(self::SUPER_ADMIN_SIGN_IN, [
            'email' => 'root@example.com',
            'password' => $password,
        ]);

        $response->assertOk();
        $response->assertJsonStructure([
            'data' => [
                'token',
                'super_admin' => ['id', 'name', 'email'],
                'abilities',
            ],
        ]);

        $data = $response->json('data');
        $this->assertNotEmpty($data['token']);
        $this->assertEquals($superAdmin->id, $data['super_admin']['id']);
        $this->assertEquals($superAdmin->name, $data['super_admin']['name']);
        $this->assertEquals($superAdmin->email, $data['super_admin']['email']);
    }

    /**
     * The identity is the super_admins row, so the token is bound to that table
     * and to that row. No other store is written to along the way.
     */
    public function test_super_admin_identity_is_carried_on_the_super_admin_record(): void
    {
        $password = 'password123';
        $superAdmin = SuperAdmin::factory()->create([
            'email' => 'root@example.com',
            'password' => bcrypt($password),
        ]);

        $this->postJson(self::SUPER_ADMIN_SIGN_IN, [
            'email' => 'root@example.com',
            'password' => $password,
        ])->assertOk();

        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('workers', 0);
        $this->assertDatabaseCount('admins', 0);

        $token = PersonalAccessToken::first();
        $this->assertNotNull($token);
        $this->assertEquals(SuperAdmin::class, $token->tokenable_type);
        $this->assertEquals($superAdmin->id, $token->tokenable_id);
        $this->assertInstanceOf(SuperAdmin::class, $token->tokenable);
    }

    /**
     * A super administrator's abilities are strictly broader than an
     * administrator's, and the wildcard is granted here and nowhere else.
     *
     * "Strictly broader" is asserted as the thing that would actually be wrong:
     * the two ability sets differ, and only the super administrator has the
     * wildcard. It is not asserted as set containment, because ['*'] is not a
     * superset of ['admins:*'] as a matter of strings - it is broader because
     * of what it means, and the meaning is Sanctum's, not this repository's.
     */
    public function test_super_admin_abilities_are_strictly_broader_than_admin_abilities(): void
    {
        $password = 'password123';
        Admin::factory()->create([
            'email' => 'admin@example.com',
            'password' => bcrypt($password),
        ]);
        SuperAdmin::factory()->create([
            'email' => 'root@example.com',
            'password' => bcrypt($password),
        ]);

        $adminAbilities = $this->postJson(self::ADMIN_SIGN_IN, [
            'email' => 'admin@example.com',
            'password' => $password,
        ])->assertOk()->json('data.abilities');

        $superAdminAbilities = $this->postJson(self::SUPER_ADMIN_SIGN_IN, [
            'email' => 'root@example.com',
            'password' => $password,
        ])->assertOk()->json('data.abilities');

        $this->assertNotEquals($adminAbilities, $superAdminAbilities);
        $this->assertEquals(['admins:*'], $adminAbilities);
        $this->assertEquals(['*'], $superAdminAbilities);

        // The wildcard is not reachable by signing in anywhere else. Asserted
        // over every token issued in this test, not just the two above, so an
        // ability added to another door later would fail here.
        foreach (PersonalAccessToken::all() as $token) {
            if ($token->tokenable_type === SuperAdmin::class) {
                $this->assertEquals(['*'], $token->abilities);
            } else {
                $this->assertNotContains('*', $token->abilities);
            }
        }
    }

    /**
     * Promotion moves a record between stores, so granting the wildcard is an
     * insert into super_admins and nothing else. Creating the record does not
     * alter the administrator it was promoted from, and the administrator's
     * token issued before the promotion still does not carry the wildcard.
     */
    public function test_promotion_is_a_record_moving_between_stores_not_a_flag_changing(): void
    {
        $password = 'password123';
        $admin = Admin::factory()->create([
            'email' => 'admin@example.com',
            'password' => bcrypt($password),
        ]);

        $before = $this->postJson(self::ADMIN_SIGN_IN, [
            'email' => 'admin@example.com',
            'password' => $password,
        ])->assertOk();

        // Promotion: a record appears in the other store. No column on the
        // admins row is written, and the admins schema has nowhere to put a
        // role.
        SuperAdmin::factory()->create([
            'email' => 'admin@example.com',
            'password' => bcrypt($password),
        ]);

        $this->assertDatabaseHas('admins', [
            'id' => $admin->id,
            'email' => 'admin@example.com',
        ]);
        // The schema itself is asserted as well, because "a flag changing" would
        // have been implemented as a column, and a test that only looked at
        // behaviour would still pass against an implementation that had one and
        // happened not to set it here.
        $columns = Schema::getColumnListing('admins');
        foreach (['role', 'is_super_admin', 'is_super', 'abilities', 'level'] as $forbidden) {
            $this->assertNotContains($forbidden, $columns);
        }

        // The token the administrator already holds is unchanged.
        $this->assertEquals(['admins:*'], $before->json('data.abilities'));
        $this->assertEquals(
            ['admins:*'],
            PersonalAccessToken::where('tokenable_type', Admin::class)->firstOrFail()->abilities
        );
    }

    /**
     * An administrator's address with an administrator's password is refused at
     * the super administrator door, so the wider ability cannot be reached by
     * signing in at the wider door with the narrower store's credentials.
     */
    public function test_admin_credentials_are_never_accepted_at_the_super_admin_door(): void
    {
        $password = 'password123';
        Admin::factory()->create([
            'email' => 'admin@example.com',
            'password' => bcrypt($password),
        ]);

        $response = $this->postJson(self::SUPER_ADMIN_SIGN_IN, [
            'email' => 'admin@example.com',
            'password' => $password,
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['credentials']);
        $this->assertStringContainsString(InvalidCredentials::MESSAGE, $response->json('message'));
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_credentials_from_the_users_and_workers_tables_are_never_accepted(): void
    {
        User::factory()->create([
            'email' => 'customer@example.com',
            'password' => bcrypt('customerpass'),
        ]);
        Worker::factory()->create([
            'email' => 'plumber@example.com',
            'password' => bcrypt('workerpass'),
        ]);

        foreach ([['customer@example.com', 'customerpass'], ['plumber@example.com', 'workerpass']] as [$email, $password]) {
            $response = $this->postJson(self::SUPER_ADMIN_SIGN_IN, [
                'email' => $email,
                'password' => $password,
            ]);

            $response->assertUnprocessable();
            $response->assertJsonValidationErrors(['credentials']);
            $this->assertStringContainsString(InvalidCredentials::MESSAGE, $response->json('message'));
        }

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_credentials_from_the_super_admins_table_are_never_accepted_by_the_other_doors(): void
    {
        $password = 'password123';
        SuperAdmin::factory()->create([
            'email' => 'shared@example.com',
            'password' => bcrypt($password),
        ]);

        foreach ([self::USER_SIGN_IN, self::WORKER_SIGN_IN, self::ADMIN_SIGN_IN] as $address) {
            $response = $this->postJson($address, [
                'email' => 'shared@example.com',
                'password' => $password,
            ]);

            $response->assertUnprocessable();
            $this->assertStringContainsString(InvalidCredentials::MESSAGE, $response->json('message'));
        }

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_unknown_address_is_refused_the_same_way_as_a_wrong_password(): void
    {
        $password = 'password123';
        SuperAdmin::factory()->create([
            'email' => 'root@example.com',
            'password' => bcrypt($password),
        ]);

        $unknown = $this->postJson(self::SUPER_ADMIN_SIGN_IN, [
            'email' => 'unknown@example.com',
            'password' => $password,
        ]);

        $wrongPassword = $this->postJson(self::SUPER_ADMIN_SIGN_IN, [
            'email' => 'root@example.com',
            'password' => 'not-the-password',
        ]);

        $unknown->assertUnprocessable();
        $wrongPassword->assertUnprocessable();
        $this->assertSame($unknown->getContent(), $wrongPassword->getContent());
    }

    public function test_sign_in_fails_for_a_suspended_super_admin(): void
    {
        $password = 'password123';
        SuperAdmin::factory()->suspended()->create([
            'email' => 'suspended@example.com',
            'password' => bcrypt($password),
        ]);

        $response = $this->postJson(self::SUPER_ADMIN_SIGN_IN, [
            'email' => 'suspended@example.com',
            'password' => $password,
        ]);

        $response->assertForbidden();
        $this->assertStringContainsString('suspended', $response->json('message'));
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    /**
     * The wildcard is never issued to a suspended account, which is the whole
     * reason every account table carries a status: access is withdrawn by
     * suspending a record rather than by deleting it, and the record of what
     * that person did survives.
     */
    public function test_a_suspended_super_admin_is_issued_no_token_at_all(): void
    {
        SuperAdmin::factory()->suspended()->create([
            'email' => 'suspended@example.com',
            'password' => bcrypt('password123'),
        ]);

        $this->postJson(self::SUPER_ADMIN_SIGN_IN, [
            'email' => 'suspended@example.com',
            'password' => 'password123',
        ])->assertForbidden();

        $this->assertDatabaseCount('personal_access_tokens', 0);
        // The record itself survives, which is the point of suspending rather
        // than deleting.
        $this->assertDatabaseHas('super_admins', ['email' => 'suspended@example.com']);
    }

    /**
     * The suspension message is only safe because the password is settled first.
     * Without the correct password, a suspended account is byte-identical to an
     * unknown one - so enumerating addresses teaches an attacker nothing, even at
     * the door that can issue the wildcard.
     */
    public function test_the_suspended_refusal_is_unreachable_without_the_correct_password(): void
    {
        SuperAdmin::factory()->suspended()->create([
            'email' => 'suspended@example.com',
            'password' => bcrypt('password123'),
        ]);

        $wrongPassword = $this->postJson(self::SUPER_ADMIN_SIGN_IN, [
            'email' => 'suspended@example.com',
            'password' => 'not-the-password',
        ]);

        $unknown = $this->postJson(self::SUPER_ADMIN_SIGN_IN, [
            'email' => 'unknown@example.com',
            'password' => 'not-the-password',
        ]);

        $wrongPassword->assertUnprocessable();
        $unknown->assertUnprocessable();
        $this->assertSame($wrongPassword->getContent(), $unknown->getContent());
    }

    public function test_sign_in_validates_required_fields(): void
    {
        $response = $this->postJson(self::SUPER_ADMIN_SIGN_IN, []);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['email', 'password']);
    }

    public function test_sign_in_validates_email_format(): void
    {
        $response = $this->postJson(self::SUPER_ADMIN_SIGN_IN, [
            'email' => 'not-an-email',
            'password' => 'password123',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['email']);
    }

    public function test_sign_in_email_is_case_insensitive(): void
    {
        $password = 'password123';
        $superAdmin = SuperAdmin::factory()->create([
            'email' => 'Root@Example.COM',
            'password' => bcrypt($password),
        ]);

        $response = $this->postJson(self::SUPER_ADMIN_SIGN_IN, [
            'email' => 'ROOT@EXAMPLE.COM',
            'password' => $password,
        ]);

        $response->assertOk();
        $this->assertEquals($superAdmin->id, $response->json('data.super_admin.id'));
    }
}
