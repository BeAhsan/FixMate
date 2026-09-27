<?php

namespace Tests\Feature;

use App\Application\IdentityAndAccess\Exceptions\PasswordUnchanged;
use App\Application\IdentityAndAccess\UseCases\ChangeOwnPassword;
use App\Domain\IdentityAndAccess\ValueObjects\Ability;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;
use App\Models\Admin;
use App\Models\SuperAdmin;
use App\Models\User;
use App\Models\Worker;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\NewAccessToken;
use Tests\TestCase;

/**
 * Story 21: an account holding a password its owner never chose must replace it
 * before it can be used.
 *
 * The flag is reported at sign-in so a front end can route to the change screen,
 * and that report is a *courtesy*. The control is `EnsurePasswordChanged`, and
 * almost everything here is about the control rather than the flag: a client that
 * ignores the sign-in response completely must still be unable to reach anything.
 *
 * Every assertion is made over HTTP with a real token, because the failure this
 * guards against is a client that never went through the user interface.
 */
class MustChangePasswordTest extends TestCase
{
    use RefreshDatabase;

    private const CURRENT = 'the-password-in-use';

    private const NEW = 'a-brand-new-password-1A';

    // ---------------------------------------------------------------------
    // Sign-in reports it.
    // ---------------------------------------------------------------------

    public function test_sign_in_reports_that_the_password_must_change(): void
    {
        $account = $this->flagged(User::factory()->create(['must_change_password' => true]));

        $response = $this->postJson('/api/v1/identity/users/sign-in', [
            'email' => $account->email,
            'password' => self::CURRENT,
        ]);

        $response->assertOk();

        // At the top level, beside `abilities` — it describes what this credential
        // may do next rather than adding another fact about the person.
        $this->assertTrue(
            $response->json('data.must_change_password'),
            'Sign-in should report that the password must change.',
        );
    }

    public function test_sign_in_reports_false_for_an_account_that_chose_its_own(): void
    {
        $account = $this->unflagged(User::factory()->create());

        $this->postJson('/api/v1/identity/users/sign-in', [
            'email' => $account->email,
            'password' => self::CURRENT,
        ])->assertOk()->assertJsonPath('data.must_change_password', false);
    }

    // ---------------------------------------------------------------------
    // The control: everything else is refused.
    // ---------------------------------------------------------------------

    public function test_an_account_that_must_change_its_password_cannot_reach_its_own_door(): void
    {
        $token = $this->flaggedToken(User::class, 'users:*');

        $this->actingAsToken($token)
            ->getJson('/api/v1/identity/users/me')
            ->assertForbidden();
    }

    public function test_it_cannot_reach_another_accounts_door_either(): void
    {
        $token = $this->flaggedToken(User::class, 'users:*');

        // The account-management surface, refused here for the password and not for
        // the ability — a client that read the sign-in flag wrongly and tried the
        // most privileged thing available gets the same answer either way.
        $this->actingAsToken($token)
            ->getJson('/api/v1/identity/accounts')
            ->assertForbidden();
    }

    public function test_a_super_administrator_in_the_same_state_is_refused_too(): void
    {
        $token = $this->flaggedToken(SuperAdmin::class, [Ability::WILDCARD]);

        $this->actingAsToken($token)
            ->getJson('/api/v1/identity/super-admins/me')
            ->assertForbidden();
    }

    public function test_the_message_says_what_to_do_rather_than_that_it_is_unauthorised(): void
    {
        $token = $this->flaggedToken(User::class, 'users:*');

        $message = $this->actingAsToken($token)
            ->getJson('/api/v1/identity/users/me')
            ->assertForbidden()
            ->json('message');

        // A 403 is right — the token is valid and the account is active, and saying
        // otherwise would send the front end back to the sign-in screen, which would
        // loop. But the message has to be actionable, or a 403 here is
        // indistinguishable from a suspension to whoever is reading it.
        $this->assertStringContainsString('new password', (string) $message);
    }

    public function test_renewal_is_refused_too_which_is_the_whole_point(): void
    {
        $account = $this->flagged(User::factory()->create());
        $renewal = $account->createToken('api', [Ability::SESSION_RENEW]);

        $this->actingAsToken($renewal)
            ->postJson('/api/v1/identity/users/session/renew')
            ->assertForbidden();

        // A renewal token that kept buying access tokens would let the whole rule be
        // defeated by standing still, so this is the assertion that makes the guard
        // mean something. It is in `auth:sanctum`'s group, which is where renewal
        // lives, and the guard is on the group.
        $this->assertDatabaseCount('personal_access_tokens', 1);
    }

