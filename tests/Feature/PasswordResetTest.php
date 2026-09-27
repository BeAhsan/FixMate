<?php

namespace Tests\Feature;

use App\Application\IdentityAndAccess\Exceptions\InvalidPasswordResetToken;
use App\Application\IdentityAndAccess\UseCases\CompletePasswordReset;
use App\Application\IdentityAndAccess\UseCases\RequestPasswordReset;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\Concerns\InteractsWithPasswordResets;
use Tests\TestCase;

/**
 * Recovering an account by resetting its password, at each of the four
 * applications.
 *
 * Every test here runs once per account type, so a door that behaves
 * differently from the other three fails as its own test case rather than as a
 * message inside somebody else's. That matters more than it sounds: the four
 * flows are four copies of one idea, and a test that asserted the idea once
 * would pass with three of the four doors wired to the wrong store — the
 * failure being the second of the three security properties, and the kind that
 * changes somebody else's password without any visible sign.
 *
 * The assertions are all made from outside. Nothing here reaches into a
 * repository, a broker or a model to check what happened; a password is proved
 * changed by signing in with it, and a token is proved spent by being told it is
 * no longer valid.
 */
class PasswordResetTest extends TestCase
{
    use InteractsWithPasswordResets;
    use RefreshDatabase;

    /**
     * A password the policy accepts, and that is not any store's original one.
     */
    private const NEW_PASSWORD = 'a-freshly-chosen-Password1!';

    /**
     * One case per account type, so each of the four flows is covered as its own
     * test rather than as an iteration inside somebody else's.
     *
     * @return array<string, array{string}>
     */
    public static function doorProvider(): array
    {
        return [
            'users' => ['users'],
            'workers' => ['workers'],
            'admins' => ['admins'],
            'super admins' => ['super_admins'],
        ];
    }

    protected function setUp(): void
    {
        parent::setUp();

        $this->forgetThrottle();
    }

    /**
     * A link can be requested, and it is addressed to the application that owns
     * the account.
     *
     * The URL check is part of the same claim, not decoration. The link is the
     * only way into the flow, and the four applications are four different
     * pages: a link built with the wrong page's address would still work, would
     * still be a working recovery flow, and would hand the person a token
     * through a page that is not the one holding their account.
     */
    #[DataProvider('doorProvider')]
    public function test_a_reset_link_can_be_requested_at_this_application(string $owner): void
    {
        $this->createAccount($owner, [
            'email' => 'someone@example.com',
            'password' => $this->passwordFor($owner),
        ]);

        $link = $this->requestResetLinkAndReadIt($owner, 'someone@example.com');

        $this->assertSame(
            'someone@example.com',
            $link['email'],
            'The link must be addressed to the account that asked for it.',
        );

        $this->assertStringContainsString(
            (string) config('password-reset.urls.'.$owner),
            $link['body'],
            "The {$owner} door must build its link with that application's own reset page.",
        );
    }

    /**
     * Asking for a link says the same thing, and sends the same thing, whether
     * or not the address belongs to an account.
     *
     * Three requests are compared byte for byte: for a real account, for an
     * address no store holds, and for the real account a second time inside the
     * broker's own per-address window. The third is the one that is easy to
     * forget — the broker remembers it issued a link minutes ago, so an
     * implementation that passed that status through would be telling a caller
     * that this address is registered, and doing it on the second request of an
     * ordinary retry.
     */
    #[DataProvider('doorProvider')]
    public function test_asking_for_a_link_reveals_whether_the_address_exists(string $owner): void
    {
        $this->createAccount($owner, [
            'email' => 'someone@example.com',
            'password' => $this->passwordFor($owner),
        ]);

        $before = $this->sentMessages()->count();

        $known = $this->requestResetLink($owner, 'someone@example.com');
        $unknown = $this->requestResetLink($owner, self::STRANGER);
        $alreadySent = $this->requestResetLink($owner, 'someone@example.com');

        foreach (['an address that holds an account' => $known, 'an address that holds nothing' => $unknown, 'a second request for the same account' => $alreadySent] as $case => $response) {
            $this->assertSame(202, $response->status(), "{$case} must be accepted at the {$owner} door.");
            $this->assertSame(
                $known->headers->get('content-type'),
                $response->headers->get('content-type'),
                "{$case} must answer with the same content type as an address the store holds.",
            );
            $this->assertSame(
                $known->getContent(),
                $response->getContent(),
                "{$case} must return a byte-for-byte identical body to an address the store holds.",
            );
        }

        $this->assertSame(
            ['data' => ['message' => RequestPasswordReset::ACKNOWLEDGEMENT]],
            $known->json(),
            'The acknowledgement must promise nothing about whether the address is registered.',
        );

        // Exactly one message for the whole group: the second request for a real
        // account was throttled by the broker, and the stranger got nothing.
        $this->assertCount(
            1,
            $this->sentMessages()->slice($before),
            'Only the first request for a real address may send a message; an unknown address must send none.',
        );
    }

