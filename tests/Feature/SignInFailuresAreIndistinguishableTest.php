<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Worker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * A refused sign-in must teach an attacker nothing.
 *
 * Every assertion here is made against a real HTTP response. Reaching past the
 * HTTP layer into the repository or the use case would let a test pass while
 * the endpoint itself still leaked, and the whole point of this file is that the
 * leak is invisible from the inside.
 */
class SignInFailuresAreIndistinguishableTest extends TestCase
{
    use RefreshDatabase;

    /**
     * The sign-in path. Named once so the file reads as being about the endpoint
     * rather than about any particular route spelling.
     */
    private const ENDPOINT = '/api/v1/identity/users/sign-in';

    /**
     * The one refusal that is allowed to look different from the others.
     */
    private const SUSPENDED_MESSAGE = 'Your account has been suspended. Please contact an administrator to have it restored.';

    /**
     * The refusal that must look the same for every indistinguishable case.
     */
    private const GENERIC_MESSAGE = 'These credentials do not match our records.';

    // ---------------------------------------------------------------------
    // An unknown address and a wrong password are the same refusal
    // ---------------------------------------------------------------------

    /**
     * The two cases that must not be told apart, asserted as one property:
     * the same status and the same bytes.
     *
     * Comparing the decoded structure instead of the raw body would pass even
     * if the endpoint echoed the submitted address back under a different key,
     * which is exactly the kind of quiet difference an attacker reads. The raw
     * body leaves nowhere for one to hide.
     */
    public function test_unknown_address_and_wrong_password_are_byte_for_byte_identical(): void
    {
        User::factory()->create([
            'email' => 'registered@example.com',
            'password' => Hash::make('the-right-password'),
            'status' => 'active',
        ]);

        $unknownAddress = $this->signIn('nobody-here@example.com', 'the-right-password');
        $wrongPassword = $this->signIn('registered@example.com', 'the-wrong-password');

        $this->assertSame(
            $wrongPassword->status(),
            $unknownAddress->status(),
            'An unknown address and a wrong password must return the same status.',
        );

        $this->assertSame(
            $wrongPassword->getContent(),
            $unknownAddress->getContent(),
            'An unknown address and a wrong password must return an identical body.',
        );
    }

    /**
     * An address that is registered, but in a different credential store, is
     * still just an unknown address here.
     *
     * This is the cross-store half of the same property: "is this address
     * registered" is the question an attacker is actually asking, and the
     * honest answer from a single store is only ever about that store.
     */
    public function test_an_address_registered_in_another_store_is_refused_identically(): void
    {
        Worker::factory()->create([
            'email' => 'supplier@example.com',
            'password' => Hash::make('the-right-password'),
        ]);

        $otherStore = $this->signIn('supplier@example.com', 'the-right-password');
        $unknownAddress = $this->signIn('nobody-here@example.com', 'the-right-password');

        $this->assertSame(
            $unknownAddress->status(),
            $otherStore->status(),
            'An address in another credential store must return the same status as an unknown one.',
        );

        $this->assertSame(
            $unknownAddress->getContent(),
            $otherStore->getContent(),
            'An address in another credential store must return an identical body to an unknown one.',
        );
    }

    // ---------------------------------------------------------------------
    // The refusal says as little as it can
    // ---------------------------------------------------------------------

    /**
     * The refusal must not point at a field, and must not reflect the input.
     *
     * A refusal filed under `email` implies the address is what is wrong, and a
     * message that repeats the submitted address back would confirm the address
     * was well formed enough to be worth repeating. Neither is a fact about
     * whether the account exists, and neither helps anybody.
     */
    public function test_the_refusal_names_neither_part_nor_whether_the_address_exists(): void
    {
        $response = $this->signIn('nobody-here@example.com', 'the-wrong-password');

        $response->assertUnprocessable();

        $body = $response->json();
        $errors = array_keys($body['errors']);

        $this->assertSame(
            ['credentials'],
            $errors,
            'The refusal must be reported under a neutral key, not under a field of the request.',
        );

        foreach (['email', 'password', 'address', 'e-mail'] as $part) {
            $this->assertStringNotContainsStringIgnoringCase(
                $part,
                $body['message'],
                "The refusal must not name the {$part} as the part that was wrong.",
            );
        }

        $this->assertStringNotContainsString(
            'nobody-here@example.com',
            $response->getContent(),
            'The refusal must not reflect the submitted address back to the caller.',
        );
    }

