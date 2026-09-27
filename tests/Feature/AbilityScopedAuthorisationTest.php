<?php

namespace Tests\Feature;

use App\Models\Admin;
use App\Models\SuperAdmin;
use App\Models\User;
use App\Models\Worker;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Being signed in is not the same as being permitted.
 *
 * This is the third security property, and it is the one that stops a user
 * interface from being the only thing between a person and data they should not
 * see. Every other file in this suite tests a control from the inside: that a
 * credential belongs to one store, that a reset changes one account, that two
 * refusals are indistinguishable. This one tests a control from the only place
 * it can be tested, which is a request that did not come from this codebase — a
 * bearer token on a URL, with no session, no cookie and no page behind it. If
 * the front end were the enforcement, every assertion here would be unreachable:
 * there is no front end in this repository to reach for.
 *
 * Two rules are in play and they are separate, so they are tested separately:
 *
 *   1. The account is the type the endpoint belongs to. A customer's token is
 *      not an administrator with fewer rights; it is a different kind of account,
 *      minted by a different door.
 *   2. The token carries the ability the endpoint requires, read off the token
 *      itself rather than re-derived from the account type.
 *
 * Every token used here comes from the real sign-in door, so a test cannot pass
 * against a token the platform would never issue. The one exception is the
 * narrowed-ability case, which has no door — a sign-in always issues the
 * account type's full list — and that is exactly the case worth forging.
 *
 * The strings asserted below are the wire contract, not the names of the PHP
 * things that produce them. `code` and the ability names are what four front ends
 * branch on, and a test that read them out of a constant would keep passing after
 * a rename that broke every client.
 */
class AbilityScopedAuthorisationTest extends TestCase
{
    use RefreshDatabase;

    /**
     * The four keys, in the order they are written, and nothing else.
     *
     * Written out rather than read from `ErrorEnvelope::KEYS` so that changing
     * the envelope is something this test refuses to do quietly. Four
     * applications read this body; it is a published shape, and a published
     * shape is allowed to change loudly.
     */
    private const ENVELOPE = ['message', 'code', 'errors', 'details'];

    /**
     * The keys an account's record is described with, for a reader who is not
     * necessarily that account.
     */
    private const SUMMARY = ['account_type', 'id', 'name', 'email', 'status'];

    /**
     * One password for every account in the file.
     *
     * The platform hashes on the way in — the models cast `password` to
     * `hashed` — so this is passed already hashed and the cast leaves it alone.
     */
    private const PASSWORD = 'a-password-long-enough-to-be-real';

    /**
     * The plaintext behind `PASSWORD`, per account, so a test can sign in as one.
     *
     * Keyed by class and id together because the four tables count from one, and
     * `Admin` 1 and `User` 1 are different accounts.
     *
     * @var array<string, string>
     */
    private array $passwords = [];

    /**
     * Hands out a distinct address per account.
     *
     * The four sign-in doors are throttled per address, and a test that signed in
     * repeatedly under one address would be measuring the throttle rather than
     * the authorisation rule.
     */
    private int $addressesIssued = 0;

    // ---------------------------------------------------------------------
    // Each application may ask who it is
    // ---------------------------------------------------------------------

    /**
     * The starting point: an account signed in at its own door may ask which
     * account it is, and is told.
     *
     * Asserted over all four stores, because the endpoint is one implementation
     * reached by four routes and a rule that held for three of them would look
     * exactly like a rule that held for none.
     */
    public function test_each_application_can_ask_which_account_it_is_signed_in_with(): void
    {
        foreach ($this->applications() as $store => $application) {
            $account = $this->anAccountIn($store);

            $response = $this->as($this->tokenFor($account))->getJson($application['me']);

            $response->assertOk();
            $response->assertJsonPath('data.account_type', $store);
            $response->assertJsonPath('data.account.id', $account->getKey());
            $response->assertJsonPath('data.account.email', $account->email);
            $response->assertJsonPath('data.account.status', 'active');
            $response->assertJsonPath('data.abilities', $application['abilities']);
        }
    }

