<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Worker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class WorkerSignInTest extends TestCase
{
    use RefreshDatabase;

    /**
     * The worker application has its own sign-in address, separate from the
     * customer's. Nothing else about the two paths is allowed to differ.
     */
    private const WORKER_SIGN_IN = '/api/v1/identity/workers/sign-in';

    private const USER_SIGN_IN = '/api/v1/identity/users/sign-in';

    public function test_worker_can_sign_in_at_the_worker_sign_in_address(): void
    {
        $password = 'password123';
        $worker = Worker::factory()->create([
            'email' => 'plumber@example.com',
            'password' => bcrypt($password),
            'status' => 'active',
        ]);

        $response = $this->postJson(self::WORKER_SIGN_IN, [
            'email' => 'plumber@example.com',
            'password' => $password,
        ]);

        $response->assertOk();
        $response->assertJsonStructure([
            'data' => [
                'token',
                'worker' => ['id', 'name', 'email'],
                'abilities',
            ],
        ]);

        $data = $response->json('data');
        $this->assertNotEmpty($data['token']);
        $this->assertEquals($worker->id, $data['worker']['id']);
        $this->assertEquals($worker->name, $data['worker']['name']);
        $this->assertEquals($worker->email, $data['worker']['email']);
    }

    /**
     * The worker's identity comes off the worker record, so the token is bound to
     * the workers table and to the worker row, never to a customer record.
     */
    public function test_worker_identity_is_carried_on_the_worker_record(): void
    {
        $password = 'password123';
        $worker = Worker::factory()->create([
            'email' => 'plumber@example.com',
            'password' => bcrypt($password),
            'status' => 'active',
        ]);

        $this->postJson(self::WORKER_SIGN_IN, [
            'email' => 'plumber@example.com',
            'password' => $password,
        ])->assertOk();

        // No customer record was created or consulted along the way.
        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseHas('workers', [
            'id' => $worker->id,
            'email' => 'plumber@example.com',
        ]);

        $token = PersonalAccessToken::first();
        $this->assertNotNull($token);
        $this->assertEquals(Worker::class, $token->tokenable_type);
        $this->assertEquals($worker->id, $token->tokenable_id);
        $this->assertInstanceOf(Worker::class, $token->tokenable);
    }

    /**
     * A worker token carries worker abilities, which differ from a customer's.
     * The two are never interchangeable.
     */
    public function test_worker_token_carries_worker_abilities(): void
    {
        $password = 'password123';
        Worker::factory()->create([
            'email' => 'plumber@example.com',
            'password' => bcrypt($password),
        ]);
        User::factory()->create([
            'email' => 'customer@example.com',
            'password' => bcrypt($password),
        ]);

        $workerResponse = $this->postJson(self::WORKER_SIGN_IN, [
            'email' => 'plumber@example.com',
            'password' => $password,
        ])->assertOk();

        $userResponse = $this->postJson(self::USER_SIGN_IN, [
            'email' => 'customer@example.com',
            'password' => $password,
        ])->assertOk();

        $this->assertEquals(['workers:*'], $workerResponse->json('data.abilities'));
        $this->assertEquals(['users:*'], $userResponse->json('data.abilities'));
        $this->assertNotEquals(
            $workerResponse->json('data.abilities'),
            $userResponse->json('data.abilities')
        );

        $this->assertEquals(
            ['workers:*'],
            PersonalAccessToken::where('tokenable_type', Worker::class)->firstOrFail()->abilities
        );
        $this->assertEquals(
            ['users:*'],
            PersonalAccessToken::where('tokenable_type', User::class)->firstOrFail()->abilities
        );
    }

    /**
     * A valid customer credential is refused at the worker address, even when the
     * same address exists among workers with a different password.
     */
    public function test_credentials_from_the_users_table_are_never_accepted(): void
    {
        User::factory()->create([
            'email' => 'shared@example.com',
            'password' => bcrypt('customerpass'),
        ]);
        Worker::factory()->create([
            'email' => 'shared@example.com',
            'password' => bcrypt('workerpass'),
        ]);

        $response = $this->postJson(self::WORKER_SIGN_IN, [
            'email' => 'shared@example.com',
            'password' => 'customerpass',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['email']);
        $this->assertStringContainsString(
            'The provided credentials are incorrect.',
            $response->json('message')
        );
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    /**
     * A valid worker credential is refused at the customer address. The worker
     * path must not have weakened the existing one.
     */
    public function test_credentials_from_the_workers_table_are_never_accepted_by_the_user_path(): void
    {
        Worker::factory()->create([
            'email' => 'shared@example.com',
            'password' => bcrypt('workerpass'),
        ]);
        User::factory()->create([
            'email' => 'shared@example.com',
            'password' => bcrypt('customerpass'),
        ]);

        $response = $this->postJson(self::USER_SIGN_IN, [
            'email' => 'shared@example.com',
            'password' => 'workerpass',
        ]);

        $response->assertUnprocessable();
        $this->assertStringContainsString(
            'The provided credentials are incorrect.',
            $response->json('message')
        );
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    /**
     * An address that exists in neither store is refused, identically to a wrong
     * password, so the worker address reveals nothing about which addresses exist.
     */
    public function test_unknown_address_is_refused_the_same_way_as_a_wrong_password(): void
    {
        $password = 'password123';
        Worker::factory()->create([
            'email' => 'plumber@example.com',
            'password' => bcrypt($password),
        ]);

        $unknown = $this->postJson(self::WORKER_SIGN_IN, [
            'email' => 'unknown@example.com',
            'password' => $password,
        ]);

        $wrongPassword = $this->postJson(self::WORKER_SIGN_IN, [
            'email' => 'plumber@example.com',
            'password' => 'not-the-password',
        ]);

        $unknown->assertUnprocessable();
        $wrongPassword->assertUnprocessable();
        $this->assertEquals($unknown->json(), $wrongPassword->json());
    }

    public function test_sign_in_fails_for_a_suspended_worker(): void
    {
        $password = 'password123';
        Worker::factory()->suspended()->create([
            'email' => 'suspended@example.com',
            'password' => bcrypt($password),
        ]);

        $response = $this->postJson(self::WORKER_SIGN_IN, [
            'email' => 'suspended@example.com',
            'password' => $password,
        ]);

        $response->assertUnprocessable();
        $this->assertStringContainsString('suspended', $response->json('message'));
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_sign_in_validates_required_fields(): void
    {
        $response = $this->postJson(self::WORKER_SIGN_IN, []);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['email', 'password']);
    }

    public function test_sign_in_validates_email_format(): void
    {
        $response = $this->postJson(self::WORKER_SIGN_IN, [
            'email' => 'not-an-email',
            'password' => 'password123',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['email']);
    }

    public function test_sign_in_email_is_case_insensitive(): void
    {
        $password = 'password123';
        $worker = Worker::factory()->create([
            'email' => 'Plumber@Example.COM',
            'password' => bcrypt($password),
        ]);

        $response = $this->postJson(self::WORKER_SIGN_IN, [
            'email' => 'PLUMBER@EXAMPLE.COM',
            'password' => $password,
        ]);

        $response->assertOk();
        $this->assertEquals($worker->id, $response->json('data.worker.id'));
    }
}