    /**
     * A refusal carries nothing a person could use: no token, no account record.
     */
    public function test_a_refusal_carries_no_token_and_no_account_details(): void
    {
        User::factory()->create([
            'email' => 'registered@example.com',
            'password' => Hash::make('the-right-password'),
            'status' => 'active',
        ]);

        foreach ([
            $this->signIn('nobody-here@example.com', 'the-right-password'),
            $this->signIn('registered@example.com', 'the-wrong-password'),
            $this->suspendedUserSigningIn('suspended@example.com', 'the-right-password'),
        ] as $response) {
            $body = $response->json();

            $this->assertArrayNotHasKey('data', $body);
            $this->assertArrayNotHasKey('token', $body);
            $this->assertArrayNotHasKey('user', $body);
            $this->assertStringNotContainsString('registered@example.com', $response->getContent());
            $this->assertStringNotContainsString('suspended@example.com', $response->getContent());
        }
    }

    // ---------------------------------------------------------------------
    // A suspended account is told the truth, and only once it has earned it
    // ---------------------------------------------------------------------

    /**
     * A suspended account is refused in plain words, with the next step.
     *
     * This refusal is deliberately *not* the same as the generic one. Telling
     * this person that their password is wrong would send them round a reset
     * loop that cannot succeed, and the spec asks for the opposite: contact an
     * administrator.
     */
    public function test_a_suspended_account_is_told_plainly_what_to_do_next(): void
    {
        $response = $this->suspendedUserSigningIn('suspended@example.com', 'the-right-password');

        $response->assertForbidden();

        $this->assertSame(self::SUSPENDED_MESSAGE, $response->json('message'));
        $this->assertSame(
            [self::SUSPENDED_MESSAGE],
            $response->json('errors.credentials'),
        );
    }

    /**
     * The suspended refusal must not be dressed up as a credential problem.
     */
    public function test_a_suspended_account_is_not_described_as_a_wrong_password(): void
    {
        $suspended = $this->suspendedUserSigningIn('suspended@example.com', 'the-right-password');
        $wrongPassword = $this->signIn('registered@example.com', 'the-wrong-password');

        $this->assertNotSame(
            $suspended->json('message'),
            $wrongPassword->json('message'),
            'A suspended account must not be given the generic credential refusal.',
        );

        $this->assertStringNotContainsStringIgnoringCase(
            'password',
            $suspended->json('message'),
            'The suspended refusal must not present the problem as the password.',
        );
    }

    /**
     * The reason the suspended refusal is safe is this test, and nothing else.
     *
     * Telling one person more than another only leaks if the extra information
     * is available to someone who has not earned it. Here it is not: the
     * suspended message appears only after the correct password has been
     * verified, so guessing addresses — correct, wrong, or suspended — yields
     * nothing but the generic refusal, byte for byte. An attacker enumerating
     * the customer list cannot use this to build one.
     *
     * The flip side is that this ordering is the whole safety argument, so it
     * is asserted from outside rather than left to the use case's comment.
     */
    public function test_the_suspended_refusal_is_unreachable_without_the_correct_password(): void
    {
        $suspendedWithWrongPassword = $this->suspendedUserSigningIn('suspended@example.com', 'the-wrong-password');
        $unknownAddress = $this->signIn('nobody-here@example.com', 'the-wrong-password');

        $this->assertSame(
            $unknownAddress->status(),
            $suspendedWithWrongPassword->status(),
            'A suspended account guessed with a wrong password must not be distinguishable from an unknown address.',
        );

        $this->assertSame(
            $unknownAddress->getContent(),
            $suspendedWithWrongPassword->getContent(),
            'A suspended account guessed with a wrong password must return an identical body to an unknown address.',
        );
    }