    /**
     * Who am I reports the token's own claims, and a token whose claims have been
     * narrowed is refused rather than answered.
     *
     * Both halves are one claim seen from two sides, and they belong in one test
     * because only the second makes the first believable. A response that
     * re-derived the abilities from the account type would be byte-identical to
     * the right answer for every token a real door issues, so the only way to
     * observe the difference is a token whose claims disagree with its account
     * type — and that disagreement shows up as a refusal, because the middleware
     * reading the claims runs before the endpoint that reports them. What proves
     * the list came off the token is that `admins:*`, which this account type
     * certainly holds in general, was not enough to get in.
     *
     * Note what a narrowed token therefore cannot do: ask who it is. This route
     * is itself gated on the store's own ability, which is the conservative
     * choice — an endpoint that reports what a token may do should not be
     * reachable by a token that may do nothing — and it is the one place a future
     * scoped-token feature has to decide what a reduced token can still reach.
     */
    public function test_who_am_i_reports_the_tokens_own_abilities_rather_than_the_account_types(): void
    {
        $admin = $this->anAccountIn('admins');

        // The positive: a token the door really issued, reporting that door's list.
        $stock = $this->as($this->tokenFor($admin))->getJson($this->applications()['admins']['me']);

        $stock->assertOk();
        $stock->assertJsonPath('data.abilities', ['admins:*']);

        // The negative: the same account, holding a claim list no door issues.
        $narrowed = $admin->createToken('narrowed', ['admins:read'])->plainTextToken;

        $refused = $this->as($narrowed)->getJson($this->applications()['admins']['me']);

        $this->assertRefused($refused, 403, 'ability_required');
        $refused->assertJsonPath('details.required_ability', 'admins:*');
    }

    // ---------------------------------------------------------------------
    // Rule one: the account is the type the endpoint belongs to
    // ---------------------------------------------------------------------

    /**
     * The whole matrix, off the diagonal: every account type is refused at
     * every application that is not its own.
     *
     * All twelve pairs, rather than the three the ticket names, because the rule
     * is that the store is checked and the interesting failure is the pair nobody
     * thought about — the super administrator at the customer door, which a
     * wildcard on its token would sail through if only rule two were applied.
     *
     * This is also the property that makes a user interface irrelevant: these are
     * bare requests at URLs no interface in the world would generate, and the
     * answer is a refusal in every case.
     */
    public function test_an_account_is_refused_at_every_application_that_is_not_its_own(): void
    {
        $tokens = [];

        foreach (array_keys($this->applications()) as $store) {
            $tokens[$store] = $this->tokenFor($this->anAccountIn($store));
        }

        foreach ($this->applications() as $application => $route) {
            foreach ($this->applications() as $store => $_) {
                if ($store === $application) {
                    // The diagonal, asserted rather than skipped. Twelve
                    // refusals on their own would also be produced by a rule that
                    // refuses everything, including the callers who are allowed,
                    // and a control that refuses everything is indistinguishable
                    // from a control that works.
                    $this->as($tokens[$store])->getJson($route['me'])
                        ->assertOk("A {$store} token was refused at its own {$application} door.");

                    continue;
                }

                $this->assertRefused(
                    $this->as($tokens[$store])->getJson($route['me']),
                    403,
                    'wrong_account_type',
                    "A {$store} token was allowed into the {$application} application.",
                );
            }
        }
    }

    /**
     * Being in the wrong application is told which application to go to, and
     * which store the account actually belongs to.
     *
     * Safe to be specific about here, and deliberately so, unlike the sign-in
     * doors. A caller reaching this has already presented a valid token, so it
     * already knows which store it is in; the store is being named back to it,
     * not disclosed. A refusal that only said "forbidden" would leave a person
     * with a working token and no idea that they had signed in at the wrong door
     * — which is the mistake a person makes once and then fixes, every time.
     */
    public function test_being_in_the_wrong_application_is_told_where_to_go_instead(): void
    {
        $user = $this->anAccountIn('users');

        $response = $this->as($this->tokenFor($user))->getJson($this->applications()['admins']['me']);

        $response->assertForbidden();
        $response->assertJsonPath('code', 'wrong_account_type');
        $response->assertJsonPath('details.account_type', 'users');
        $response->assertJsonPath('details.required_account_type', 'admins');
        $this->assertStringContainsString(
            'users',
            $response->json('message'),
            'The refusal must name the store the account is really in.',
        );
        $this->assertStringContainsString(
            'sign in',
            strtolower($response->json('message')),
            'The refusal must point at the fix, which is signing in at the other door.',
        );
    }

    /**
     * The wildcard is not a key to every door.
     *
     * Stated separately because it is the assumption the rule exists to break:
     * a super administrator's token holds `*`, and `*` matches every ability in
     * Sanctum's own terms — so an implementation that checked abilities alone
     * would hand the most powerful account on the platform the customer
     * application's data. It is refused, because the store is checked first and
     * the wildcard is not an opinion about which application it is in.
     */
    public function test_the_wildcard_ability_does_not_open_the_other_applications(): void
    {
        $superAdmin = $this->anAccountIn('super_admins');

        // The premise, asserted rather than assumed: `tokenFor` has just checked
        // that this door really does issue the wildcard.
        $token = $this->tokenFor($superAdmin);

        foreach (['users', 'workers', 'admins'] as $store) {
            $this->assertRefused(
                $this->as($token)->getJson($this->applications()[$store]['me']),
                403,
                'wrong_account_type',
                "A wildcard token reached the {$store} application.",
            );
        }
    }

