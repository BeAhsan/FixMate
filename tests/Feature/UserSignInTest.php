<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Worker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class UserSignInTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Test successful sign-in for end user returns token and user data.
     */
    public function test_end_user_can_sign_in_successfully(): void
    {
        $password = 'password123';
        $user = User::factory()->create([
            'email' => 'test@example.com',
            'password' => bcrypt($password),
            'status' => 'active',
        ]);

        $response = $this->postJson('/api/v1/identity/users/sign-in', [
            'email' => 'test@example.com',
            'password' => $password,
        ]);

        $response->assertOk();
        $response->assertJsonStructure([
            'data' => [
                'token',
                'user' => ['id', 'name', 'email'],
                'abilities',
            ],
        ]);

        $data = $response->json('data');
        $this->assertNotEmpty($data['token']);
        $this->assertEquals($user->id, $data['user']['id']);
        $this->assertEquals($user->name, $data['user']['name']);
        $this->assertEquals($user->email, $data['user']['email']);
        $this->assertEquals(['users:*'], $data['abilities']);

        // Verify token was created in database
        $this->assertDatabaseCount('personal_access_tokens', 1);
        $token = PersonalAccessToken::first();
        $this->assertEquals($user->id, $token->tokenable_id);
        $this->assertEquals(User::class, $token->tokenable_type);
        $this->assertEquals(['users:*'], $token->abilities);
    }

    /**
     * Test sign-in fails with wrong password.
     */
    public function test_sign_in_fails_with_wrong_password(): void
    {
        $user = User::factory()->create([
            'email' => 'test@example.com',
            'password' => bcrypt('correctpassword'),
            'status' => 'active',
        ]);

        $response = $this->postJson('/api/v1/identity/users/sign-in', [
            'email' => 'test@example.com',
            'password' => 'wrongpassword',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['credentials']);
        $this->assertStringContainsString('These credentials do not match our records.', $response->json('message'));
    }

    /**
     * Test sign-in fails for non-existent user (same error to prevent enumeration).
     */
    public function test_sign_in_fails_for_unknown_user(): void
    {
        $response = $this->postJson('/api/v1/identity/users/sign-in', [
            'email' => 'unknown@example.com',
            'password' => 'anypassword',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['credentials']);
        $this->assertStringContainsString('These credentials do not match our records.', $response->json('message'));
    }

    /**
     * Test sign-in fails for suspended account.
     */
    public function test_sign_in_fails_for_suspended_account(): void
    {
        $password = 'password123';
        $user = User::factory()->create([
            'email' => 'suspended@example.com',
            'password' => bcrypt($password),
            'status' => 'suspended',
        ]);

        $response = $this->postJson('/api/v1/identity/users/sign-in', [
            'email' => 'suspended@example.com',
            'password' => $password,
        ]);

        $response->assertForbidden();
        $this->assertStringContainsString('suspended', $response->json('message'));
    }

    /**
     * Test sign-in validates required fields.
     */
    public function test_sign_in_validates_required_fields(): void
    {
        $response = $this->postJson('/api/v1/identity/users/sign-in', []);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['email', 'password']);
    }

    /**
     * Test sign-in validates email format.
     */
    public function test_sign_in_validates_email_format(): void
    {
        $response = $this->postJson('/api/v1/identity/users/sign-in', [
            'email' => 'not-an-email',
            'password' => 'password123',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['email']);
    }

    /**
     * Test that credentials from other stores don't work (isolation).
     */
    public function test_sign_in_isolated_to_users_table(): void
    {
        // Create a worker with same email but different password
        $worker = Worker::factory()->create([
            'email' => 'shared@example.com',
            'password' => bcrypt('workerpass'),
        ]);

        // Try to sign in as user with worker's credentials
        $response = $this->postJson('/api/v1/identity/users/sign-in', [
            'email' => 'shared@example.com',
            'password' => 'workerpass',
        ]);

        $response->assertUnprocessable();
        $this->assertStringContainsString('These credentials do not match our records.', $response->json('message'));
    }

    /**
     * Test that email is case-insensitive (canonicalization).
     */
    public function test_sign_in_email_is_case_insensitive(): void
    {
        $password = 'password123';
        $user = User::factory()->create([
            'email' => 'Test@Example.COM',
            'password' => bcrypt($password),
            'status' => 'active',
        ]);

        $response = $this->postJson('/api/v1/identity/users/sign-in', [
            'email' => 'TEST@EXAMPLE.COM',
            'password' => $password,
        ]);

        $response->assertOk();
        $this->assertEquals($user->id, $response->json('data.user.id'));
    }
}
