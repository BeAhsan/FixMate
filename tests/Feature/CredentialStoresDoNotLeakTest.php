<?php

namespace Tests\Feature;

use App\Application\IdentityAndAccess\Exceptions\InvalidCredentials;
use App\Models\Admin;
use App\Models\SuperAdmin;
use App\Models\User;
use App\Models\Worker;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

/**
 * The four credential stores do not leak into each other.
 *
 * This is the file the whole four-door design rests on, and the property is
 * invisible from the inside of the code. Each of the other sign-in tests covers
 * one door with one account type; a refactor that made one endpoint fall back to
 * another table, or that read the wrong repository, would satisfy every one of
 * them and quietly turn the platform into a single store with four spellings.
 *
 * So every assertion here is made against a real HTTP response, and every one of
 * them is the shape of a *refusal*: a status, a body, or an elapsed time. A test
 * that reached past the HTTP layer into a repository or a guard would report
 * whether the wiring was right while saying nothing about whether the endpoint
 * leaks, which is the only thing in question.
 *
 * The four doors are written out rather than discovered, in the same spirit as
 * `AuthenticationSurfaceTest`: a fifth account type has to be added to this list
 * by hand, so adding one without deciding what it means for isolation fails here
 * instead of passing quietly.
 *
 * One housekeeping rule applies throughout, and it is not optional: this file
 * makes far more failed attempts at one address than any real sign-in screen
 * would, so the four limiters are cleared between groups of assertions. Without
 * that, a 429 would arrive partway through and the byte-for-byte comparisons
 * below would be comparing a throttle response with a credential refusal —
 * failing for a reason that has nothing to do with isolation. The two tests that
 * are *about* the throttle clear it deliberately instead.
 */
class CredentialStoresDoNotLeakTest extends TestCase
{
    use RefreshDatabase;

    /**
     * An address that belongs to nobody, used as the baseline every refusal is
     * compared against. Obviously absent from all four tables.
     */
    private const STRANGER = 'nobody-at-all@example.com';

    /**
     * The address one person holds in all four stores, for the tests whose point
     * is that one address can be four separate accounts.
     */
    private const ONE_PERSON = 'one-person@example.com';

    protected function setUp(): void
    {
        parent::setUp();

        $this->forgetThrottle();
    }

    // ---------------------------------------------------------------------
    // A valid credential belongs to exactly one door
    // ---------------------------------------------------------------------

    /**
     * Every credential in every store is refused by the other three doors.
     *
     * The twelve combinations run as four groups, one per source store, and each
     * group begins by signing in successfully at the door that *does* own the
     * credential. That first step is what stops the rest from being vacuous: if
     * the account were not really valid then every refusal that followed would be
     * the ordinary unknown-address refusal, and the test would pass without ever
     * having demonstrated that the other doors declined a working credential.
     * The password submitted is the correct one for the source store, so the only
     * reason another door can refuse it is that it belongs to a store that door
     * does not read.
     */
    public function test_a_valid_credential_from_another_store_is_refused_by_the_other_three_doors(): void
    {
        foreach ($this->doors() as $owner => $store) {
            $address = $this->addressHeldOnlyBy($owner);

            $this->createAccount($owner, [
                'email' => $address,
                'password' => $this->passwordFor($owner),
            ]);

            // The control: the credential is genuinely valid where it lives.
            $accepted = $this->signInAt($owner, $address, $this->plainPasswordFor($owner));

            $accepted->assertOk();
            $this->assertSame(
                $store['abilities'],
                $accepted->json('data.abilities'),
                "The {$owner} door must accept the credential it owns, or the refusals below prove nothing.",
            );

            $tokensBefore = $this->tokenCount();

            foreach ($this->owners() as $door) {
                if ($door === $owner) {
                    continue;
                }

                $this->forgetThrottle();

                $refused = $this->signInAt($door, $address, $this->plainPasswordFor($owner));

                $this->assertRefusedIdentically(
                    $this->signInAt($door, self::STRANGER, $this->plainPasswordFor($owner)),
                    $refused,
                    "a valid {$owner} credential offered to the {$door} door",
                );
            }

            $this->assertSame(
                $tokensBefore,
                $this->tokenCount(),
                "No door other than the {$owner} door may issue a token for a credential it does not own.",
            );
        }
    }

