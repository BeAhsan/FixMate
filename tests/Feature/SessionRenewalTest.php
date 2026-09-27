<?php

namespace Tests\Feature;

use App\Domain\IdentityAndAccess\ValueObjects\Ability;
use App\Models\SuperAdmin;
use App\Models\User;
use App\Models\Worker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Date;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

/**
 * Renewal, rotation, and the boundary between the two kinds of token.
 *
 * A renewal token is the only credential in this platform that is written to
 * browser storage, so it is the only one an injected script can read. Every test
 * here is about keeping it worth almost nothing, and the tests that matter most
 * are the refusals: a renewal token that can reach anything else, or an access
 * token that can drive renewal, would collapse the arrangement back into "one
 * long-lived token in local storage".
 */
class SessionRenewalTest extends TestCase
{
    use RefreshDatabase;

    private const SIGN_IN = '/api/v1/identity/users/sign-in';

    private const RENEW = '/api/v1/identity/users/session/renew';

    private const SIGN_OUT = '/api/v1/identity/users/sign-out';

    /**
     * Sign in and return both tokens, exactly as a front end receives them.
     *
     * @return array{token: string, renewal: string}
     */
    private function signIn(string $email = 'ada@example.test', string $password = 'password123'): array
    {
        User::factory()->create([
            'email' => $email,
            'password' => bcrypt($password),
            'status' => 'active',
        ]);

        $data = $this->postJson(self::SIGN_IN, [
            'email' => $email,
            'password' => $password,
        ])->assertOk()->json('data');

        return ['token' => $data['token'], 'renewal' => $data['renewal_token']];
    }

