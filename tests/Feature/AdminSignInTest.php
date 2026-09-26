<?php

namespace Tests\Feature;

use App\Application\IdentityAndAccess\Exceptions\InvalidCredentials;
use App\Models\Admin;
use App\Models\SuperAdmin;
use App\Models\User;
use App\Models\Worker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

/**
 * The administrator door.
 *
 * Everything here is asserted from outside the application, through the HTTP
 * surface, because the properties being protected - that this door resolves
 * credentials against one table and issues one ability - are only real if they
 * hold for a request that did not come from inside the codebase.
 */
class AdminSignInTest extends TestCase
{
    use RefreshDatabase;

    /**
     * The administrator application has its own sign-in address, separate from
     * the customer's, the worker's and the super administrator's.
     */
    private const ADMIN_SIGN_IN = '/api/v1/identity/admins/sign-in';

    private const SUPER_ADMIN_SIGN_IN = '/api/v1/identity/super-admins/sign-in';

    private const USER_SIGN_IN = '/api/v1/identity/users/sign-in';

    private const WORKER_SIGN_IN = '/api/v1/identity/workers/sign-in';

    public function test_admin_can_sign_in_at_the_admin_sign_in_address(): void
    {
        $password = 'password123';
        $admin = Admin::factory()->create([
            'email' => 'admin@example.com',
            'password' => bcrypt($password),
            'status' => 'active',
        ]);

        $response = $this->postJson(self::ADMIN_SIGN_IN, [
            'email' => 'admin@example.com',
            'password' => $password,
        ]);

        $response->assertOk();
        $response->assertJsonStructure([
            'data' => [
                'token',
                'admin' => ['id', 'name', 'email'],
                'abilities',
            ],
        ]);

        $data = $response->json('data');
        $this->assertNotEmpty($data['token']);
        $this->assertEquals($admin->id, $data['admin']['id']);
        $this->assertEquals($admin->name, $data['admin']['name']);
        $this->assertEquals($admin->email, $data['admin']['email']);
    }

    /**
     * The administrator's identity comes off the admin record, so the token is
     * bound to the admins table and to the admin row, never to a customer,
     * worker or super administrator record.
     */
    public function test_admin_identity_is_carried_on_the_admin_record(): void
    {
        $password = 'password123';
        $admin = Admin::factory()->create([
            'email' => 'admin@example.com',
            'password' => bcrypt($password),
        ]);

        $this->postJson(self::ADMIN_SIGN_IN, [
            'email' => 'admin@example.com',
            'password' => $password,
        ])->assertOk();

        // No other store was written to, or consulted, along the way.
        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('workers', 0);
        $this->assertDatabaseCount('super_admins', 0);

        $token = PersonalAccessToken::first();
        $this->assertNotNull($token);
        $this->assertEquals(Admin::class, $token->tokenable_type);
        $this->assertEquals($admin->id, $token->tokenable_id);
        $this->assertInstanceOf(Admin::class, $token->tokenable);
    }

    /**
     * An administrator token carries the administrator ability and never the
     * wildcard. This is the assertion that makes the two staff tables worth
     * having: if an admin token could do anything, the super_admins table would
     * be decoration.
     */
    public function test_admin_token_carries_admin_abilities_and_not_the_wildcard(): void
    {
        $password = 'password123';
        Admin::factory()->create([
            'email' => 'admin@example.com',
            'password' => bcrypt($password),
        ]);

        $response = $this->postJson(self::ADMIN_SIGN_IN, [
            'email' => 'admin@example.com',
            'password' => $password,
        ])->assertOk();

        $this->assertEquals(['admins:*'], $response->json('data.abilities'));
        $this->assertNotContains('*', $response->json('data.abilities'));

        $this->assertEquals(
            ['admins:*'],
            PersonalAccessToken::where('tokenable_type', Admin::class)->firstOrFail()->abilities
        );
    }

