<?php

namespace Tests\Feature;

use App\Models\Admin;
use App\Models\SuperAdmin;
use App\Models\User;
use App\Models\Worker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class FourCredentialStoresTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Test that each account type has its own table with correct columns.
     */
    public function test_each_account_type_has_its_own_table(): void
    {
        $user = User::factory()->create();
        $worker = Worker::factory()->create();
        $admin = Admin::factory()->create();
        $superAdmin = SuperAdmin::factory()->create();

        $this->assertDatabaseHas('users', ['id' => $user->id]);
        $this->assertDatabaseHas('workers', ['id' => $worker->id]);
        $this->assertDatabaseHas('admins', ['id' => $admin->id]);
        $this->assertDatabaseHas('super_admins', ['id' => $superAdmin->id]);
    }

    /**
     * Test that email is unique within each table but can exist across tables.
     */
    public function test_email_unique_within_table_but_can_exist_across_tables(): void
    {
        $email = 'test@example.com';

        User::factory()->create(['email' => $email]);
        Worker::factory()->create(['email' => $email]);
        Admin::factory()->create(['email' => $email]);
        SuperAdmin::factory()->create(['email' => $email]);

        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseCount('workers', 1);
        $this->assertDatabaseCount('admins', 1);
        $this->assertDatabaseCount('super_admins', 1);
    }

    /**
     * Test that each guard resolves credentials against its own table only.
     */
    public function test_guards_resolve_credentials_against_own_table_only(): void
    {
        $email = 'test@example.com';
        $password = 'password123';

        // Create a user in each table with the same email but different passwords
        User::factory()->create(['email' => $email, 'password' => bcrypt($password)]);
        Worker::factory()->create(['email' => $email, 'password' => bcrypt('workerpass')]);
        Admin::factory()->create(['email' => $email, 'password' => bcrypt('adminpass')]);
        SuperAdmin::factory()->create(['email' => $email, 'password' => bcrypt('superpass')]);

        // Test users guard - should only authenticate against users table
        $this->assertTrue(auth()->guard('users')->attempt(['email' => $email, 'password' => $password]));
        $this->assertFalse(auth()->guard('users')->attempt(['email' => $email, 'password' => 'workerpass']));
        $this->assertFalse(auth()->guard('users')->attempt(['email' => $email, 'password' => 'adminpass']));
        $this->assertFalse(auth()->guard('users')->attempt(['email' => $email, 'password' => 'superpass']));

        // Test workers guard - should only authenticate against workers table
        $this->assertTrue(auth()->guard('workers')->attempt(['email' => $email, 'password' => 'workerpass']));
        $this->assertFalse(auth()->guard('workers')->attempt(['email' => $email, 'password' => $password]));
        $this->assertFalse(auth()->guard('workers')->attempt(['email' => $email, 'password' => 'adminpass']));
        $this->assertFalse(auth()->guard('workers')->attempt(['email' => $email, 'password' => 'superpass']));

        // Test admins guard - should only authenticate against admins table
        $this->assertTrue(auth()->guard('admins')->attempt(['email' => $email, 'password' => 'adminpass']));
        $this->assertFalse(auth()->guard('admins')->attempt(['email' => $email, 'password' => $password]));
        $this->assertFalse(auth()->guard('admins')->attempt(['email' => $email, 'password' => 'workerpass']));
        $this->assertFalse(auth()->guard('admins')->attempt(['email' => $email, 'password' => 'superpass']));

        // Test super_admins guard - should only authenticate against super_admins table
        $this->assertTrue(auth()->guard('super_admins')->attempt(['email' => $email, 'password' => 'superpass']));
        $this->assertFalse(auth()->guard('super_admins')->attempt(['email' => $email, 'password' => $password]));
        $this->assertFalse(auth()->guard('super_admins')->attempt(['email' => $email, 'password' => 'workerpass']));
        $this->assertFalse(auth()->guard('super_admins')->attempt(['email' => $email, 'password' => 'adminpass']));
    }

    /**
     * Test that a credential from one store cannot be resolved by another store's guard.
     */
    public function test_credential_isolation_between_stores(): void
    {
        $user = User::factory()->create(['email' => 'user@example.com', 'password' => bcrypt('userpass')]);
        $worker = Worker::factory()->create(['email' => 'worker@example.com', 'password' => bcrypt('workerpass')]);
        $admin = Admin::factory()->create(['email' => 'admin@example.com', 'password' => bcrypt('adminpass')]);
        $superAdmin = SuperAdmin::factory()->create(['email' => 'super@example.com', 'password' => bcrypt('superpass')]);

        // User credentials should not work on workers guard
        $this->assertFalse(auth()->guard('workers')->attempt(['email' => $user->email, 'password' => 'userpass']));
        $this->assertFalse(auth()->guard('admins')->attempt(['email' => $user->email, 'password' => 'userpass']));
        $this->assertFalse(auth()->guard('super_admins')->attempt(['email' => $user->email, 'password' => 'userpass']));

        // Worker credentials should not work on users guard
        $this->assertFalse(auth()->guard('users')->attempt(['email' => $worker->email, 'password' => 'workerpass']));
        $this->assertFalse(auth()->guard('admins')->attempt(['email' => $worker->email, 'password' => 'workerpass']));
        $this->assertFalse(auth()->guard('super_admins')->attempt(['email' => $worker->email, 'password' => 'workerpass']));

        // Admin credentials should not work on users guard
        $this->assertFalse(auth()->guard('users')->attempt(['email' => $admin->email, 'password' => 'adminpass']));
        $this->assertFalse(auth()->guard('workers')->attempt(['email' => $admin->email, 'password' => 'adminpass']));
        $this->assertFalse(auth()->guard('super_admins')->attempt(['email' => $admin->email, 'password' => 'adminpass']));

        // Super admin credentials should not work on users guard
        $this->assertFalse(auth()->guard('users')->attempt(['email' => $superAdmin->email, 'password' => 'superpass']));
        $this->assertFalse(auth()->guard('workers')->attempt(['email' => $superAdmin->email, 'password' => 'superpass']));
        $this->assertFalse(auth()->guard('admins')->attempt(['email' => $superAdmin->email, 'password' => 'superpass']));
    }

    /**
     * Test that personal access tokens work for all four account types.
     */
    public function test_personal_access_tokens_support_all_four_account_types(): void
    {
        $user = User::factory()->create();
        $worker = Worker::factory()->create();
        $admin = Admin::factory()->create();
        $superAdmin = SuperAdmin::factory()->create();

        // Create tokens for each account type
        $userToken = $user->createToken('test-token')->plainTextToken;
        $workerToken = $worker->createToken('test-token')->plainTextToken;
        $adminToken = $admin->createToken('test-token')->plainTextToken;
        $superAdminToken = $superAdmin->createToken('test-token')->plainTextToken;

        $this->assertNotEmpty($userToken);
        $this->assertNotEmpty($workerToken);
        $this->assertNotEmpty($adminToken);
        $this->assertNotEmpty($superAdminToken);

        // Verify tokens are stored in the same table with polymorphic relationship
        $this->assertDatabaseCount('personal_access_tokens', 4);

        // Verify each token is associated with the correct model type
        $tokens = PersonalAccessToken::all();
        $this->assertEquals(4, $tokens->count());

        $tokenableTypes = $tokens->pluck('tokenable_type')->unique()->values()->all();
        $this->assertEqualsCanonicalizing([
            User::class,
            Worker::class,
            Admin::class,
            SuperAdmin::class,
        ], $tokenableTypes);
    }

    /**
     * Test that password reset tokens are per account type (tables exist).
     */
    public function test_password_reset_token_tables_exist_per_account_type(): void
    {
        $this->assertTrue(Schema::hasTable('password_reset_tokens'));
        $this->assertTrue(Schema::hasTable('worker_password_reset_tokens'));
        $this->assertTrue(Schema::hasTable('admin_password_reset_tokens'));
        $this->assertTrue(Schema::hasTable('super_admin_password_reset_tokens'));

        // Verify each table has the correct columns
        $this->assertTrue(Schema::hasColumn('password_reset_tokens', 'email'));
        $this->assertTrue(Schema::hasColumn('password_reset_tokens', 'token'));
        $this->assertTrue(Schema::hasColumn('password_reset_tokens', 'created_at'));

        $this->assertTrue(Schema::hasColumn('worker_password_reset_tokens', 'email'));
        $this->assertTrue(Schema::hasColumn('worker_password_reset_tokens', 'token'));
        $this->assertTrue(Schema::hasColumn('worker_password_reset_tokens', 'created_at'));

        $this->assertTrue(Schema::hasColumn('admin_password_reset_tokens', 'email'));
        $this->assertTrue(Schema::hasColumn('admin_password_reset_tokens', 'token'));
        $this->assertTrue(Schema::hasColumn('admin_password_reset_tokens', 'created_at'));

        $this->assertTrue(Schema::hasColumn('super_admin_password_reset_tokens', 'email'));
        $this->assertTrue(Schema::hasColumn('super_admin_password_reset_tokens', 'token'));
        $this->assertTrue(Schema::hasColumn('super_admin_password_reset_tokens', 'created_at'));
    }

    /**
     * Test that account status is suspendable without deleting the record.
     */
    public function test_account_status_is_suspendable(): void
    {
        $user = User::factory()->create(['status' => 'active']);
        $worker = Worker::factory()->create(['status' => 'active']);
        $admin = Admin::factory()->create(['status' => 'active']);
        $superAdmin = SuperAdmin::factory()->create(['status' => 'active']);

        // Verify initial status is active
        $this->assertEquals('active', $user->fresh()->status);
        $this->assertEquals('active', $worker->fresh()->status);
        $this->assertEquals('active', $admin->fresh()->status);
        $this->assertEquals('active', $superAdmin->fresh()->status);

        // Suspend accounts
        $user->update(['status' => 'suspended']);
        $worker->update(['status' => 'suspended']);
        $admin->update(['status' => 'suspended']);
        $superAdmin->update(['status' => 'suspended']);

        // Verify status changed to suspended but records still exist
        $this->assertEquals('suspended', $user->fresh()->status);
        $this->assertEquals('suspended', $worker->fresh()->status);
        $this->assertEquals('suspended', $admin->fresh()->status);
        $this->assertEquals('suspended', $superAdmin->fresh()->status);

        $this->assertDatabaseHas('users', ['id' => $user->id, 'status' => 'suspended']);
        $this->assertDatabaseHas('workers', ['id' => $worker->id, 'status' => 'suspended']);
        $this->assertDatabaseHas('admins', ['id' => $admin->id, 'status' => 'suspended']);
        $this->assertDatabaseHas('super_admins', ['id' => $superAdmin->id, 'status' => 'suspended']);
    }

    /**
     * Test that two-factor columns are not present (out of scope).
     */
    public function test_two_factor_columns_are_absent(): void
    {
        $this->assertFalse(Schema::hasColumn('users', 'two_factor_secret'));
        $this->assertFalse(Schema::hasColumn('users', 'two_factor_recovery_codes'));
        $this->assertFalse(Schema::hasColumn('users', 'two_factor_confirmed_at'));

        $this->assertFalse(Schema::hasColumn('workers', 'two_factor_secret'));
        $this->assertFalse(Schema::hasColumn('workers', 'two_factor_recovery_codes'));
        $this->assertFalse(Schema::hasColumn('workers', 'two_factor_confirmed_at'));

        $this->assertFalse(Schema::hasColumn('admins', 'two_factor_secret'));
        $this->assertFalse(Schema::hasColumn('admins', 'two_factor_recovery_codes'));
        $this->assertFalse(Schema::hasColumn('admins', 'two_factor_confirmed_at'));

        $this->assertFalse(Schema::hasColumn('super_admins', 'two_factor_secret'));
        $this->assertFalse(Schema::hasColumn('super_admins', 'two_factor_recovery_codes'));
        $this->assertFalse(Schema::hasColumn('super_admins', 'two_factor_confirmed_at'));
    }

    /**
     * Test that factories work for all four account types.
     */
    public function test_factories_work_for_all_account_types(): void
    {
        $user = User::factory()->create();
        $worker = Worker::factory()->create();
        $admin = Admin::factory()->create();
        $superAdmin = SuperAdmin::factory()->create();

        $this->assertInstanceOf(User::class, $user);
        $this->assertInstanceOf(Worker::class, $worker);
        $this->assertInstanceOf(Admin::class, $admin);
        $this->assertInstanceOf(SuperAdmin::class, $superAdmin);

        // Test suspended state
        $suspendedUser = User::factory()->suspended()->create();
        $suspendedWorker = Worker::factory()->suspended()->create();
        $suspendedAdmin = Admin::factory()->suspended()->create();
        $suspendedSuperAdmin = SuperAdmin::factory()->suspended()->create();

        $this->assertEquals('suspended', $suspendedUser->status);
        $this->assertEquals('suspended', $suspendedWorker->status);
        $this->assertEquals('suspended', $suspendedAdmin->status);
        $this->assertEquals('suspended', $suspendedSuperAdmin->status);
    }

    /**
     * Test that API guards (sanctum) are configured for all four account types.
     */
    public function test_api_guards_are_configured(): void
    {
        $this->assertTrue(config('auth.guards.api_users.provider') === 'users');
        $this->assertTrue(config('auth.guards.api_workers.provider') === 'workers');
        $this->assertTrue(config('auth.guards.api_admins.provider') === 'admins');
        $this->assertTrue(config('auth.guards.api_super_admins.provider') === 'super_admins');

        $this->assertEquals('sanctum', config('auth.guards.api_users.driver'));
        $this->assertEquals('sanctum', config('auth.guards.api_workers.driver'));
        $this->assertEquals('sanctum', config('auth.guards.api_admins.driver'));
        $this->assertEquals('sanctum', config('auth.guards.api_super_admins.driver'));
    }
}