    // ---------------------------------------------------------------------
    // Rule two: the token carries the ability the endpoint requires
    // ---------------------------------------------------------------------

    /**
     * An administrator is refused the function that belongs to a super
     * administrator.
     *
     * The refusal is `wrong_account_type` rather than `ability_required`, and the
     * difference is not a detail of wording: no ability an administrator holds
     * would help, because the answer is to go and sign in at a different door. A
     * caller told it needed `accounts:read` would go looking for a way to have
     * that ability, and there is no such way from where it is standing.
     *
     * The other super-administrator function is refused differently, because it
     * is a different fault with a different fix. That is the next test.
     */
    public function test_an_administrator_is_refused_the_functions_that_belong_to_a_super_administrator(): void
    {
        $admin = $this->anAccountIn('admins');
        $token = $this->tokenFor($admin);

        $wrongApplication = $this->as($token)->getJson($this->applications()['super_admins']['me']);

        $wrongApplication->assertForbidden();
        $wrongApplication->assertJsonPath('code', 'wrong_account_type');
        $wrongApplication->assertJsonPath('details.required_account_type', 'super_admins');
    }

    /**
     * The right application with the wrong token is refused the other way.
     *
     * A super administrator whose token does not carry `accounts:read` is in the
     * right place and is still refused, and the refusal names the ability that
     * would open it. The account type holds the wildcard and therefore holds
     * `accounts:read` in general, so this is the same proof as the narrowed
     * administrator above seen from the other side: the decision came from the
     * claims on the token in hand, not from the kind of account it belongs to.
     *
     * There is no door that issues such a token, so — as everywhere else in this
     * file — it is forged by asking the account for one. A test for this rule
     * that used only door-issued tokens could not reach it at all.
     */
    public function test_a_token_in_the_right_application_is_refused_the_ability_it_does_not_carry(): void
    {
        $superAdmin = $this->anAccountIn('super_admins');
        $admin = $this->anAccountIn('admins');

        $narrowed = $superAdmin->createToken('no-accounts-read', ['super_admins:read'])->plainTextToken;

        $missingAbility = $this->as($narrowed)->getJson($this->crossStoreReadOf($admin->getKey()));

        $this->assertRefused($missingAbility, 403, 'ability_required');
        $missingAbility->assertJsonPath('details.required_ability', 'accounts:read');
        $missingAbility->assertJsonPath(
            'message',
            'This function is not available to your account type. It requires the [accounts:read] ability.',
        );
    }

    /**
     * A valid token cannot do what its abilities do not cover.
     *
     * The token here is genuine — it resolves, it identifies the right account,
     * and the very same account is let through `/admins/me` by a token carrying
     * its real abilities. The only thing that changed is the claim list. So the
     * refusal cannot be attributed to a bad token, a revoked account or a
     * suspended record: it is the ability, and only the ability.
     *
     * Note the second half. Having no abilities does not leave the account able
     * to read its own record, because the ability the endpoint names is checked
     * before the ownership rule ever runs. A caller with an empty claim list
     * cannot read anything, including itself.
     */
    public function test_a_valid_token_cannot_perform_an_action_its_abilities_do_not_cover(): void
    {
        $admin = $this->anAccountIn('admins');

        // Sanity: the account itself is in good standing and the door lets it in.
        $this->as($this->tokenFor($admin))
            ->getJson($this->applications()['admins']['me'])
            ->assertOk();

        $narrowed = $admin->createToken('narrowed', ['admins:read'])->plainTextToken;

        $wrongAbility = $this->as($narrowed)->getJson($this->applications()['admins']['me']);
        $this->assertRefused($wrongAbility, 403, 'ability_required');
        $wrongAbility->assertJsonPath('details.required_ability', 'admins:*');

        $ownRecord = $this->as($narrowed)->getJson($this->ownStoreReadOf($admin->getKey()));
        $this->assertRefused($ownRecord, 403, 'ability_required');
    }

    /**
     * A token is judged on its claims, so a record's own account type cannot
     * vouch for it.
     *
     * The distinction the previous tests rest on, walked as a table rather than
     * asserted once. `admins:*` is what an administrator holds in general, and
     * every list below deliberately fails to contain it — including the list that
     * is empty and the one holding a real ability from the wrong family. If the
     * middleware re-derived the abilities from the account type, all of them
     * would be let through, and a narrowed token would get back everything it had
     * been narrowed away from.
     *
     * The wildcard is the one list that is *not* in the table, and its absence is
     * the interesting half: it passes, and it is what the super administrator's
     * own door issues. A check written as a string comparison against the claims
     * would refuse that token, so it is asserted rather than assumed.
     */
    public function test_the_ability_check_reads_the_token_and_not_the_account_type(): void
    {
        $admin = $this->anAccountIn('admins');

        // What the account type would claim, which is deliberately not what any
        // of these tokens carry.
        $this->assertNotSame('admins:*', 'admins:read');

        foreach ([['admins:read'], ['accounts:read'], []] as $claims) {
            $token = $admin->createToken('claims-'.implode('-', $claims ?: ['none']), $claims)->plainTextToken;

            $this->assertRefused(
                $this->as($token)->getJson($this->applications()['admins']['me']),
                403,
                'ability_required',
                'A token holding '.json_encode($claims).' was allowed to call an admins:* endpoint.',
            );
        }

        $wildcard = $admin->createToken('claims-wildcard', ['*', 'admins:read'])->plainTextToken;

        $this->as($wildcard)->getJson($this->applications()['admins']['me'])
            ->assertOk('A token holding the wildcard was refused a function an account of its type may call.');
    }