    /**
     * The refusal for a credential from another store is the same refusal an
     * unknown address gets, in status, in content type and in bytes.
     *
     * This is asserted separately from the test above because it is a different
     * claim. "Is refused" is about access; "is indistinguishable" is about what
     * the refusal teaches. An endpoint that refused correctly but answered 401
     * with a message about the administrator store would pass the first and fail
     * this, and it is the second that turns four stores back into one: a person
     * enumerating addresses against the four doors could otherwise learn which
     * of them an account exists in, without ever authenticating.
     */
    public function test_a_credential_from_another_store_is_indistinguishable_from_an_unknown_address(): void
    {
        foreach ($this->owners() as $owner) {
            $address = $this->addressHeldOnlyBy($owner);

            $this->createAccount($owner, [
                'email' => $address,
                'password' => $this->passwordFor($owner),
            ]);

            foreach ($this->owners() as $door) {
                if ($door === $owner) {
                    continue;
                }

                $this->forgetThrottle();

                $fromElsewhere = $this->signInAt($door, $address, $this->plainPasswordFor($owner));
                $unknown = $this->signInAt($door, self::STRANGER, $this->plainPasswordFor($owner));

                $this->assertRefusedIdentically(
                    $unknown,
                    $fromElsewhere,
                    "an address registered only as a {$owner}, offered to the {$door} door",
                );
            }
        }
    }

    /**
     * No door answers a refused cross-store credential with anything but a
     * declared refusal status — in particular never with a missing-record status.
     *
     * Every sign-in route performs a second, direct Eloquent lookup after the use
     * case has already resolved the account, to have something to mint the token
     * against. That lookup is a second place where the store a request is checked
     * against is decided, and it used to end in `firstOrFail()`: a layering
     * mistake or a store mix-up there produced a **404**, which is a
     * distinguishable status on a route whose only honest refusals are 422 and
     * 403. An address could then be probed for existence by watching for the 404.
     *
     * So the property is asserted as an exhaustive list of the statuses a
     * cross-store credential is allowed to produce, rather than as "not 200". The
     * list is short on purpose: it is an inventory, and a new entry has to be a
     * decision rather than a side effect.
     */
    public function test_a_cross_store_credential_is_refused_with_a_declared_status_at_every_door(): void
    {
        $allowed = [401, 403, 422];

        foreach ($this->owners() as $owner) {
            $this->createAccount($owner, [
                'email' => $this->addressHeldOnlyBy($owner),
                'password' => $this->passwordFor($owner),
            ]);

            foreach ($this->owners() as $door) {
                if ($door === $owner) {
                    continue;
                }

                $this->forgetThrottle();

                $response = $this->signInAt($door, $this->addressHeldOnlyBy($owner), $this->plainPasswordFor($owner));

                $this->assertContains(
                    $response->status(),
                    $allowed,
                    "The {$door} door must answer a valid {$owner} credential with a declared refusal status, "
                    .'not with '.$response->status().'.',
                );

                $this->assertSame(
                    ['credentials'],
                    array_keys($response->json('errors') ?? []),
                    "The {$door} door must file a cross-store refusal under the neutral key.",
                );

                $this->assertStringNotContainsString(
                    'token',
                    $response->getContent(),
                    "The {$door} door must issue nothing for a credential from another store.",
                );
            }
        }
    }

    // ---------------------------------------------------------------------
    // One person, several stores
    // ---------------------------------------------------------------------

    /**
     * One person holding an account in every store signs into each of them
     * independently, and each door answers with its own record.
     *
     * The spec accepts this cost deliberately: a person who is both a customer and
     * a worker has two accounts with two passwords. What that must never become
     * is one account seen through two doors — so this asserts that the four
     * records are told apart by the response, not merely that four sign-ins
     * succeed. Same address, four stores, four passwords, four names: the only
     * thing distinguishing the four successful responses is which store was read,
     * and each returns the record from its own table and no other.
     */
    public function test_one_person_with_an_account_in_every_store_signs_into_each_of_them(): void
    {
        foreach ($this->doors() as $owner => $store) {
            $this->createAccount($owner, [
                'name' => 'Name In The '.$owner.' Store',
                'email' => self::ONE_PERSON,
                'password' => $this->passwordFor($owner),
            ]);
        }

        foreach ($this->doors() as $owner => $store) {
            $this->forgetThrottle();

            $response = $this->signInAt($owner, self::ONE_PERSON, $this->plainPasswordFor($owner));

            $response->assertOk();
            $this->assertSame(
                $store['abilities'],
                $response->json('data.abilities'),
                "The {$owner} door must issue the {$owner} abilities, not another store's.",
            );
            $this->assertSame(
                'Name In The '.$owner.' Store',
                $response->json('data.'.$store['subject'].'.name'),
                "The {$owner} door must return the record from the {$owner} store, not from another.",
            );
            $this->assertSame(
                $this->rowIdFor($owner, self::ONE_PERSON),
                $response->json('data.'.$store['subject'].'.id'),
                "The {$owner} door must return the {$owner} row's own id, not another store's.",
            );
        }
    }