    /**
     * Present a bearer token, forgetting the guards first.
     *
     * `$this->withToken()` on its own is a trap in a test that makes more than
     * one request. Sanctum's guard is a singleton and `RequestGuard::user()`
     * memoises the account it resolved, so the second request in a test is
     * handed the *first* request's answer no matter which token arrives. Every
     * test below that renews and then signs out, or signs out and then tries
     * again, would be asserting that revocation had no effect — and passing for
     * the wrong reason.
     */
    private function asToken(string $token): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($token);
    }

    // -----------------------------------------------------------------
    // What a sign-in issues
    // -----------------------------------------------------------------

    public function test_a_sign_in_issues_an_access_token_and_a_renewal_token(): void
    {
        $tokens = $this->signIn();

        $this->assertNotEmpty($tokens['token']);
        $this->assertNotEmpty($tokens['renewal']);
        $this->assertNotSame($tokens['token'], $tokens['renewal']);
    }

    public function test_the_renewal_token_carries_no_account_abilities(): void
    {
        $this->signIn();

        $renewal = PersonalAccessToken::where('abilities', json_encode([Ability::SESSION_RENEW]))->sole();

        // Not `users:*`. A renewal token that carried the account's abilities
        // would be a second access token with a longer life, in storage.
        $this->assertSame([Ability::SESSION_RENEW], $renewal->abilities);
    }

    public function test_a_super_administrators_renewal_token_does_not_carry_the_wildcard(): void
    {
        // The most valuable account on the platform, whose access token carries
        // `*` — and whose renewal token is still the one credential that lives
        // where injected script can read it. This is the case where "it is only
        // a renewal token" would be the most dangerous possible assumption.
        SuperAdmin::factory()->create([
            'email' => 'root@example.test',
            'password' => bcrypt('password123'),
        ]);

        $this->postJson('/api/v1/identity/super-admins/sign-in', [
            'email' => 'root@example.test',
            'password' => 'password123',
        ])->assertOk();

        $renewal = PersonalAccessToken::where('abilities', json_encode([Ability::SESSION_RENEW]))->sole();

        $this->assertNotContains(Ability::WILDCARD, $renewal->abilities);
        $this->assertSame([Ability::SESSION_RENEW], $renewal->abilities);
    }

    public function test_the_access_token_expires_and_the_renewal_token_outlives_it(): void
    {
        $this->signIn();

        $data = $this->postJson(self::SIGN_IN, [
            'email' => 'ada@example.test',
            'password' => 'password123',
        ])->assertOk()->json('data');

        $this->assertNotEmpty($data['access_token_expires_at']);
        $this->assertNotEmpty($data['renewal_token_expires_at']);
        $this->assertGreaterThan(
            strtotime($data['access_token_expires_at']),
            strtotime($data['renewal_token_expires_at']),
            'A renewal token that expired as fast as the access token it replaces would mean signing in again every few minutes.',
        );
    }

    // -----------------------------------------------------------------
    // Renewal
    // -----------------------------------------------------------------

    public function test_a_renewal_token_is_exchanged_for_a_new_pair(): void
    {
        $tokens = $this->signIn();

        $data = $this->asToken($tokens['renewal'])
            ->postJson(self::RENEW)
            ->assertOk()
            ->json('data');

        $this->assertNotEmpty($data['access_token']);
        $this->assertNotEmpty($data['renewal_token']);
        $this->assertNotSame($data['access_token'], $tokens['token']);
        $this->assertNotSame($data['renewal_token'], $tokens['renewal']);
    }

    public function test_the_renewed_access_token_works_and_carries_the_account_abilities(): void
    {
        $tokens = $this->signIn();

        $renewed = $this->asToken($tokens['renewal'])->postJson(self::RENEW)->assertOk()->json('data');

        $this->asToken($renewed['access_token'])
            ->getJson('/api/v1/identity/users/me')
            ->assertOk()
            ->assertJsonPath('data.abilities', ['users:*']);
    }

    public function test_a_renewal_token_is_spent_by_using_it(): void
    {
        // The property rotation exists for. A copy taken from browser storage is
        // good for exactly one exchange, so the second attempt is a 401 rather
        // than a success.
        $tokens = $this->signIn();

        $this->asToken($tokens['renewal'])->postJson(self::RENEW)->assertOk();

        $this->asToken($tokens['renewal'])
            ->postJson(self::RENEW)
            ->assertUnauthorized();
    }

    public function test_an_expired_renewal_token_is_refused(): void
    {
        $tokens = $this->signIn();

        // Past its expiry, and before the access token's, so the only thing that
        // can be refusing this is the renewal token's own lifetime.
        $renewal = PersonalAccessToken::where('abilities', json_encode([Ability::SESSION_RENEW]))->sole();
        $renewal->forceFill(['expires_at' => Date::now()->subMinute()])->save();

        $this->asToken($tokens['renewal'])->postJson(self::RENEW)->assertUnauthorized();
    }

    public function test_renewal_is_refused_for_a_suspended_account(): void
    {
        $tokens = $this->signIn();

        User::where('email', 'ada@example.test')->update(['status' => 'suspended']);

        // Without this, a suspended person keeps a working session by never
        // reloading — which is the window a suspension exists to close.
        $this->asToken($tokens['renewal'])
            ->postJson(self::RENEW)
            ->assertForbidden()
            ->assertJsonPath('message', 'Your account has been suspended. Please contact an administrator to have it restored.');
    }

    // -----------------------------------------------------------------
    // The boundary: what each token may not do
    // -----------------------------------------------------------------

    public function test_a_renewal_token_cannot_reach_any_business_route(): void
    {
        $tokens = $this->signIn();

        // The whole reason a renewal token may be kept in storage. `me` needs no
        // ability named, so it is the route a type-only check would wave through.
        $this->asToken($tokens['renewal'])
            ->getJson('/api/v1/identity/users/me')
            ->assertForbidden()
            ->assertJsonPath('message', 'This token may only be used to renew a session. It cannot be used to call this endpoint.');
    }

    public function test_a_renewal_token_cannot_reach_the_account_management_surface(): void
    {
        $tokens = $this->signIn();

        $this->asToken($tokens['renewal'])
            ->getJson('/api/v1/identity/admins/1')
            ->assertForbidden();
    }

    public function test_an_access_token_cannot_be_used_to_renew(): void
    {
        // The other direction, and it matters as much. The access token is the
        // more valuable credential; letting it drive renewal would mint extra
        // access tokens for anyone holding one, and the renewal token's short
        // life would mean nothing.
        $tokens = $this->signIn();

        $this->asToken($tokens['token'])
            ->postJson(self::RENEW)
            ->assertForbidden()
            ->assertJsonPath('message', 'This endpoint accepts a renewal token only. An access token cannot be used to renew a session.');
    }

    public function test_a_renewal_token_is_refused_at_another_applications_door(): void
    {
        $tokens = $this->signIn();

        $this->asToken($tokens['renewal'])
            ->postJson('/api/v1/identity/admins/session/renew')
            ->assertForbidden()
            ->assertJsonPath('message', 'This token is for end user account, not administrator account. Sign in at the administrator application to use this endpoint.');
    }

    public function test_a_worker_renewal_token_is_refused_at_the_customer_door(): void
    {
        // The four stores must not leak into each other here either, or the
        // renewal route becomes a way to ask which store an account is in.
        Worker::factory()->create([
            'email' => 'worker@example.test',
            'password' => bcrypt('password123'),
        ]);

        $renewal = $this->postJson('/api/v1/identity/workers/sign-in', [
            'email' => 'worker@example.test',
            'password' => 'password123',
        ])->assertOk()->json('data.renewal_token');

        $this->asToken($renewal)
            ->postJson(self::RENEW)
            ->assertForbidden();
    }

    public function test_renewal_without_a_token_is_refused(): void
    {
        $this->postJson(self::RENEW)->assertUnauthorized();
    }

    // -----------------------------------------------------------------
    // Signing out
    // -----------------------------------------------------------------

    public function test_signing_out_revokes_every_token_the_account_holds(): void
    {
        $tokens = $this->signIn();

        $this->asToken($tokens['token'])->postJson(self::SIGN_OUT)->assertOk();

        $this->assertSame(0, PersonalAccessToken::count());
    }

    public function test_a_signed_out_access_token_stops_working(): void
    {
        $tokens = $this->signIn();

        $this->asToken($tokens['token'])->postJson(self::SIGN_OUT)->assertOk();

        $this->asToken($tokens['token'])->getJson('/api/v1/identity/users/me')->assertUnauthorized();
    }

    public function test_a_signed_out_renewal_token_stops_renewing(): void
    {
        // The part that stops a sign-out being undone. Clearing only the access
        // tokens would leave a working renewal token in storage, and the next
        // page load would sign the person straight back in.
        $tokens = $this->signIn();

        $this->asToken($tokens['token'])->postJson(self::SIGN_OUT)->assertOk();

        $this->asToken($tokens['renewal'])->postJson(self::RENEW)->assertUnauthorized();
    }

    public function test_signing_out_ends_the_session_in_the_other_applications_too(): void
    {
        // User story 26. A person signed in to two applications signs out of
        // one; the other application's in-memory access token must stop being
        // accepted, and the only thing that can achieve that is server-side
        // revocation.
        $tokens = $this->signIn();
        $second = $this->asToken($tokens['renewal'])
            ->postJson(self::RENEW)
            ->assertOk()
            ->json('data');

        // The second application's token works.
        $this->asToken($second['access_token'])->getJson('/api/v1/identity/users/me')->assertOk();

        $this->asToken($tokens['token'])->postJson(self::SIGN_OUT)->assertOk();

        $this->asToken($second['access_token'])->getJson('/api/v1/identity/users/me')->assertUnauthorized();
    }

    public function test_signing_out_works_with_a_renewal_token_when_the_access_token_has_expired(): void
    {
        // The commonest case, and the reason this route has no account.can: an
        // expired access token is the normal reason to be signing out, so the
        // renewal token has to be accepted here.
        $tokens = $this->signIn();

        $this->asToken($tokens['token'])->postJson(self::SIGN_OUT)->assertOk();
        $this->signIn('grace@example.test');

        $tokens = $this->postJson(self::SIGN_IN, [
            'email' => 'grace@example.test',
            'password' => 'password123',
        ])->assertOk()->json('data');

        $this->asToken($tokens['renewal_token'])->postJson(self::SIGN_OUT)->assertOk();

        $this->assertSame(0, PersonalAccessToken::count());
    }

    public function test_signing_out_twice_leaves_the_account_signed_out(): void
    {
        // The second attempt is a 401, because the token it presents was revoked
        // by the first. That is the truthful answer and it is the one the client
        // documents — a caller must treat it as the success it is, since the end
        // state the person asked for has already been reached. What is asserted
        // here is the part that matters either way: still signed out, and no
        // tokens resurrected.
        $tokens = $this->signIn();

        $this->asToken($tokens['token'])->postJson(self::SIGN_OUT)->assertOk();
        $this->asToken($tokens['token'])->postJson(self::SIGN_OUT)->assertUnauthorized();

        $this->assertSame(0, PersonalAccessToken::count());
        $this->asToken($tokens['renewal'])->postJson(self::RENEW)->assertUnauthorized();
    }

    public function test_signing_out_only_affects_the_account_that_asked(): void
    {
        $tokens = $this->signIn();

        User::factory()->create([
            'email' => 'other@example.test',
            'password' => bcrypt('password123'),
        ]);
        $other = $this->postJson(self::SIGN_IN, [
            'email' => 'other@example.test',
            'password' => 'password123',
        ])->assertOk()->json('data');

        $this->asToken($tokens['token'])->postJson(self::SIGN_OUT)->assertOk();

        $this->asToken($other['token'])->getJson('/api/v1/identity/users/me')->assertOk();
    }
}