    // ---------------------------------------------------------------------
    // Rule one, from a request no interface would make
    // ---------------------------------------------------------------------

    /**
     * The administrative endpoints are refused to a customer who calls them
     * directly — no interface, no navigation, no prior page load.
     *
     * `withToken` and a raw URL is the whole request, and it is deliberately
     * boring: there is nothing here an application front end would have to send
     * and nothing here that proves the caller is "really" an application. If the
     * only thing standing between a customer and the staff endpoints were the
     * staff application choosing not to link to them, this request would succeed
     * and the platform would be a UI convention rather than a control.
     */
    public function test_calling_an_administrative_endpoint_directly_is_refused(): void
    {
        $customer = $this->anAccountIn('users');
        $token = $this->tokenFor($customer);

        foreach ([
            $this->applications()['admins']['me'],
            $this->ownStoreReadOf(999999),
            $this->crossStoreReadOf(999999),
            $this->applications()['super_admins']['me'],
        ] as $url) {
            $response = $this->as($token)->getJson($url);

            $response->assertStatus(403);
            $response->assertHeader('Content-Type', 'application/json');
            $this->assertSame(
                self::ENVELOPE,
                array_keys($response->json()),
                "A direct call to {$url} produced a body that is not the error envelope.",
            );
        }
    }

    // ---------------------------------------------------------------------
    // A refusal is a response
    // ---------------------------------------------------------------------

    /**
     * Every refusal on the platform is the same four keys, whatever produced it.
     *
     * Each of the codes here is reached through a different mechanism — this
     * application's own exceptions, the framework's unauthenticated refusal, its
     * validation failure, its 404 — and they are asserted together on purpose.
     * A guarantee that holds for one error path is not a guarantee; the reason
     * the envelope lives on the exception handler's `respond` hook rather than on
     * each refusal is precisely so that a shape cannot vary by which door the
     * failure came out of.
     *
     * The test suite runs with `APP_DEBUG` on, because that is what the local
     * environment is, and Laravel's own error body carries `exception`, `file`,
     * `line` and a stack trace. This assertion is what proves none of them reach
     * a client. A debug-shaped leak is invisible to anyone testing a release
     * build and is a map of the deployment to anyone testing a development one.
     */
    public function test_every_refusal_is_written_in_the_same_four_keys(): void
    {
        $user = $this->anAccountIn('users');
        $admin = $this->anAccountIn('admins');
        $superAdmin = $this->anAccountIn('super_admins');
        $userToken = $this->tokenFor($user);
        $superAdminToken = $this->tokenFor($superAdmin);

        $refusals = [
            // Nothing of the platform's own: the framework's unauthenticated answer.
            'unauthenticated' => $this->asNobody()->getJson($this->applications()['admins']['me']),
            // Rule one.
            'wrong_account_type' => $this->as($userToken)->getJson($this->applications()['admins']['me']),
            // Rule two.
            'ability_required' => $this->as($this->tokenFor($admin))->getJson($this->crossStoreReadOf(1)),
            // The ownership rule.
            'not_the_record_owner' => $this->as($this->tokenFor($this->anAccountIn('admins')))
                ->getJson($this->ownStoreReadOf(1)),
            // A record that is not there, to a caller entitled to ask.
            'not_found' => $this->as($superAdminToken)->getJson($this->crossStoreReadOf(999999)),
            // A path the application does not serve.
            'no_such_route' => $this->asNobody()->getJson('/api/v1/identity/no-such-route'),
            // A validation failure, raised by a form request and never composed here.
            'validation_failed' => $this->asNobody()->postJson($this->applications()['users']['signIn'], []),
        ];

        foreach ($refusals as $what => $response) {
            $response->assertHeader('Content-Type', 'application/json');

            $this->assertSame(
                self::ENVELOPE,
                array_keys($response->json()),
                "The {$what} refusal has the wrong keys.",
            );

            $this->assertIsString($response->json('message'));
            $this->assertNotSame('', $response->json('message'));
            $this->assertIsString($response->json('code'));
        }

        // And the two maps are objects, so a client can read `errors.email` and
        // `details.required_ability` without branching on whether anything
        // happens to be in them today.
        $this->assertMatchesRegularExpression(
            '/"errors":\{\}/',
            $refusals['wrong_account_type']->getContent(),
            'An empty errors map must encode as an object, not as an array.',
        );
        $this->assertMatchesRegularExpression(
            '/"details":\{[^}]+\}/',
            $refusals['ability_required']->getContent(),
            'A populated details map must encode as an object.',
        );
    }