    /**
     * Another store's password is not this store's password, even for the same
     * address and the same person.
     *
     * Four accounts, one address, four passwords. If any door accepted a password
     * belonging to a different store then the four doors would be one door with
     * four spellings, and the person would be four people as far as an attacker is
     * concerned. Each refusal is compared with an ordinary wrong password, so
     * what is being asserted is that the other store's password buys nothing here
     * rather than merely that it was rejected.
     */
    public function test_a_password_from_another_store_is_refused_at_every_door(): void
    {
        foreach ($this->owners() as $owner) {
            $this->createAccount($owner, [
                'email' => self::ONE_PERSON,
                'password' => $this->passwordFor($owner),
            ]);
        }

        $tokensBefore = $this->tokenCount();

        foreach ($this->owners() as $door) {
            foreach ($this->owners() as $other) {
                if ($other === $door) {
                    continue;
                }

                $this->forgetThrottle();

                $this->assertRefusedIdentically(
                    $this->signInAt($door, self::ONE_PERSON, 'not-any-store-password'),
                    $this->signInAt($door, self::ONE_PERSON, $this->plainPasswordFor($other)),
                    "the {$other} store's password, offered to the {$door} door for the same address",
                );
            }
        }

        $this->assertSame(
            $tokensBefore,
            $this->tokenCount(),
            'No door may issue a token for another store\'s password.',
        );
    }

    /**
     * Suspending an account in one store leaves the same person's other accounts
     * working.
     *
     * The status column is per store, and the temptation it creates is to read it
     * from a neighbouring table "to be helpful" — to let a suspended customer
     * know their worker account is fine, or to refuse a worker because the
     * matching customer record is suspended. Either would couple the stores
     * through a field nobody authorised. So the suspension is applied to one
     * store only, the suspended store is checked to still be refusing in its own
     * distinctive way (403, not 422 — the one refusal that is allowed to look
     * different), and the other three are asserted to be entirely unaffected.
     */
    public function test_suspending_one_store_leaves_the_other_stores_untouched(): void
    {
        foreach ($this->owners() as $owner) {
            $this->createAccount($owner, [
                'email' => self::ONE_PERSON,
                'password' => $this->passwordFor($owner),
            ]);
        }

        $this->modelFor('workers')::query()
            ->where('email', self::ONE_PERSON)
            ->update(['status' => 'suspended']);

        $this->signInAt('workers', self::ONE_PERSON, $this->plainPasswordFor('workers'))
            ->assertForbidden();

        foreach ($this->owners() as $owner) {
            if ($owner === 'workers') {
                continue;
            }

            $this->forgetThrottle();

            $response = $this->signInAt($owner, self::ONE_PERSON, $this->plainPasswordFor($owner));

            $response->assertOk();
            $this->assertNotEmpty(
                $response->json('data.token'),
                "A suspended worker must not affect the {$owner} account of the same person.",
            );
        }
    }