    /**
     * A link is good for exactly one reset.
     *
     * The second attempt is the forwarded-email case: a message that reached
     * somebody else's inbox is worth nothing once the account's owner has used
     * it. Both the refusal and the fact that the password is still the one just
     * set are asserted, because a broker that returned a refusal while leaving
     * the token redeemable would satisfy the first and be a real hole.
     */
    #[DataProvider('doorProvider')]
    public function test_the_link_works_exactly_once(string $owner): void
    {
        $this->createAccount($owner, [
            'email' => 'someone@example.com',
            'password' => $this->passwordFor($owner),
        ]);

        $link = $this->requestResetLinkAndReadIt($owner, 'someone@example.com');

        $this->completeReset($owner, [
            'email' => $link['email'],
            'token' => $link['token'],
            'password' => self::NEW_PASSWORD,
        ])->assertOk()->assertJson(['data' => ['message' => CompletePasswordReset::CONFIRMATION]]);

        $this->forgetThrottle();

        $reused = $this->completeReset($owner, [
            'email' => $link['email'],
            'token' => $link['token'],
            'password' => 'a-second-attempt-Password1!',
        ]);

        $this->assertSame(422, $reused->status(), 'A spent link must be refused.');
        $this->assertSame(
            [InvalidPasswordResetToken::MESSAGE],
            $reused->json('errors.password_reset'),
            'A spent link must be refused in the same words as any other dead link.',
        );

        $this->signInAt($owner, 'someone@example.com', self::NEW_PASSWORD)->assertOk();
    }

    /**
     * A link stops working when it ages out, and an old message in an inbox is
     * then worth nothing.
     *
     * The expiry is the one already configured for these brokers, and the test
     * moves the clock past it rather than shortening it, so the number the
     * platform promises is the number exercised. The old password still signing
     * in afterwards is what shows the refusal did not quietly change anything.
     */
    #[DataProvider('doorProvider')]
    public function test_the_link_expires(string $owner): void
    {
        $this->createAccount($owner, [
            'email' => 'someone@example.com',
            'password' => $this->passwordFor($owner),
        ]);

        $link = $this->requestResetLinkAndReadIt($owner, 'someone@example.com');

        $this->travel((int) config('auth.passwords.'.$owner.'.expire') + 1)->minutes();

        $expired = $this->completeReset($owner, [
            'email' => $link['email'],
            'token' => $link['token'],
            'password' => self::NEW_PASSWORD,
        ]);

        $this->assertSame(422, $expired->status(), 'A link past its expiry must be refused.');
        $this->assertSame(
            [InvalidPasswordResetToken::MESSAGE],
            $expired->json('errors.password_reset'),
        );

        $this->signInAt($owner, 'someone@example.com', $this->plainPasswordFor($owner))->assertOk();
    }

    /**
     * Only the account the reset was requested for is changed.
     *
     * The same person is given an account in all four stores, each with its own
     * password, and the reset is performed at this application's door. The other
     * three are then proved untouched by signing in at their own doors with the
     * passwords they had before — a check made through the sign-in endpoints
     * rather than by reading the tables, so what is asserted is that those
     * accounts still work, not merely that their rows were not written to.
     */
    #[DataProvider('doorProvider')]
    public function test_only_the_account_the_reset_was_requested_for_is_changed(string $owner): void
    {
        foreach ($this->owners() as $store) {
            $this->createAccount($store, [
                'email' => 'one-person@example.com',
                'password' => $this->passwordFor($store),
            ]);
        }

        $link = $this->requestResetLinkAndReadIt($owner, 'one-person@example.com');

        $this->completeReset($owner, [
            'email' => $link['email'],
            'token' => $link['token'],
            'password' => self::NEW_PASSWORD,
        ])->assertOk();

        $this->signInAt($owner, 'one-person@example.com', self::NEW_PASSWORD)->assertOk();

        foreach ($this->owners() as $store) {
            if ($store === $owner) {
                continue;
            }

            $this->forgetThrottle();

            $this->signInAt($store, 'one-person@example.com', $this->plainPasswordFor($store))
                ->assertOk();
        }
    }