    /**
     * No refusal is an unhandled error.
     *
     * Every *refusal* the four new routes can produce, walked and asserted to be
     * a 4xx. The claim is narrow and it is the one the ticket makes: an endpoint
     * that a person is not allowed to call must answer, and answer as a client
     * error. A 500 would mean the refusal was an accident — a type error, a
     * missing binding, an exception nobody mapped — and a person would be shown
     * an error page and told to try again later, which is the "broken page" this
     * ticket exists to rule out.
     *
     * Not one request that is *allowed* to answer 200: a super administrator at
     * its own `/me` is not a refusal, and listing it here would make this test
     * assert that a working platform is broken. It is asserted to work in
     * `test_each_application_can_ask_which_account_it_is_signed_in_with`.
     */
    public function test_no_refusal_is_a_server_error(): void
    {
        $user = $this->anAccountIn('users');
        $admin = $this->anAccountIn('admins');
        $other = $this->anAccountIn('admins');
        $superAdmin = $this->anAccountIn('super_admins');
        $userToken = $this->tokenFor($user);
        $adminToken = $this->tokenFor($admin);
        $superAdminToken = $this->tokenFor($superAdmin);

        $responses = [
            $this->asNobody()->getJson($this->applications()['admins']['me']),
            $this->as($userToken)->getJson($this->applications()['admins']['me']),
            $this->as($adminToken)->getJson($this->crossStoreReadOf($other->getKey())),
            $this->as($adminToken)->getJson($this->ownStoreReadOf($other->getKey())),
            $this->as($adminToken)->getJson($this->ownStoreReadOf(999999)),
            $this->as($superAdminToken)->getJson($this->crossStoreReadOf(999999)),
            // Identifiers no route will bind, answered by the router rather than by
            // the controller. With nothing on the request, so the router is what
            // answers.
            $this->asNobody()->getJson($this->ownStoreReadOf(0)),
            $this->asNobody()->getJson($this->ownStoreReadOf('not-a-number')),
        ];

        foreach ($responses as $response) {
            $this->assertLessThan(
                500,
                $response->status(),
                "A refused request answered {$response->status()}, which is an unhandled error.",
            );
            $this->assertGreaterThanOrEqual(400, $response->status());
        }
    }

    // ---------------------------------------------------------------------
    // Guessing an identifier
    // ---------------------------------------------------------------------

    /**
     * An administrator may read its own record.
     *
     * The positive half of the ownership rule, and it has to be here. A rule
     * that refuses everything is indistinguishable from a rule that is broken,
     * and an endpoint nobody can read is not a control anybody has checked.
     */
    public function test_an_administrator_may_read_its_own_record(): void
    {
        $admin = $this->anAccountIn('admins');

        $response = $this->as($this->tokenFor($admin))
            ->getJson($this->ownStoreReadOf($admin->getKey()));

        $response->assertOk();
        $response->assertJsonPath('data.account_type', 'admins');
        $response->assertJsonPath('data.id', $admin->getKey());
        $response->assertJsonPath('data.email', $admin->email);
        $response->assertJsonPath('data.status', 'active');
    }

    /**
     * Another administrator's record and a record that does not exist are the
     * same refusal, byte for byte.
     *
     * This is the assertion the whole ownership rule rests on, and it is why
     * both cases are fetched from the same request rather than merely compared
     * for shape. If the endpoint looked a record up and *then* decided, one of
     * these would be a 404 and the other a 403 — and a difference in status alone
     * is enough to walk the whole staff table one integer at a time, with
     * nothing but a valid administrator token, to find out who works here.
     *
     * Byte comparison rather than an equality of decoded fields, because the
     * cheap version of this test is the one that passes: an endpoint could return
     * the same four keys with a message naming the id that is absent, and only
     * the raw body shows it.
     */
    public function test_another_administrators_record_and_a_record_that_is_not_there_are_the_same_refusal(): void
    {
        $caller = $this->anAccountIn('admins');
        $stranger = $this->anAccountIn('admins');
        $token = $this->tokenFor($caller);

        $someoneElses = $this->as($token)->getJson($this->ownStoreReadOf($stranger->getKey()));
        $nobodyElses = $this->as($token)->getJson($this->ownStoreReadOf(999999));

        $this->assertRefused($someoneElses, 403, 'not_the_record_owner');
        $this->assertRefused($nobodyElses, 403, 'not_the_record_owner');

        $this->assertSame(
            $someoneElses->getContent(),
            $nobodyElses->getContent(),
            'A record that exists and a record that does not must be refused identically, or the '
            .'endpoint answers "does administrator N exist".',
        );
    }