    /**
     * A token issued at one door is bound to that door's model, so a credential
     * from one store cannot be laundered into an account of another.
     *
     * The four guards share one Sanctum token table, told apart by the
     * polymorphic owner column. That is the mechanism by which a token cannot
     * authenticate as an account type it was not issued for, so the cross-store
     * refusals above are only half the property: the other half is that a
     * successful sign-in is pinned to the right record, with the right abilities.
     */
    public function test_a_token_from_one_door_is_bound_to_that_stores_model(): void
    {
        foreach ($this->owners() as $owner) {
            $this->createAccount($owner, [
                'email' => $this->addressHeldOnlyBy($owner),
                'password' => $this->passwordFor($owner),
            ]);

            $this->forgetThrottle();

            $response = $this->signInAt($owner, $this->addressHeldOnlyBy($owner), $this->plainPasswordFor($owner));
            $response->assertOk();

            $token = PersonalAccessToken::findToken($response->json('data.token'));

            $this->assertNotNull($token, "The {$owner} door must issue a token.");
            $this->assertSame(
                $this->modelFor($owner),
                $token->tokenable_type,
                "A token from the {$owner} door must be owned by the {$owner} model.",
            );
            $this->assertSame(
                $this->doors()[$owner]['abilities'],
                $token->abilities,
                "A token from the {$owner} door must carry the {$owner} abilities.",
            );
            $this->assertSame(
                $this->rowIdFor($owner, $this->addressHeldOnlyBy($owner)),
                $token->tokenable_id,
                "A token from the {$owner} door must be owned by the {$owner} row.",
            );
        }
    }

    // ---------------------------------------------------------------------
    // The throttle is per store too
    // ---------------------------------------------------------------------

    /**
     * Exhausting one door does not lock the same address out of the other three.
     *
     * The throttle key is the lower-cased address plus the IP, and it is the same
     * address on purpose: exhausting on some other address would fill a different
     * bucket, and this test would pass even with one shared bucket across all four
     * doors. Each door is then checked in both directions — the exhausted door
     * must still answer 429, and each of the other three must be evaluating the
     * attempt normally (422, the ordinary credential refusal) rather than
     * refusing through the limiter (429).
     */
    public function test_exhausting_one_door_does_not_lock_the_same_address_out_of_the_other_three(): void
    {
        $maxAttempts = (int) config('auth.login_max_attempts', 5);

        foreach ($this->owners() as $owner) {
            $this->createAccount($owner, [
                'email' => self::ONE_PERSON,
                'password' => $this->passwordFor($owner),
            ]);
        }

        foreach ($this->owners() as $owner) {
            foreach ($this->owners() as $door) {
                if ($door === $owner) {
                    continue;
                }

                $this->forgetThrottle();

                for ($attempt = 0; $attempt < $maxAttempts; $attempt++) {
                    $this->signInAt($owner, self::ONE_PERSON, 'the-wrong-password')->assertUnprocessable();
                }

                // The positive control. Without it, the 422s below would also be
                // what an endpoint that never throttles at all would return, and
                // this test would pass without ever having tripped a limiter.
                $this->signInAt($owner, self::ONE_PERSON, 'the-wrong-password')->assertStatus(429);

                $this->assertSame(
                    422,
                    $this->signInAt($door, self::ONE_PERSON, 'the-wrong-password')->status(),
                    "Exhausting the {$owner} door must not lock the same address out of the {$door} door.",
                );
            }
        }
    }

    /**
     * A person throttled at one door can still sign in at the other three.
     *
     * The complement of the test above, and the one an attacker would actually
     * care about: it is not enough that the other door still *answers*, it must
     * still authenticate the person. This is the denial of service the per-store
     * limiters exist to prevent — someone who cannot sign in as a customer
     * because somebody else was guessing at the worker door.
     */
    public function test_a_person_throttled_at_one_door_can_still_sign_in_at_the_other_three(): void
    {
        $maxAttempts = (int) config('auth.login_max_attempts', 5);

        foreach ($this->owners() as $owner) {
            $this->createAccount($owner, [
                'email' => self::ONE_PERSON,
                'password' => $this->passwordFor($owner),
            ]);
        }

        foreach ($this->owners() as $owner) {
            foreach ($this->owners() as $door) {
                if ($door === $owner) {
                    continue;
                }

                $this->forgetThrottle();

                for ($attempt = 0; $attempt <= $maxAttempts; $attempt++) {
                    $this->signInAt($owner, self::ONE_PERSON, 'the-wrong-password');
                }

                $this->signInAt($owner, self::ONE_PERSON, 'the-wrong-password')->assertStatus(429);

                $this->signInAt($door, self::ONE_PERSON, $this->plainPasswordFor($door))
                    ->assertOk();
            }
        }
    }

    // ---------------------------------------------------------------------
    // The refusal cannot be measured either
    // ---------------------------------------------------------------------