    /**
     * An account that is neither active nor suspended is refused, and gets no
     * token.
     *
     * Which refusal it receives is not asserted here on purpose: the states
     * outside active and suspended are not specified yet, so pinning their
     * wording would be a decision this ticket has no standing to make. What is
     * a security property is that the account is refused and nothing is issued.
     */
    public function test_an_account_in_no_usable_state_is_refused_and_issued_no_token(): void
    {
        User::factory()->create([
            'email' => 'pending@example.com',
            'password' => Hash::make('the-right-password'),
            'status' => 'pending',
        ]);

        $response = $this->signIn('pending@example.com', 'the-right-password');

        $this->assertContains(
            $response->status(),
            [401, 403, 422],
            'An account that cannot be used must be refused.',
        );

        $this->assertStringNotContainsString(
            'token',
            $response->getContent(),
            'An account that cannot be used must not be issued a token.',
        );
    }

    // ---------------------------------------------------------------------
    // The comparison itself must not leak
    // ---------------------------------------------------------------------

    /**
     * A registered address must not be answerable by measuring the response.
     *
     * Comparing a password is deliberately slow, which makes *skipping* the
     * comparison slow to spot and easy to ship by accident: an unknown address
     * simply returns early, and the endpoint answers roughly a hundred times
     * faster than it does for a real one. Over a network that is a clean
     * account-existence oracle, and no other test in the suite would fail,
     * because from the inside the two paths look the same.
     *
     * So this measures the two requests against each other rather than against
     * a wall-clock budget: the fixed code answers within a fraction of a
     * millisecond of itself (measured ratio 1.00), and the broken code answers
     * in about one percent of the time (measured ratio 0.01). The threshold
     * sits an order of magnitude clear of the broken behaviour and a factor of
     * two clear of the fixed one, so it is reporting a change of shape and not
     * a noisy machine.
     *
     * The bcrypt cost is raised first because `phpunit.xml` pins it to 4, which
     * is fast enough to be lost in the noise of the surrounding request; the
     * cost must be set before anything hashes, because Laravel's hash manager
     * reads it once when the driver is built and ignores it afterwards.
     */
    public function test_a_registered_address_is_not_detectable_by_how_long_the_answer_takes(): void
    {
        config(['hashing.bcrypt.rounds' => 12]);

        User::factory()->create([
            'email' => 'registered@example.com',
            'password' => Hash::make('the-right-password'),
            'status' => 'active',
        ]);

        // Warm up: the first comparison also pays to build the decoy hash.
        $this->signIn('nobody-here@example.com', 'the-wrong-password');

        $unknown = $this->medianDurationOf('nobody-here@example.com', 'the-wrong-password');
        $registered = $this->medianDurationOf('registered@example.com', 'the-wrong-password');

        $this->assertGreaterThanOrEqual(
            0.5,
            $unknown / $registered,
            sprintf(
                'The refusal for an unknown address (%.1fms) must not be materially faster than '
                .'the refusal for a wrong password (%.1fms): a skipped comparison is an '
                .'account-existence oracle.',
                $unknown,
                $registered,
            ),
        );
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    /**
     * Post credentials to the sign-in endpoint.
     */
    private function signIn(string $email, string $password): TestResponse
    {
        return $this->postJson(self::ENDPOINT, [
            'email' => $email,
            'password' => $password,
        ]);
    }

    /**
     * Create a suspended account and have it sign in.
     */
    private function suspendedUserSigningIn(string $email, string $password): TestResponse
    {
        User::factory()->suspended()->create([
            'email' => $email,
            'password' => Hash::make('the-right-password'),
        ]);

        return $this->signIn($email, $password);
    }

    /**
     * The median time the endpoint takes to refuse these credentials, in
     * milliseconds. The median rather than the mean, so one slow sample from a
     * shared CI machine cannot drag the result across the threshold.
     */
    private function medianDurationOf(string $email, string $password): float
    {
        $samples = [];

        for ($attempt = 0; $attempt < 3; $attempt++) {
            $startedAt = hrtime(true);
            $this->signIn($email, $password);
            $samples[] = (hrtime(true) - $startedAt) / 1_000_000;
        }

        sort($samples);

        return $samples[intdiv(count($samples), 2)];
    }
}