    /**
     * The same refusal for every identifier, walked.
     *
     * The oracle test, in the form an attacker would use it: take a valid token,
     * walk the integers, and see whether anything in the answers differs. One
     * comparison could be coincidence — a single id that happened to be absent
     * from the table. A walk cannot be, because it includes identifiers that do
     * exist and identifiers that do not, and every answer has to be the same
     * bytes.
     */
    public function test_every_identifier_a_caller_cannot_own_is_refused_the_same_way(): void
    {
        $caller = $this->anAccountIn('admins');
        $token = $this->tokenFor($caller);

        // Real colleagues, so the walk crosses records that genuinely exist.
        $others = [$this->anAccountIn('admins'), $this->anAccountIn('admins'), $this->anAccountIn('admins')];

        $identifiers = [
            ...array_map(fn (Admin $admin): int => $admin->getKey(), $others),
            999999,
            $caller->getKey() + 1_000_000,
            7,
        ];

        $reference = null;

        foreach ($identifiers as $identifier) {
            $response = $this->as($token)->getJson($this->ownStoreReadOf($identifier));

            $this->assertRefused($response, 403, 'not_the_record_owner', "Identifier {$identifier} was not refused.");

            $reference ??= $response->getContent();

            $this->assertSame(
                $reference,
                $response->getContent(),
                "Identifier {$identifier} was refused differently from the first identifier walked.",
            );
        }
    }

    /**
     * The walk is only meaningful if the caller cannot get its own record by
     * accident of numbering, so the one identifier that is answerable is
     * asserted to be answerable within the same walk.
     *
     * A colleague is created *first*, so that the identifier either side of the
     * caller's is a real administrator on one side and an identifier nothing has
     * on the other. Both have to be refused for the same reason, which they are
     * because the ownership rule is decided before the record is looked up — and
     * the point of the arrangement is that the walk above can then include both
     * kinds of identifier without a 404 among them.
     */
    public function test_the_callers_own_identifier_is_the_only_one_answered(): void
    {
        $colleague = $this->anAccountIn('admins');
        $caller = $this->anAccountIn('admins');
        $token = $this->tokenFor($caller);

        $this->as($token)->getJson($this->ownStoreReadOf($caller->getKey()))->assertOk();

        foreach ([$caller->getKey() - 1, $caller->getKey() + 1] as $identifier) {
            $this->assertRefused(
                $this->as($token)->getJson($this->ownStoreReadOf($identifier)),
                403,
                'not_the_record_owner',
                "Identifier {$identifier}, beside the caller's own, was answered.",
            );
        }
    }

    /**
     * A caller entitled to read every account is told when there is nothing
     * there.
     *
     * The 404, which would be a mistake everywhere else on the platform. It is
     * the honest answer here because by the time this is reachable the caller
     * holds `accounts:read`: the same caller is already being told the
     * difference between its own record and another's, so there is nothing left
     * to protect by disguising a miss. And a super administrator who mistyped an
     * identifier must not be told to go and sign in somewhere else, which is
     * what answering a 403 would say.
     */
    public function test_a_caller_who_may_read_any_account_is_told_when_the_record_does_not_exist(): void
    {
        $superAdmin = $this->anAccountIn('super_admins');
        $admin = $this->anAccountIn('admins');
        $token = $this->tokenFor($superAdmin);

        $found = $this->as($token)->getJson($this->crossStoreReadOf($admin->getKey()));
        $found->assertOk();
        $found->assertJsonPath('data.id', $admin->getKey());

        $missing = $this->as($token)->getJson($this->crossStoreReadOf(999999));
        $this->assertRefused($missing, 404, 'not_found');
        $missing->assertJsonPath('message', 'No account in this store has that identifier.');

        // The same identifier, on the same route, for a caller entitled to read
        // no accounts at all. It is refused for being in the wrong application,
        // which is decided from the token, so the 404 above told it nothing: the
        // two answers differ because the abilities differ, never because of
        // whether the record is there, which is the only reason a difference
        // between them is safe.
        $notEntitled = $this->as($this->tokenFor($this->anAccountIn('admins')))
            ->getJson($this->crossStoreReadOf(999999));

        $this->assertRefused($notEntitled, 403, 'wrong_account_type');
        $this->assertNotSame(
            $missing->status(),
            $notEntitled->status(),
            'The same identifier must not answer 404 for one caller and 403 for another on the same '
            .'route; the difference is what turns the endpoint into an enumeration oracle.',
        );
    }