    /**
     * Promotion moves a record between stores rather than changing a flag, so
     * the two staff doors do not accept each other's credentials and a
     * super administrator address is simply unknown at the administrator door.
     *
     * Stated as behaviour rather than as a schema inspection: the observable
     * consequence of "one table with a role column" would be that this address
     * signs in here with the wider ability, and it does not.
     */
    public function test_super_admin_credentials_are_not_accepted_at_the_admin_door(): void
    {
        $password = 'password123';
        SuperAdmin::factory()->create([
            'email' => 'shared@example.com',
            'password' => bcrypt($password),
        ]);

        $response = $this->postJson(self::ADMIN_SIGN_IN, [
            'email' => 'shared@example.com',
            'password' => $password,
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['credentials']);
        $this->assertStringContainsString(InvalidCredentials::MESSAGE, $response->json('message'));
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    /**
     * The same address with two different passwords in the two staff tables must
     * not let one store's password into the other door. The strongest form of
     * the isolation claim: the store that is asked is the store that decides.
     */
    public function test_an_address_present_in_both_staff_stores_only_answers_at_its_own_door(): void
    {
        Admin::factory()->create([
            'email' => 'shared@example.com',
            'password' => bcrypt('adminpass'),
        ]);
        SuperAdmin::factory()->create([
            'email' => 'shared@example.com',
            'password' => bcrypt('superpass'),
        ]);

        $wrongStore = $this->postJson(self::ADMIN_SIGN_IN, [
            'email' => 'shared@example.com',
            'password' => 'superpass',
        ]);
        $rightStore = $this->postJson(self::ADMIN_SIGN_IN, [
            'email' => 'shared@example.com',
            'password' => 'adminpass',
        ]);

        $wrongStore->assertUnprocessable();
        $this->assertStringContainsString(InvalidCredentials::MESSAGE, $wrongStore->json('message'));
        $rightStore->assertOk();
        $this->assertEquals(['admins:*'], $rightStore->json('data.abilities'));
        $this->assertDatabaseCount('personal_access_tokens', 1);
    }

    /**
     * A valid customer credential is refused at the administrator door, and a
     * valid worker credential likewise. The two are checked explicitly rather
     * than through a data provider, because the failure this guards against is
     * someone adding a fallback query to the users table and never noticing.
     */
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
            $response = $this->postJson(self::ADMIN_SIGN_IN, [
                'email' => $email,
                'password' => $password,
            ]);

            $response->assertUnprocessable();
            $response->assertJsonValidationErrors(['credentials']);
            $this->assertStringContainsString(InvalidCredentials::MESSAGE, $response->json('message'));
        }

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    /**
     * A valid administrator credential is refused at the customer and worker
     * doors. The staff path must not have weakened the existing ones.
     */
    public function test_credentials_from_the_admins_table_are_never_accepted_by_the_customer_or_worker_paths(): void
    {
        $password = 'password123';
        Admin::factory()->create([
            'email' => 'shared@example.com',
            'password' => bcrypt($password),
        ]);

        foreach ([self::USER_SIGN_IN, self::WORKER_SIGN_IN] as $address) {
            $response = $this->postJson($address, [
                'email' => 'shared@example.com',
                'password' => $password,
            ]);

            $response->assertUnprocessable();
            $this->assertStringContainsString(InvalidCredentials::MESSAGE, $response->json('message'));
        }

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    /**
     * An address that exists in no staff table is refused exactly as a wrong
     * password is, byte for byte, so the administrator door reveals nothing
     * about which addresses exist.
     */
    public function test_unknown_address_is_refused_the_same_way_as_a_wrong_password(): void
    {
        $password = 'password123';
        Admin::factory()->create([
            'email' => 'admin@example.com',
            'password' => bcrypt($password),
        ]);

        $unknown = $this->postJson(self::ADMIN_SIGN_IN, [
            'email' => 'unknown@example.com',
            'password' => $password,
        ]);

        $wrongPassword = $this->postJson(self::ADMIN_SIGN_IN, [
            'email' => 'admin@example.com',
            'password' => 'not-the-password',
        ]);

        $unknown->assertUnprocessable();
        $wrongPassword->assertUnprocessable();
        // Byte-identical, not merely equivalent in structure: an endpoint that
        // starts echoing the submitted address back under a new key fails here.
        $this->assertSame($unknown->getContent(), $wrongPassword->getContent());
    }

    /**
     * A suspended administrator with the correct password is told so, and gets
     * no token. 403, matching the other three doors.
     */
    public function test_sign_in_fails_for_a_suspended_admin(): void
    {
        $password = 'password123';
        Admin::factory()->suspended()->create([
            'email' => 'suspended@example.com',
            'password' => bcrypt($password),
        ]);

        $response = $this->postJson(self::ADMIN_SIGN_IN, [
            'email' => 'suspended@example.com',
            'password' => $password,
        ]);

        $response->assertForbidden();
        $this->assertStringContainsString('suspended', $response->json('message'));
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    /**
     * The suspension message is only safe because the password is settled first.
     * Without the correct password, a suspended account is byte-identical to an
     * unknown one - so enumerating addresses teaches an attacker nothing.
     */
    public function test_the_suspended_refusal_is_unreachable_without_the_correct_password(): void
    {
        Admin::factory()->suspended()->create([
            'email' => 'suspended@example.com',
            'password' => bcrypt('password123'),
        ]);

        $wrongPassword = $this->postJson(self::ADMIN_SIGN_IN, [
            'email' => 'suspended@example.com',
            'password' => 'not-the-password',
        ]);

        $unknown = $this->postJson(self::ADMIN_SIGN_IN, [
            'email' => 'unknown@example.com',
            'password' => 'not-the-password',
        ]);

        $wrongPassword->assertUnprocessable();
        $unknown->assertUnprocessable();
        $this->assertSame($wrongPassword->getContent(), $unknown->getContent());
    }

    public function test_sign_in_validates_required_fields(): void
    {
        $response = $this->postJson(self::ADMIN_SIGN_IN, []);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['email', 'password']);
    }

    public function test_sign_in_validates_email_format(): void
    {
        $response = $this->postJson(self::ADMIN_SIGN_IN, [
            'email' => 'not-an-email',
            'password' => 'password123',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['email']);
    }

    public function test_sign_in_email_is_case_insensitive(): void
    {
        $password = 'password123';
        $admin = Admin::factory()->create([
            'email' => 'Admin@Example.COM',
            'password' => bcrypt($password),
        ]);

        $response = $this->postJson(self::ADMIN_SIGN_IN, [
            'email' => 'ADMIN@EXAMPLE.COM',
            'password' => $password,
        ]);

        $response->assertOk();
        $this->assertEquals($admin->id, $response->json('data.admin.id'));
    }

    /**
     * The four sign-in doors are throttled independently, so exhausting the
     * administrator door does not lock the same person out of the other three.
     * Uses real failed attempts rather than a fabricated rate-limit hit.
     */
    public function test_the_admin_door_is_throttled_independently_of_the_other_doors(): void
    {
        $password = 'password123';
        Admin::factory()->create([
            'email' => 'admin@example.com',
            'password' => bcrypt($password),
        ]);

        for ($attempt = 0; $attempt < 6; $attempt++) {
            $this->postJson(self::ADMIN_SIGN_IN, [
                'email' => 'admin@example.com',
                'password' => 'not-the-password',
            ]);
        }

        $throttled = $this->postJson(self::ADMIN_SIGN_IN, [
            'email' => 'admin@example.com',
            'password' => $password,
        ]);
        $throttled->assertStatus(429);

        // The correct password at another door is untouched by that exhaustion.
        SuperAdmin::factory()->create([
            'email' => 'root@example.com',
            'password' => Hash::make($password),
        ]);

        $this->postJson(self::SUPER_ADMIN_SIGN_IN, [
            'email' => 'root@example.com',
            'password' => $password,
        ])->assertOk();
    }
}
