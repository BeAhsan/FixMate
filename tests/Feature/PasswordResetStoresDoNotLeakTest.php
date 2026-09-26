<?php

namespace Tests\Feature;

use App\Application\IdentityAndAccess\Exceptions\InvalidPasswordResetToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Concerns\InteractsWithPasswordResets;
use Tests\TestCase;

/**
 * A password reset changes the account it was requested for, and only that one.
 *
 * This is the second of the three security properties, and it is the one a
 * mistake in which produces no visible failure at all. Sign-in got the same
 * treatment in `CredentialStoresDoNotLeakTest`, and the reason it needed saying
 * there applies here with an extra edge: a person may hold an account in several
 * stores under one address, so a reset that resolved "the account for this
 * address" instead of "the account for this address *at this door*" would pick
 * the wrong one, change the wrong person's password, mail a working link, and
 * answer every request with a perfectly ordinary-looking response. Nothing
 * anywhere would be red.
 *
 * So the claims are made the only way they can be trusted: through the four HTTP
 * doors, with the other stores checked afterwards by signing in at their own
 * sign-in endpoints with the passwords they had before. A reset that touched the
 * wrong store fails here, and it fails by the other store's sign-in no longer
 * working.
 *
 * Every ordered pair of stores is walked, not a sample of them. A property that
 * held for the workers door and not the administrators one would be a real bug,
 * and the only way to know which is which is to run all of them.
 */
class PasswordResetStoresDoNotLeakTest extends TestCase
{
    use InteractsWithPasswordResets;
    use RefreshDatabase;

    /**
     * The address one person holds in every store, so that "which account does
     * this reset belong to" has four possible answers and only one is right.
     */
    private const ONE_PERSON = 'one-person@example.com';

    /**
     * A password that satisfies the policy, and belongs to no store.
     */
    private const NEW_PASSWORD = 'a-freshly-chosen-Password1!';

    protected function setUp(): void
    {
        parent::setUp();

        $this->forgetThrottle();
    }

    /**
     * A reset at one door leaves every other store's account for the same
     * address working, with the password it had.
     *
     * Both directions are walked, because a scoping mistake need not be
     * symmetric — a workers door that reached into the users table would be
     * caught here, and one that the users door could reach into would not be
     * caught by only testing the first order.
     */
    public function test_a_reset_at_one_door_leaves_the_other_stores_accounts_untouched(): void
    {
        foreach ($this->owners() as $door) {
            foreach ($this->owners() as $other) {
                if ($door === $other) {
                    continue;
                }

                $this->forgetThrottle();
                $this->givenOnePersonWithAnAccountInEveryStore();

                $this->resetPasswordAt($door, self::ONE_PERSON, self::NEW_PASSWORD);

                $this->signInAt($door, self::ONE_PERSON, self::NEW_PASSWORD)
                    ->assertOk();

                $this->forgetThrottle();

                $untouched = $this->signInAt($other, self::ONE_PERSON, $this->plainPasswordFor($other));

                $this->forgetThrottle();

                $untouched->assertOk(
                    null,
                    "A reset at the {$door} door must not change the {$other} account of the same person.",
                );
            }
        }
    }

    /**
     * A link issued at one door cannot be redeemed at another.
     *
     * The other half of the same property, and the one that says *why* the four
     * stores get four token tables rather than one table with a type column. A
     * token is a row in the issuing store's own table, hashed; the other broker
     * never reads that table, so there is no row there for it to find. The
     * refusal has to be the ordinary dead-link refusal, and both accounts then
     * have to still work with the passwords they had — the redeeming store
     * included, since the interesting failure is the cross store that
     * *succeeded*.
     */
    public function test_a_link_issued_at_one_door_cannot_be_redeemed_at_another(): void
    {
        foreach ($this->owners() as $issuer) {
            foreach ($this->owners() as $redeemer) {
                if ($issuer === $redeemer) {
                    continue;
                }

                $this->forgetThrottle();
                $this->travelPastTheLinkThrottle();
                $this->givenOnePersonWithAnAccountInEveryStore();

                $link = $this->requestResetLinkAndReadIt($issuer, self::ONE_PERSON);

                $this->forgetThrottle();

                $attempt = $this->completeReset($redeemer, [
                    'email' => $link['email'],
                    'token' => $link['token'],
                    'password' => 'a-different-Password1!',
                ]);

                $this->assertSame(
                    422,
                    $attempt->status(),
                    "A {$issuer} link must not be redeemable at the {$redeemer} door.",
                );
                $this->assertSame(
                    [InvalidPasswordResetToken::MESSAGE],
                    $attempt->json('errors.password_reset'),
                    "The {$redeemer} door must refuse a {$issuer} link as an ordinary dead link.",
                );

                $this->forgetThrottle();

                $this->signInAt($issuer, self::ONE_PERSON, $this->plainPasswordFor($issuer))
                    ->assertOk("A refused redemption must leave the {$issuer} account's password alone.");

                $this->forgetThrottle();

                $this->signInAt($redeemer, self::ONE_PERSON, $this->plainPasswordFor($redeemer))
                    ->assertOk("A {$issuer} link must not change the {$redeemer} account's password.");
            }
        }
    }