    /**
     * A record is described without its owner's abilities.
     *
     * Abilities on this platform describe the token that asked, not the record
     * being read. Handing a caller the target's list would put another person's
     * authority on screen in the caller's own window, and an application that
     * built navigation from it would offer links the caller cannot follow — or,
     * worse, links the *target* could follow, which is a different account's
     * authority displayed to somebody who has no business seeing it.
     */
    public function test_a_record_is_never_described_with_its_owners_abilities(): void
    {
        $superAdmin = $this->anAccountIn('super_admins');
        $admin = $this->anAccountIn('admins');

        $read = $this->as($this->tokenFor($superAdmin))
            ->getJson($this->crossStoreReadOf($admin->getKey()));

        $read->assertOk();

        $this->assertSame(self::SUMMARY, array_keys($read->json('data')));
        $this->assertArrayNotHasKey('abilities', $read->json('data'));
    }

    // ---------------------------------------------------------------------
    // Nobody signed in at all
    // ---------------------------------------------------------------------

    /**
     * Nobody signed in is a 401, not a 403.
     *
     * The distinction is the whole reason `NotPermitted` carries a status. A 403
     * says the request was authenticated and then refused, which is a lie about
     * a request with no token on it — and a client that trusts it will show a
     * "you are not permitted" message to somebody who needs to sign in, which
     * sends them looking for a permission they do not have instead of for the
     * login page they do.
     */
    public function test_nobody_signed_in_is_unauthenticated_rather_than_forbidden(): void
    {
        foreach ($this->applications() as $store => $application) {
            $response = $this->asNobody()->getJson($application['me']);

            $this->assertRefused($response, 401, 'unauthenticated', "The {$store} door answered an anonymous request oddly.");
            $this->assertStringNotContainsString(
                'sign',
                strtolower($response->json('message')),
                'The refusal must not name a store to a caller that has proved nothing.',
            );
        }

        foreach ([$this->ownStoreReadOf(1), $this->crossStoreReadOf(1)] as $url) {
            $this->assertRefused($this->asNobody()->getJson($url), 401, 'unauthenticated');
        }
    }

    /**
     * A token that is not a token is refused the same way as no token at all.
     *
     * Worth one test because "nobody is signed in" has two spellings — no header
     * and a header that resolves to nothing — and a client that handled only one
     * of them would be relying on the other never happening.
     */
    public function test_a_token_that_resolves_to_nobody_is_unauthenticated(): void
    {
        $response = $this->as('1|this-is-not-a-real-token')->getJson($this->applications()['admins']['me']);

        $this->assertRefused($response, 401, 'unauthenticated');
    }

    // ---------------------------------------------------------------------
    // A route that gets its own rule wrong
    // ---------------------------------------------------------------------

    /**
     * A malformed rule fails loudly rather than quietly refusing everybody.
     *
     * The `authorised` middleware takes its store and its ability as route
     * parameters, which is what lets a route state its whole rule where a reader
     * can see it — and which means a typo in that declaration is possible. It
     * fails as a programming error: a 500 that is impossible to mistake for an
     * ordinary refusal, rather than a 403 that looks exactly like a person being
     * told no. A route left quietly unreachable for six months is the expensive
     * mistake; a route that breaks the moment it is deployed is the cheap one.
     */
    public function test_a_route_that_declares_its_rule_wrongly_fails_loudly(): void
    {
        Route::get('/api/v1/identity/misdeclared', fn (): string => 'never reached')
            ->middleware('authorised:store=customers,ability=customers:*')
            ->name('test.misdeclared');

        $response = $this->getJson('/api/v1/identity/misdeclared');

        $response->assertStatus(500);
        $response->assertJsonPath('code', 'server_error');
        $this->assertSame(self::ENVELOPE, array_keys($response->json()));
    }

    // ---------------------------------------------------------------------
    // The fixture
    // ---------------------------------------------------------------------

    /**
     * The four applications, and the store each belongs to.
     *
     * `store` is the account type's own name, which is also the ability its
     * tokens carry and the path segment its application lives at. Written as one
     * table because the rules are all statements about the same table: which
     * route goes with which store, and which ability goes with which route.
     *
     * @return array<string, array{signIn: string, me: string, abilities: list<string>}>
     */
    private function applications(): array
    {
        return [
            'users' => [
                'signIn' => '/api/v1/identity/users/sign-in',
                'me' => '/api/v1/identity/users/me',
                'abilities' => ['users:*'],
            ],
            'workers' => [
                'signIn' => '/api/v1/identity/workers/sign-in',
                'me' => '/api/v1/identity/workers/me',
                'abilities' => ['workers:*'],
            ],
            'admins' => [
                'signIn' => '/api/v1/identity/admins/sign-in',
                'me' => '/api/v1/identity/admins/me',
                'abilities' => ['admins:*'],
            ],
            'super_admins' => [
                'signIn' => '/api/v1/identity/super-admins/sign-in',
                'me' => '/api/v1/identity/super-admins/me',
                'abilities' => ['*'],
            ],
        ];
    }