    /**
     * A password the policy refuses is refused before the link is spent.
     *
     * Order is the whole point of this one. A link is single use, so checking the
     * new password after redeeming the token would burn the link on a
     * submission that was never going to be accepted and leave the person with
     * no way to finish. So the refusal is asserted, and then the same link is
     * redeemed successfully — which it could not be if the bad attempt had
     * consumed it.
     */
    #[DataProvider('doorProvider')]
    public function test_an_unacceptable_new_password_is_refused_and_the_link_survives_it(string $owner): void
    {
        $this->createAccount($owner, [
            'email' => 'someone@example.com',
            'password' => $this->passwordFor($owner),
        ]);

        $link = $this->requestResetLinkAndReadIt($owner, 'someone@example.com');

        foreach (['short' => 'short', 'no-symbols' => 'NoSymbolsAtAll1', 'too-simple' => 'password'] as $case => $unacceptable) {
            $this->forgetThrottle();

            $refused = $this->completeReset($owner, [
                'email' => $link['email'],
                'token' => $link['token'],
                'password' => $unacceptable,
            ]);

            $this->assertSame(
                422,
                $refused->status(),
                "A {$case} password must be refused at the {$owner} door.",
            );
            $this->assertNotEmpty(
                $refused->json('errors.password'),
                "A {$case} password must be refused with a reason, filed against the password.",
            );
        }

        $this->completeReset($owner, [
            'email' => $link['email'],
            'token' => $link['token'],
            'password' => self::NEW_PASSWORD,
        ])->assertOk();
    }

    /**
     * The new password signs in, and the old one stops working.
     *
     * Both halves go through the sign-in endpoint, because "the password
     * changed" is only worth anything if the account can be used with it and
     * cannot be used with the one it replaced.
     */
    #[DataProvider('doorProvider')]
    public function test_the_new_password_signs_in_and_the_old_one_no_longer_does(string $owner): void
    {
        $this->createAccount($owner, [
            'email' => 'someone@example.com',
            'password' => $this->passwordFor($owner),
        ]);

        $link = $this->requestResetLinkAndReadIt($owner, 'someone@example.com');

        $this->completeReset($owner, [
            'email' => $link['email'],
            'token' => $link['token'],
            'password' => self::NEW_PASSWORD,
        ])->assertOk();

        $accepted = $this->signInAt($owner, 'someone@example.com', self::NEW_PASSWORD);

        $accepted->assertOk();
        $this->assertSame(
            $this->doors()[$owner]['abilities'],
            $accepted->json('data.abilities'),
            "The {$owner} door must still issue its own abilities after a reset.",
        );

        $this->forgetThrottle();

        $this->signInAt($owner, 'someone@example.com', $this->plainPasswordFor($owner))
            ->assertUnprocessable();
    }

    /**
     * A reset revokes the API tokens the account was already using.
     *
     * A person resets their password because they think somebody else may have
     * it, so leaving the credentials they were stolen with usable would defeat
     * the flow. The check is against the token table rather than through an HTTP
     * request because no authenticated endpoint exists yet to make it through —
     * the only seam available for "this token no longer authenticates" is the
     * record of it, and it is asserted as a state change rather than by
     * simulating one.
     */
    #[DataProvider('doorProvider')]
    public function test_a_reset_revokes_the_accounts_existing_tokens(string $owner): void
    {
        $this->createAccount($owner, [
            'email' => 'someone@example.com',
            'password' => $this->passwordFor($owner),
        ]);

        $existing = $this->signInAt($owner, 'someone@example.com', $this->plainPasswordFor($owner))
            ->assertOk()
            ->json('data.token');

        $this->assertNotNull(
            PersonalAccessToken::findToken($existing),
            'The sign-in must have issued a token for this test to revoke.',
        );

        $this->forgetThrottle();

        $link = $this->requestResetLinkAndReadIt($owner, 'someone@example.com');

        $this->completeReset($owner, [
            'email' => $link['email'],
            'token' => $link['token'],
            'password' => self::NEW_PASSWORD,
        ])->assertOk();

        $this->assertNull(
            PersonalAccessToken::findToken($existing),
            'A reset must revoke the tokens that were working before it, or a stolen session outlives the password.',
        );
    }
}