    /**
     * One person holding an account in every store can recover each of them
     * independently, and each recovery leaves the other three alone.
     *
     * The flow a real person is in: they are a customer and a worker, they have
     * forgotten the worker password, and afterwards they must be able to sign in
     * to both applications — and then recover the customer account too, without
     * the first recovery having made that impossible. Each store's password is
     * therefore checked against whichever it should hold at that point in the
     * walk: the recovered one, or the original.
     */
    public function test_one_person_can_recover_each_of_their_accounts_independently(): void
    {
        $this->givenOnePersonWithAnAccountInEveryStore();

        $recovered = [];

        foreach ($this->owners() as $door) {
            $this->forgetThrottle();

            $password = 'recovered-'.$door.'-Password1!';

            $this->resetPasswordAt($door, self::ONE_PERSON, $password);
            $recovered[$door] = $password;

            $this->signInAt($door, self::ONE_PERSON, $password)->assertOk();

            foreach ($this->owners() as $other) {
                $this->forgetThrottle();

                $this->signInAt($other, self::ONE_PERSON, $recovered[$other] ?? $this->plainPasswordFor($other))
                    ->assertOk("Recovering the {$door} account must leave the {$other} account usable.");
            }
        }
    }

    /**
     * The four stores keep their reset tokens in four different tables.
     *
     * The structural backstop under the three tests above. Two things are
     * asserted, and they fail differently on purpose:
     *
     * - The configuration gives each broker a table of its own. This is the
     *   assertion that catches two brokers being pointed at one table, which
     *   every behavioural test here would otherwise sail past: a shared table
     *   does not by itself break a door, it removes the reason the doors cannot
     *   be confused. (It was added after exactly that mutation was tried and
     *   only the cross-store redemption test caught it.)
     * - A request at one door writes a row to that store's table and to no
     *   other. Read from the database rather than from the configuration,
     *   because a broker configured one way and writing somewhere else is the
     *   failure that matters, and configuration alone would not show it.
     */
    public function test_each_store_keeps_its_reset_tokens_in_its_own_table(): void
    {
        $tables = [
            'users' => 'password_reset_tokens',
            'workers' => 'worker_password_reset_tokens',
            'admins' => 'admin_password_reset_tokens',
            'super_admins' => 'super_admin_password_reset_tokens',
        ];

        $configured = array_map(
            fn (string $broker): mixed => config('auth.passwords.'.$broker.'.table'),
            array_keys($tables),
        );

        $this->assertSame(
            array_values($tables),
            $configured,
            'Each broker must own a reset-token table of its own.',
        );

        $this->assertCount(
            4,
            array_unique($configured),
            'Two brokers sharing a reset-token table would make a cross-store token possible again.',
        );

        foreach ($this->owners() as $owner) {
            $this->forgetThrottle();
            $this->travelPastTheLinkThrottle();

            // An address per store, so each iteration's row is the only one in
            // any of the four tables and a leftover from the previous iteration
            // cannot be read as a leak.
            $email = 'a-person-in-the-'.str_replace('_', '-', $owner).'-store@example.com';

            $this->createAccount($owner, [
                'email' => $email,
                'password' => $this->passwordFor($owner),
            ]);

            $this->requestResetLinkAndReadIt($owner, $email);

            foreach ($tables as $store => $table) {
                $this->assertSame(
                    $store === $owner ? 1 : 0,
                    DB::table($table)->where('email', $email)->count(),
                    "A request at the {$owner} door must write this address's token to {$table} and to no other "
                    .'reset-token table.',
                );
            }
        }
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    /**
     * Give the same person an account in all four stores, each with that store's
     * own password, replacing whatever a previous pair left behind.
     *
     * Replaced rather than merely created because these tests walk several pairs
     * in one method, and a password a previous pair already changed would decide
     * what the next pair finds.
     */
    private function givenOnePersonWithAnAccountInEveryStore(): void
    {
        foreach ($this->owners() as $owner) {
            $this->modelFor($owner)::query()
                ->where('email', self::ONE_PERSON)
                ->delete();

            $this->createAccount($owner, [
                'email' => self::ONE_PERSON,
                'password' => $this->passwordFor($owner),
            ]);
        }
    }

    /**
     * Request a link at one door and spend it there.
     */
    private function resetPasswordAt(string $owner, string $email, string $password): void
    {
        $link = $this->requestResetLinkAndReadIt($owner, $email);

        $this->completeReset($owner, [
            'email' => $link['email'],
            'token' => $link['token'],
            'password' => $password,
        ])->assertOk();
    }
}