    public function test_sign_out_is_still_allowed_because_refusing_it_would_be_a_trap(): void
    {
        $token = $this->flaggedToken(User::class, 'users:*');

        // Somebody on a shared device who must change their password is *most*
        // entitled to end the session. Refusing it would leave them in a session
        // they cannot use, on the device they are trying to leave.
        $this->actingAsToken($token)
            ->postJson('/api/v1/identity/users/sign-out')
            ->assertOk();

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_the_password_reset_flow_is_unaffected_and_remains_an_escape(): void
    {
        $account = $this->flagged(User::factory()->create());

        // Outside `auth:sanctum`, so the guard does not see it. A person who cannot
        // get through this can still use the link that was emailed to them, which is
        // why the refusal is a 403 and not a lock-out.
        // 202, not 200: the endpoint deliberately does not say whether the address
        // is registered, so it cannot answer 200 for a hit and 404 for a miss.
        $this->postJson('/api/v1/identity/users/forgot-password', [
            'email' => $account->email,
        ])->assertStatus(202);
    }

    public function test_an_account_that_does_not_need_to_change_its_password_is_untouched(): void
    {
        $account = $this->unflagged(User::factory()->create());
        $token = $account->createToken('api', ['users:*']);

        $this->actingAsToken($token)->getJson('/api/v1/identity/users/me')->assertOk();
    }

    // ---------------------------------------------------------------------
    // Changing it.
    // ---------------------------------------------------------------------

    public function test_it_replaces_the_password_and_clears_the_flag(): void
    {
        $account = $this->flagged(User::factory()->create());
        $token = $account->createToken('api', ['users:*']);

        $this->actingAsToken($token)->postJson('/api/v1/identity/users/password/change', [
            'current_password' => self::CURRENT,
            'password' => self::NEW,
        ])->assertOk();

        $this->assertFalse($account->fresh()->must_change_password);
        $this->assertTrue(Hash::check(self::NEW, $account->fresh()->password));
        $this->assertFalse(Hash::check(self::CURRENT, $account->fresh()->password));
    }

    public function test_the_same_session_keeps_working_afterwards(): void
    {
        $account = $this->flagged(User::factory()->create());
        $token = $account->createToken('api', ['users:*']);

        $this->actingAsToken($token)->postJson('/api/v1/identity/users/password/change', [
            'current_password' => self::CURRENT,
            'password' => self::NEW,
        ])->assertOk();

        // Spared, or the person would be signed out of the application they are
        // standing in at the moment they fixed it.
        $this->actingAsToken($token)->getJson('/api/v1/identity/users/me')->assertOk();
    }

    public function test_every_other_session_is_withdrawn(): void
    {
        $account = $this->flagged(User::factory()->create());
        $this->actingAsToken($account->createToken('api', ['users:*']));
        $this->actingAsToken($account->createToken('api', ['users:*']));
        $stolen = $account->createToken('api', ['users:*'])->accessToken->id;
        $token = $account->createToken('api', ['users:*']);

        $this->assertDatabaseCount('personal_access_tokens', 4);

        $this->actingAsToken($token)->postJson('/api/v1/identity/users/password/change', [
            'current_password' => self::CURRENT,
            'password' => self::NEW,
        ])->assertOk();

        // The reason for changing a password at all: a session opened with the old
        // one keeps working however new the stored hash is.
        $this->assertDatabaseCount('personal_access_tokens', 1);
        // Asserted by absence rather than by counting, so a revocation that
        // happened to leave the right *number* of rows behind would still fail.
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $stolen]);
    }

    public function test_the_new_password_works_and_the_old_one_does_not(): void
    {
        $account = $this->flagged(User::factory()->create());
        $token = $account->createToken('api', ['users:*']);

        $this->actingAsToken($token)->postJson('/api/v1/identity/users/password/change', [
            'current_password' => self::CURRENT,
            'password' => self::NEW,
        ])->assertOk();

        $this->postJson('/api/v1/identity/users/sign-in', [
            'email' => $account->email,
            'password' => self::NEW,
        ])->assertOk()->assertJsonPath('data.must_change_password', false);

        $this->postJson('/api/v1/identity/users/sign-in', [
            'email' => $account->email,
            'password' => self::CURRENT,
        ])->assertStatus(422);
    }

    public function test_the_wrong_current_password_changes_nothing(): void
    {
        $account = $this->flagged(User::factory()->create());
        $token = $account->createToken('api', ['users:*']);

        $this->actingAsToken($token)->postJson('/api/v1/identity/users/password/change', [
            'current_password' => 'not the password',
            'password' => self::NEW,
        ])->assertStatus(422)->assertJsonValidationErrors('current_password');

        // Unchanged in every respect. A refused change that half-applied would be
        // worse than one that did nothing.
        $this->assertTrue($account->fresh()->must_change_password);
        $this->assertTrue(Hash::check(self::CURRENT, $account->fresh()->password));
    }

    public function test_the_new_password_may_not_be_the_current_one(): void
    {
        $account = $this->flagged(User::factory()->create());
        $token = $account->createToken('api', ['users:*']);

        // Otherwise "you must change your password" is satisfied by typing the shared
        // password again, the flag is cleared, and nothing changed — which is the
        // exact outcome the story exists to prevent.
        $this->actingAsToken($token)->postJson('/api/v1/identity/users/password/change', [
            'current_password' => self::CURRENT,
            'password' => self::CURRENT,
        ])->assertStatus(422)->assertJsonValidationErrors('password');

        $this->assertTrue($account->fresh()->must_change_password);
    }

    /**
     * The use case refuses the old password even when the request rule did not.
     *
     * Called directly, and deliberately. Over HTTP this is unreachable:
     * `ChangePasswordRequest` carries `different:current_password`, so the request
     * layer answers first and the use case's own check never runs. That is the right
     * order — the request rule produces the message a person reads — but it means an
     * HTTP test proves the *rule*, not the use case, and mutation testing confirmed
     * it: deleting the use case's check left the suite green.
     *
     * The check stays because a use case that can be satisfied by submitting the
     * password already in use is a footgun for the next caller, and this is the only
     * assertion that can see it.
     */
    public function test_the_use_case_refuses_the_password_already_in_use(): void
    {
        $account = $this->flagged(User::factory()->create());
        $this->actingAsToken($account->createToken('api', ['users:*']));

        $this->expectException(PasswordUnchanged::class);

        app(ChangeOwnPassword::class)->execute(
            type: AccountType::User,
            accountId: $account->id,
            currentPassword: self::CURRENT,
            newPassword: self::CURRENT,
        );
    }

    /** And the same call with a genuinely new password is allowed, so the check is not simply refusing everything. */
    public function test_the_use_case_accepts_a_genuinely_new_password(): void
    {
        $account = $this->flagged(User::factory()->create());
        $this->actingAsToken($account->createToken('api', ['users:*']));

        app(ChangeOwnPassword::class)->execute(
            type: AccountType::User,
            accountId: $account->id,
            currentPassword: self::CURRENT,
            newPassword: self::NEW,
        );

        $this->assertFalse($account->fresh()->must_change_password);
    }

    public function test_a_weak_new_password_is_refused_before_anything_is_written(): void
    {
        $account = $this->flagged(User::factory()->create());
        $token = $account->createToken('api', ['users:*']);

        $this->actingAsToken($token)->postJson('/api/v1/identity/users/password/change', [
            'current_password' => self::CURRENT,
            'password' => 'short',
        ])->assertStatus(422)->assertJsonValidationErrors('password');

        $this->assertTrue($account->fresh()->must_change_password);
        $this->assertTrue(Hash::check(self::CURRENT, $account->fresh()->password));
    }

    // ---------------------------------------------------------------------
    // One door per account type, and no selector.
    // ---------------------------------------------------------------------

    public function test_each_account_type_has_its_own_door(): void
    {
        $cases = [
            ['users', User::class, '/api/v1/identity/users/password/change'],
            ['workers', Worker::class, '/api/v1/identity/workers/password/change'],
            ['admins', Admin::class, '/api/v1/identity/admins/password/change'],
            ['super-admins', SuperAdmin::class, '/api/v1/identity/super-admins/password/change'],
        ];

        foreach ($cases as [$segment, $model, $path]) {
            $account = $this->flagged($model::factory()->create());
            $token = $account->createToken('api', [$segment.':*']);

            $this->actingAsToken($token)->postJson($path, [
                'current_password' => self::CURRENT,
                'password' => self::NEW,
            ])->assertOk();

            $this->assertFalse($account->fresh()->must_change_password, "The {$segment} door should have worked.");
        }
    }

    public function test_a_token_cannot_use_another_account_types_door(): void
    {
        $account = $this->flagged(User::factory()->create());
        $token = $account->createToken('api', ['users:*']);

        // No selector in the body, so the only way to reach another account is to
        // name another type in the path — and the account type is checked, so an end
        // user's token is refused at the administrators' door. Story 33.
        $this->actingAsToken($token)->postJson('/api/v1/identity/admins/password/change', [
            'current_password' => self::CURRENT,
            'password' => self::NEW,
        ])->assertForbidden();

        $this->assertTrue($account->fresh()->must_change_password);
    }

    public function test_an_unknown_account_type_in_the_path_is_not_a_door(): void
    {
        $this->actingAsToken($this->flaggedToken(User::class, 'users:*'))
            ->postJson('/api/v1/identity/wizards/password/change', [
                'current_password' => self::CURRENT,
                'password' => self::NEW,
            ])->assertNotFound();
    }

    public function test_the_change_route_needs_a_token(): void
    {
        $this->postJson('/api/v1/identity/users/password/change', [
            'current_password' => self::CURRENT,
            'password' => self::NEW,
        ])->assertUnauthorized();
    }

    // ---------------------------------------------------------------------
    // The response.
    // ---------------------------------------------------------------------

    public function test_the_response_is_the_account_as_it_is_now_signed_in(): void
    {
        $account = $this->flagged(User::factory()->create(['name' => 'Ada Lovelace']));
        $token = $account->createToken('api', ['users:*']);

        $response = $this->actingAsToken($token)
            ->postJson('/api/v1/identity/users/password/change', [
                'current_password' => self::CURRENT,
                'password' => self::NEW,
            ])->assertOk();

        // Not an acknowledgement: the front end has just invalidated every other
        // session this account had, and needs to know who it is still signed in as
        // to render what comes next — without making a second request to find out
        // whether the change worked.
        $response->assertJsonPath('data.account.name', 'Ada Lovelace');
        $response->assertJsonPath('data.account_type', 'users');
    }

    public function test_the_new_password_is_never_echoed_back(): void
    {
        $account = $this->flagged(User::factory()->create());
        $token = $account->createToken('api', ['users:*']);

        $body = $this->actingAsToken($token)
            ->postJson('/api/v1/identity/users/password/change', [
                'current_password' => self::CURRENT,
                'password' => self::NEW,
            ])->assertOk()
            ->getContent();

        $this->assertStringNotContainsString(self::NEW, (string) $body);
        $this->assertStringNotContainsString('password', (string) $body);
    }

    // ---------------------------------------------------------------------

    /**
     * An account holding `CURRENT`, flagged.
     *
     * `forceFill` for the password because the factories set their own, and every
     * assertion here signs in with `CURRENT`. A test whose account holds the
     * factory's password and signs in with something else gets a 422 that reads as
     * a broken rule rather than a broken fixture — which is what happened to the
     * first version of this file.
     */
    private function flagged(Model $account): Model
    {
        $account->forceFill([
            'password' => Hash::make(self::CURRENT),
            'must_change_password' => true,
        ])->save();

        return $account;
    }

    /** The same, but an account that chose its own password. */
    private function unflagged(Model $account): Model
    {
        $account->forceFill([
            'password' => Hash::make(self::CURRENT),
            'must_change_password' => false,
        ])->save();

        return $account;
    }

    private function flaggedToken(string $model, array|string $abilities): NewAccessToken
    {
        $account = $model::factory()->create(['must_change_password' => true]);

        return $account->createToken('api', (array) $abilities);
    }

    /**
     * Present a Sanctum token on the next request.
     *
     * `forgetGuards` is load-bearing for the same reason it is in the other suites:
     * Laravel's guards are singletons and `RequestGuard::user()` memoises its answer,
     * so without it the second request in a test would be handed the first
     * request's account, and every "the change took effect" assertion here would pass
     * without a change having happened.
     */
    private function actingAsToken(NewAccessToken $token): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($token->plainTextToken);
    }
}