    /**
     * An address that exists in another store is not detectable by how long the
     * answer takes.
     *
     * The body and the status are declared identical, and that is only half of
     * what an attacker can read. Comparing a password is deliberately slow, so a
     * door that skipped the comparison for an address it did not recognise —
     * which is exactly what an address belonging to another store looks like from
     * the inside — would answer measurably faster, and the address would be
     * enumerable by stopwatch however carefully the body is worded.
     *
     * The two requests are measured against each other rather than against a
     * wall-clock budget, and the threshold is the one
     * `SignInFailuresAreIndistinguishableTest` uses: fixed code answers within a
     * fraction of a millisecond of itself, broken code answers in about one
     * percent of the time, and 0.5 sits an order of magnitude clear of the broken
     * behaviour and a factor of two clear of the fixed one.
     *
     * The bcrypt cost is raised first because `phpunit.xml` pins it to 4, which
     * is fast enough to be lost in the noise of the surrounding request, and it
     * has to be set before anything hashes.
     */
    public function test_an_address_in_another_store_is_not_detectable_by_response_time(): void
    {
        config(['hashing.bcrypt.rounds' => 12]);

        foreach ($this->owners() as $owner) {
            $this->createAccount($owner, [
                'email' => $this->addressHeldOnlyBy($owner),
                'password' => $this->passwordFor($owner),
            ]);

            foreach ($this->owners() as $door) {
                if ($door === $owner) {
                    continue;
                }

                $this->forgetThrottle();

                // Warm up: the first comparison also pays to build the decoy hash.
                $this->signInAt($door, self::STRANGER, 'the-wrong-password');

                $unknown = $this->medianDurationOf($door, self::STRANGER, 'the-wrong-password');
                $elsewhere = $this->medianDurationOf(
                    $door,
                    $this->addressHeldOnlyBy($owner),
                    $this->plainPasswordFor($owner),
                );

                $this->assertGreaterThanOrEqual(
                    0.5,
                    $unknown / $elsewhere,
                    sprintf(
                        'The %s door refuses an address registered in %s (%.1fms) in a time comparable to its '
                        .'refusal of an unknown address (%.1fms): a skipped password comparison is an '
                        .'account-existence oracle across stores.',
                        $door,
                        $owner,
                        $elsewhere,
                        $unknown,
                    ),
                );
            }
        }
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    /**
     * The four doors, written out.
     *
     * Each entry names the sign-in address, the key the account is returned
     * under, the abilities the issued token carries, and a way to create a record
     * in that store. The abilities are not incidental: they are how a client
     * tells the four apart, so a door issuing another store's ability would be a
     * leak even when the password is right.
     *
     * @return array<string, array{
     *     path: string,
     *     subject: string,
     *     abilities: list<string>,
     *     create: callable(array<string, mixed>): Model
     * }>
     */
    private function doors(): array
    {
        return [
            'users' => [
                'path' => '/api/v1/identity/users/sign-in',
                'subject' => 'user',
                'abilities' => ['users:*'],
                'create' => fn (array $attributes): Model => User::factory()->create($attributes),
            ],
            'workers' => [
                'path' => '/api/v1/identity/workers/sign-in',
                'subject' => 'worker',
                'abilities' => ['workers:*'],
                'create' => fn (array $attributes): Model => Worker::factory()->create($attributes),
            ],
            'admins' => [
                'path' => '/api/v1/identity/admins/sign-in',
                'subject' => 'admin',
                'abilities' => ['admins:*'],
                'create' => fn (array $attributes): Model => Admin::factory()->create($attributes),
            ],
            'super_admins' => [
                'path' => '/api/v1/identity/super-admins/sign-in',
                'subject' => 'super_admin',
                'abilities' => ['*'],
                'create' => fn (array $attributes): Model => SuperAdmin::factory()->create($attributes),
            ],
        ];
    }

    /**
     * The four account type names, in door order.
     *
     * @return list<string>
     */
    private function owners(): array
    {
        return array_keys($this->doors());
    }

    /**
     * The Eloquent model behind one of the four stores.
     *
     * @return class-string<Model>
     */
    private function modelFor(string $owner): string
    {
        return match ($owner) {
            'users' => User::class,
            'workers' => Worker::class,
            'admins' => Admin::class,
            'super_admins' => SuperAdmin::class,
        };
    }

    /**
     * An address that exists in exactly one store, and is registered under that
     * store's own password.
     *
     * Distinct per store on purpose. Most of the assertions below compare two
     * refusals made at the same door, and reusing one address across all four
     * stores would make the second one about throttling rather than about
     * isolation.
     */
    private function addressHeldOnlyBy(string $owner): string
    {
        return 'held-only-as-'.str_replace('_', '-', $owner).'@example.com';
    }

    /**
     * The plaintext password belonging to one store. One password per store, so
     * that a password is as identifying of a store as an address is.
     */
    private function plainPasswordFor(string $owner): string
    {
        return 'password-of-'.$owner;
    }

    /**
     * The hash of that store's password, at the configured cost.
     */
    private function passwordFor(string $owner): string
    {
        return Hash::make($this->plainPasswordFor($owner));
    }

    /**
     * The id of a row in one of the four stores.
     */
    private function rowIdFor(string $owner, string $email): int
    {
        return (int) $this->modelFor($owner)::query()->where('email', $email)->value('id');
    }

    /**
     * Create a record in one of the four stores.
     *
     * @param  array<string, mixed>  $attributes
     */
    private function createAccount(string $owner, array $attributes): Model
    {
        return ($this->doors()[$owner]['create'])($attributes);
    }

    /**
     * Post credentials to one of the four sign-in addresses.
     */
    private function signInAt(string $door, string $email, string $password): TestResponse
    {
        return $this->postJson($this->doors()[$door]['path'], [
            'email' => $email,
            'password' => $password,
        ]);
    }

    /**
     * Empty every sign-in throttle bucket, for every address.
     *
     * The tempting call here is `RateLimiter::clear('login.users')`, and it does
     * not do what it reads like. `clear()` takes the *throttle key* the counter is
     * stored under — the lower-cased address and the IP — not the name of a
     * limiter, so passing a limiter name clears a key nothing is counting. The
     * counters are gone by the only other means available, which is flushing the
     * array store the test suite runs on. (Worth knowing for the same reason:
     * the `RateLimiter::clear()` in `SignInIsThrottledTest::setUp()` clears
     * nothing, and that test is sound only because the array cache is rebuilt for
     * each test anyway.)
     *
     * This is not housekeeping. A 429 arriving partway through would be compared
     * against a credential refusal as if the two were the same thing, and the
     * failure would be reported as a leak when it is a test artefact.
     */
    private function forgetThrottle(): void
    {
        Cache::flush();
    }

    /**
     * Assert two refusals are the same refusal.
     *
     * Status, content type, and the raw body. The body is compared as bytes
     * rather than as a decoded structure, because a decoded comparison would pass
     * even if the endpoint echoed the submitted address back under a different
     * key, and that is precisely the kind of quiet difference an attacker reads.
     */
    private function assertRefusedIdentically(TestResponse $expected, TestResponse $actual, string $context): void
    {
        $this->assertSame(
            $expected->status(),
            $actual->status(),
            "{$context} must return the same status as an address no store holds.",
        );

        $this->assertSame(
            $expected->headers->get('content-type'),
            $actual->headers->get('content-type'),
            "{$context} must return the same content type as an address no store holds.",
        );

        $this->assertSame(
            $expected->getContent(),
            $actual->getContent(),
            "{$context} must return an identical body to an address no store holds.",
        );

        $this->assertSame(
            [InvalidCredentials::MESSAGE],
            $actual->json('errors.credentials'),
            "{$context} must be the generic credential refusal, not a message about this address.",
        );
    }

    /**
     * How many tokens exist, across all four stores.
     */
    private function tokenCount(): int
    {
        return PersonalAccessToken::query()->count();
    }

    /**
     * The median time a door takes to refuse these credentials, in milliseconds.
     *
     * The median rather than the mean, so one slow sample from a shared CI
     * machine cannot drag the result across the threshold.
     */
    private function medianDurationOf(string $door, string $email, string $password): float
    {
        $samples = [];

        for ($attempt = 0; $attempt < 3; $attempt++) {
            $startedAt = hrtime(true);
            $this->signInAt($door, $email, $password);
            $samples[] = (hrtime(true) - $startedAt) / 1_000_000;
        }

        sort($samples);

        return $samples[intdiv(count($samples), 2)];
    }
}