    /**
     * Create an account in one of the four stores, with a known password.
     */
    private function anAccountIn(string $store): Model
    {
        $this->addressesIssued++;

        $account = match ($store) {
            'users' => User::factory()->create($this->attributesFor($store)),
            'workers' => Worker::factory()->create($this->attributesFor($store)),
            'admins' => Admin::factory()->create($this->attributesFor($store)),
            'super_admins' => SuperAdmin::factory()->create($this->attributesFor($store)),
        };

        $this->passwords[$account::class.':'.$account->getKey()] = self::PASSWORD;

        return $account;
    }

    /**
     * @return array<string, string>
     */
    private function attributesFor(string $store): array
    {
        return [
            'email' => str_replace('_', '-', $store).'-'.(++$this->addressesIssued - 1).'@example.com',
            'password' => Hash::make(self::PASSWORD),
            'status' => 'active',
        ];
    }

    /**
     * Sign in at the account's own door and return the token it issues.
     *
     * Every token in this file comes through a real sign-in, so no test can pass
     * against a token the platform would never hand anybody. The abilities the
     * answer claims are asserted here too, so a door that started issuing the
     * wrong list would be caught at the source rather than as a puzzling refusal
     * four tests later.
     */
    private function tokenFor(Model $account): string
    {
        $application = $this->applications()[$this->storeOf($account)];

        $response = $this->postJson($application['signIn'], [
            'email' => $account->email,
            'password' => $this->passwords[$account::class.':'.$account->getKey()],
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.abilities', $application['abilities']);

        $token = $response->json('data.token');

        $this->assertIsString($token);
        $this->assertNotSame('', $token);

        return $token;
    }

    /**
     * The store an account belongs to, by the model behind it.
     *
     * Matched rather than derived, so this file has no path by which a model
     * could come back as an account type this test did not create.
     */
    private function storeOf(Model $account): string
    {
        return match ($account::class) {
            User::class => 'users',
            Worker::class => 'workers',
            Admin::class => 'admins',
            SuperAdmin::class => 'super_admins',
            default => throw new \LogicException('No store is known for '.$account::class),
        };
    }

    /**
     * The administrator application's own read, from inside its own store.
     */
    private function ownStoreReadOf(int|string $admin): string
    {
        return "/api/v1/identity/admins/{$admin}";
    }

    /**
     * The same read, reached across the store boundary.
     */
    private function crossStoreReadOf(int|string $admin): string
    {
        return "/api/v1/identity/super-admins/admins/{$admin}";
    }

    /**
     * Send the next request as this token, and stop being the previous caller.
     *
     * Both halves are load-bearing, and the second is not obvious. `withToken()`
     * on its own only sets a header: the *authenticated account* is cached on the
     * guard instance, and the guard instance is a container singleton that
     * outlives the individual request inside a test. `Illuminate\Auth\RequestGuard`
     * memoises the first account it resolves and hands that same account to every
     * later request, token or no token.
     *
     * So a test that signs in as a customer and then as an administrator and
     * forgets this would make the administrator's request be answered as the
     * customer — with a 200, a 403 pointing at the wrong store, or a 404 for a
     * record the caller may actually read. Every one of those reads as a bug in
     * the authorisation middleware and is not one at all. Production is unaffected:
     * PHP-FPM gives each request a fresh container, so this memoisation has
     * nothing to survive between requests there.
     *
     * It is worth naming because it is the kind of thing that produces a security
     * test which cannot fail, and this file is meant to be one.
     */
    private function as(string $token): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($token);
    }

    /**
     * Send the next request with nothing on it at all.
     *
     * `withToken()` sets a *default* header, so it stays set for every request
     * after it until something overwrites it — which means a test that wanted an
     * anonymous request halfway down would quietly send a valid one. Both halves
     * of the previous helper are undone here for the same reason.
     */
    private function asNobody(): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withoutHeader('Authorization');
    }

    /**
     * Assert a refusal: the right status, the right code, and the one shape.
     *
     * The code and the key list are both asserted on every refusal in the file,
     * through this one method, because a test that checked the code in one place
     * and the shape in another would let the two drift apart — and a client
     * branching on `code` breaks long before one reading `message` does.
     */
    private function assertRefused(
        TestResponse $response,
        int $status,
        string $code,
        string $why = '',
    ): void {
        $prefix = $why === '' ? '' : $why.' ';

        $response->assertStatus($status);
        $response->assertHeader('Content-Type', 'application/json');
        $response->assertJsonPath('code', $code);

        $this->assertSame(
            self::ENVELOPE,
            array_keys($response->json()),
            $prefix.'The body is not the error envelope: '.($response->getContent() ?: '(empty)'),
        );
    }
}
