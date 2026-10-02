<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Worker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\NewAccessToken;
use Tests\TestCase;

/**
 * The eight mocked customer endpoints, and the three things that are easy to
 * believe wrongly about them.
 *
 * **These endpoints exist to give the designed screens a shape something can
 * validate.** They are fixtures with routes on them, and every assertion below
 * is chosen because it would catch a reader — or a front end — treating a
 * literal as a capability. A green suite here is not evidence that a diagnosis
 * was computed, that a technician is moving, that a search was matched or that
 * anything was priced; it is evidence that the fixtures still say what they say.
 *
 * Everything is asserted through HTTP with a real bearer token, for the same
 * reason `AbilityScopedAuthorisationTest` does it: the wiring between a route, a
 * middleware string and a guard's token resolution is invisible from the inside.
 */
class MockedCustomerEndpointsTest extends TestCase
{
    use RefreshDatabase;

    private const DIAGNOSIS = '/api/v1/identity/users/diagnosis';

    private const SUGGESTIONS = '/api/v1/identity/users/diagnosis/suggestions';

    private const TRACKING = '/api/v1/identity/users/tracking';

    private const BOOKINGS = '/api/v1/identity/users/bookings';

    private const REGISTER = '/api/v1/identity/users/register';

    private const DISCOVERY = '/api/v1/identity/users/discovery';

    private const MATCHING = '/api/v1/identity/users/matching';

    private const QUOTE = '/api/v1/identity/users/bookings/BK-2041/quote';

    /**
     * The four endpoints that take no path parameter, plus registration.
     *
     * Read once and used by both guard loops, because the two loops below are
     * about the same property — a door that is actually closed — and a list
     * written twice is a list that gains a door in one place only. The quote is
     * excluded here and checked separately, because its identifier is part of
     * the path: a request for a booking that does not exist is `404` whatever
     * credential presented it, so looping it in would assert that a wrong verb
     * is a wrong credential.
     *
     * @return list<string>
     */
    private function theUnparameterisedDoors(): array
    {
        return [self::DIAGNOSIS, self::SUGGESTIONS, self::TRACKING, self::BOOKINGS, self::DISCOVERY, self::MATCHING];
    }

    // ---------------------------------------------------------------------
    // The doors are actually guarded.
    // ---------------------------------------------------------------------

    public function test_every_mocked_endpoint_refuses_a_request_with_no_token(): void
    {
        // Asserted as a loop rather than one test each, because the property is
        // that *none* of them is reachable unauthenticated. An endpoint added
        // without a guard fails this single test rather than needing another copy
        // of the same assertion.
        //
        // Registration is checked separately below because it is a `POST`: the
        // route answers `405` to a `GET` whether or not a token is present, so
        // looping it in here would be asserting that a wrong verb is a wrong
        // credential.
        foreach ($this->theUnparameterisedDoors() as $door) {
            $this->getJson($door)->assertUnauthorized();
        }

        $this->postJson(self::REGISTER, $this->registrationPayload())->assertUnauthorized();
    }

    public function test_every_mocked_endpoint_refuses_a_token_of_the_wrong_account_type(): void
    {
        // A worker's token is the interesting one: it is a real, unexpired
        // credential, so it gets past `auth:sanctum` and is stopped by the
        // `account.can` on each route. If one of the eight lost that middleware,
        // a worker could read a customer's bookings — which is exactly the
        // account-type isolation the four applications exist to enforce.
        $worker = Worker::factory()->create()->createToken('api', ['workers:*']);

        foreach ($this->theUnparameterisedDoors() as $door) {
            $this->actingAsToken($worker)->getJson($door)->assertForbidden();
        }

        $this->actingAsToken($worker)
            ->postJson(self::REGISTER, $this->registrationPayload())
            ->assertForbidden();
    }

    public function test_the_quote_endpoint_refuses_a_token_of_the_wrong_account_type(): void
    {
        // The same property as the loop above, for the one endpoint whose path
        // carries an identifier. Its own test because putting it in the loop would
        // mean the loop had to know about a path parameter, and the moment a
        // second parameterised endpoint appeared the loop would have grown a
        // conditional nobody reads.
        $worker = Worker::factory()->create()->createToken('api', ['workers:*']);

        $this->actingAsToken($worker)->getJson(self::QUOTE)->assertForbidden();
    }

    // ---------------------------------------------------------------------
    // Each endpoint answers a literal, and says which one.
    // ---------------------------------------------------------------------

    public function test_the_diagnosis_endpoint_answers_a_complete_literal(): void
    {
        $response = $this->actingAsToken($this->userToken())->getJson(self::DIAGNOSIS);

        $response->assertOk()
            ->assertJsonStructure([
                'diagnosis' => [
                    'problem',
                    'severity',
                    'possible_causes',
                    'recommended_solution',
                    'estimated_time',
                    'price_estimate' => ['min', 'max', 'currency'],
                    'tools_needed',
                ],
            ]);

        // Two things a screen depends on and neither can be got wrong by accident:
        // the price is a *range of integers* with a currency code and no symbol,
        // and the causes and tools are arrays rather than a single string. A
        // `price_estimate` that arrived as `"₹400-900"` would be unformattable a
        // second time in four different front ends.
        $estimate = $response->json('diagnosis.price_estimate');

        $this->assertIsInt($estimate['min']);
        $this->assertIsInt($estimate['max']);
        $this->assertSame('INR', $estimate['currency']);
        $this->assertLessThan($estimate['max'], $estimate['min']);

        $this->assertIsArray($response->json('diagnosis.possible_causes'));
        $this->assertIsArray($response->json('diagnosis.tools_needed'));
        $this->assertNotSame([], $response->json('diagnosis.possible_causes'));
    }

    public function test_the_diagnosis_endpoint_takes_no_input_and_still_answers(): void
    {
        // The single most important property of this fixture, asserted rather than
        // left to the class docblock: there is nothing to send and nothing is
        // derived. A request carrying a description, an image reference and a
        // nonsense flag produces output identical to a bare one, so nothing
        // behind this endpoint can be mistaken for a model that reads a request.
        //
        // Sent as query parameters on a `GET` because the route has no other
        // verb: posting to it answers `405`, which proves nothing about whether
        // input is ignored.
        $bare = $this->actingAsToken($this->userToken())->getJson(self::DIAGNOSIS);
        $described = $this->actingAsToken($this->userToken())->getJson(self::DIAGNOSIS.'?'.http_build_query([
            'description' => 'My kitchen sink is leaking and it is quite bad',
            'image' => 'not-an-image',
            'nonsense' => 'true',
        ]));

        $this->assertSame($bare->json(), $described->json());
    }

    public function test_the_diagnosis_endpoint_refuses_a_verb_it_does_not_serve(): void
    {
        // Worth its own assertion because it is what makes the test above
        // meaningful: the endpoint accepts a `GET` and nothing else, so there is
        // no body for a caller to believe it is sending.
        $this->actingAsToken($this->userToken())
            ->postJson(self::DIAGNOSIS, ['description' => 'a leak'])
            ->assertStatus(405);
    }

    public function test_the_suggestions_endpoint_names_a_recommendation_that_exists(): void
    {
        // `recommended` is an `id`, not a position. Asserting that it resolves to
        // one of the suggestions is what makes reordering the list a safe change:
        // a client that reads `suggestions[0]` as the recommendation would keep
        // working and keep being wrong.
        $response = $this->actingAsToken($this->userToken())->getJson(self::SUGGESTIONS);

        $response->assertOk()->assertJsonStructure([
            'suggestions' => [['id', 'title', 'description', 'confidence', 'price_range' => ['min', 'max', 'currency']]],
            'recommended',
        ]);

        $ids = array_column($response->json('suggestions'), 'id');

        $this->assertContains($response->json('recommended'), $ids);
    }

    public function test_every_suggestion_confidence_is_a_number_between_zero_and_one(): void
    {
        // Not a probability — nothing was scored — but it has to *look* like one
        // to render, and a confidence of 92 or "0.92" rendered as a percentage is
        // a screen showing 9,200%. The range is the contract; the screen is
        // responsible for saying it is not a measurement.
        foreach ($this->actingAsToken($this->userToken())->getJson(self::SUGGESTIONS)->json('suggestions') as $suggestion) {
            $this->assertIsFloat($suggestion['confidence'] + 0.0);
            $this->assertGreaterThan(0, $suggestion['confidence']);
            $this->assertLessThanOrEqual(1, $suggestion['confidence']);
        }
    }

    public function test_the_tracking_endpoint_reports_a_stage_timeline_whose_flags_agree(): void
    {
        // `status` is a single string and `stages` repeats each stage with its
        // own `completed` flag. A client must not have to derive one from the
        // other, so the property asserted here is that a stage marked completed
        // always carries a timestamp and one not completed never does — the two
        // ways a payload can say "not yet" must not both be available.
        $response = $this->actingAsToken($this->userToken())->getJson(self::TRACKING);

        $response->assertOk()->assertJsonStructure([
            'booking_id',
            'status',
            'service',
            'worker' => ['id', 'name', 'phone', 'rating', 'photo_url'],
            'location' => [
                'worker_lat',
                'worker_lng',
                'destination_lat',
                'destination_lng',
                'distance_km',
                'eta_minutes',
            ],
            'stages' => [['name', 'completed', 'timestamp']],
        ]);

        $stages = $response->json('stages');

        $this->assertNotSame([], $stages);

        foreach ($stages as $stage) {
            if ($stage['completed']) {
                $this->assertNotNull($stage['timestamp'], "{$stage['name']} is complete but carries no timestamp.");
            } else {
                $this->assertNull($stage['timestamp'], "{$stage['name']} is not complete but carries a timestamp.");
            }
        }
    }

    public function test_the_tracking_endpoint_says_what_job_is_being_travelled_to(): void
    {
        // `service` was added when the dashboard's job card was pointed at this
        // endpoint. Without it the card had a technician, an ETA and a four-stage
        // timeline and no way to say what any of it was about — "On the way" with
        // nothing attached is a progress bar, and the person waiting cannot tell
        // whether it is their job or somebody else's.
        //
        // Asserted non-empty rather than matched against a literal, because the
        // string is an example and is expected to change. Asserting it were a
        // specific one would make the test fail every time somebody improves the
        // fixture, which is the wrong reason for a test to go red.
        $response = $this->actingAsToken($this->userToken())->getJson(self::TRACKING);

        $service = $response->json('service');

        $this->assertIsString($service);
        $this->assertNotSame('', trim((string) $service));

        // And it has to be the *same* one every call, for the reason the next test
        // gives for the coordinates.
        $second = $this->actingAsToken($this->userToken())->getJson(self::TRACKING);

        $this->assertSame($service, $second->json('service'));
    }

    public function test_the_tracking_endpoint_does_not_move_between_two_calls(): void
    {
        // **This is the assertion that keeps the fixture honest.** Two calls a
        // moment apart return the same coordinates, the same distance and the
        // same ETA, which is what makes `LiveTrackingController`'s own warning
        // true rather than a guess.
        //
        // It also fails loudly if someone later adds real polling to this
        // endpoint, which is the point: at that moment the docs, the OpenAPI
        // description and the screen all have to change together, and this test
        // is the thing that says so.
        $first = $this->actingAsToken($this->userToken())->getJson(self::TRACKING);
        $second = $this->actingAsToken($this->userToken())->getJson(self::TRACKING);

        $this->assertSame($first->json('location'), $second->json('location'));
        $this->assertSame($first->json('location.eta_minutes'), $second->json('location.eta_minutes'));
        $this->assertSame($first->json('location.distance_km'), $second->json('location.distance_km'));
    }

    public function test_the_bookings_endpoint_returns_an_array_even_though_it_has_no_pagination(): void
    {
        // `bookings` is always an array and never `null`, because a caller should
        // render a list in the populated and the empty case alike and never have
        // to treat "no bookings" as a failure.
        $response = $this->actingAsToken($this->userToken())->getJson(self::BOOKINGS);

        /*
         * `status_label`, `scheduled_on` and `has_quote` are listed because the
         * other three fields are named in `openapi.json` and these three only
         * exist. `assertJsonStructure` accepts a superset, so it cannot tell a
         * field that is *missing* from one that is merely undocumented — and a
         * missing `has_quote` would reach the screen as a row that cannot be
         * opened with nothing on screen to say why. The exact key set is
         * asserted in `test_the_bookings_endpoint_sends_exactly_the_fields_the_list_screen_reads`.
         */
        $response->assertOk()->assertJsonStructure([
            'bookings' => [[
                'id', 'service', 'status', 'status_label', 'worker_name',
                'scheduled_at', 'scheduled_on', 'price', 'currency', 'has_quote',
            ]],
        ]);

        $this->assertIsArray($response->json('bookings'));
        $this->assertNotSame([], $response->json('bookings'));
    }

    public function test_the_bookings_endpoint_sends_exactly_the_fields_the_list_screen_reads(): void
    {
        // The other direction, and the reason `assertJsonStructure` above is not
        // enough on its own: it passes on a superset, so a field added to the
        // payload that no screen reads is invisible to it. `CustomerBookingsScreen`
        // decided its rows on `has_quote` and printed `status_label`, so a payload
        // that grew a sixth display field would be drift nobody is looking at.
        //
        // Named as a key set rather than a count, because "ten fields" and "these
        // ten fields" fail differently and only the second one is diagnosable.
        $bookings = $this->actingAsToken($this->userToken())->getJson(self::BOOKINGS)->json('bookings');

        foreach ($bookings as $booking) {
            $keys = array_keys($booking);
            sort($keys);

            $this->assertSame([
                'currency',
                'has_quote',
                'id',
                'price',
                'scheduled_at',
                'scheduled_on',
                'service',
                'status',
                'status_label',
                'worker_name',
            ], $keys, sprintf('Booking %s carries an unexpected set of fields.', $booking['id']));
        }
    }

    public function test_has_quote_is_true_exactly_for_the_booking_the_quote_endpoint_answers(): void
    {
        /*
         * The flag and the route, asserted against each other rather than against
         * a literal. `CustomerBookingsScreen` turns this boolean into "is this row
         * a link", so a flag that disagreed with the route would send somebody to
         * a detail page for a booking that has none — and the only other check on
         * the quote's 404 is about an id invented in a test, which a fixture
         * change would leave passing.
         *
         * Derived, not written out: it walks every booking and asks the quote
         * endpoint about each one. Adding a third booking to the fixture adds it
         * here without an edit.
         */
        $token = $this->userToken();
        $bookings = $this->actingAsToken($token)->getJson(self::BOOKINGS)->json('bookings');

        foreach ($bookings as $booking) {
            $quote = $this->actingAsToken($token)
                ->getJson(sprintf('/api/v1/identity/users/bookings/%s/quote', $booking['id']));

            $this->assertSame(
                $quote->isOk(),
                $booking['has_quote'],
                sprintf(
                    'Booking %s reports has_quote=%s but its quote endpoint returned %d.',
                    $booking['id'],
                    $booking['has_quote'] ? 'true' : 'false',
                    $quote->status(),
                ),
            );
        }
    }

    public function test_status_label_is_a_sentence_and_status_is_still_the_machine_value(): void
    {
        // The pair, asserted as a pair. A screen printing `status` shows
        // "in_progress"; a screen that strips the underscore shows "in progress",
        // which is closer and still a machine's idea of a phrase. Only the label
        // is prose, so only the label is asserted to be.
        //
        // Both are sent because the caller still needs to branch: `has_quote`
        // aside, `status` is what a future "cancel this booking" control would
        // compare against.
        $bookings = $this->actingAsToken($this->userToken())->getJson(self::BOOKINGS)->json('bookings');

        foreach ($bookings as $booking) {
            $this->assertNotSame(
                $booking['status'],
                $booking['status_label'],
                sprintf('Booking %s sends the same string twice, once as a value and once as a label.', $booking['id']),
            );
            $this->assertMatchesRegularExpression(
                '/^[A-Z]/',
                $booking['status_label'],
                sprintf('Booking %s sends a label that is not a sentence.', $booking['id']),
            );
            $this->assertStringNotContainsString(
                '_',
                $booking['status_label'],
                sprintf('Booking %s sends a machine value in the field meant for prose.', $booking['id']),
            );
        }
    }

    public function test_scheduled_on_is_a_formatted_date_beside_the_iso_one(): void
    {
        /*
         * `scheduled_at` stays machine-readable and `scheduled_on` is what a row
         * prints. The screen puts the first in a `<time dateTime>` and the second
         * in its text, so both have to be present and both have to be the *same
         * moment* — a `scheduled_on` computed from a different clock or a
         * different booking would be a date that disagrees with its own machine
         * value, and nothing in the markup would show it.
         *
         * Compared as dates rather than as strings, because the two are formats
         * rather than copies of each other: `2026-11-14T09:12:00+05:30` and
         * `14 Nov 2026, 9:12 AM` are the same instant written two ways.
         */
        $bookings = $this->actingAsToken($this->userToken())->getJson(self::BOOKINGS)->json('bookings');

        foreach ($bookings as $booking) {
            $iso = \DateTimeImmutable::createFromFormat(\DateTimeInterface::ATOM, $booking['scheduled_at']);

            $this->assertNotFalse(
                $iso,
                sprintf('Booking %s does not send an ISO 8601 timestamp.', $booking['id']),
            );

            $this->assertSame(
                $iso->format('j M Y, g:i A'),
                $booking['scheduled_on'],
                sprintf('Booking %s sends a display date that is not its own timestamp.', $booking['id']),
            );
        }
    }

    public function test_the_bookings_endpoint_answers_every_customer_identically(): void
    {
        // Two different customers, two different tokens, byte-identical bodies
        // apart from nothing at all. This is the property that makes the fixture
        // dangerous rather than merely mocked, and asserting it means the day it
        // stops being true is the day a real implementation lands — at which
        // point this test fails and has to be rewritten, which is correct.
        $first = $this->actingAsToken($this->userToken())->getJson(self::BOOKINGS);
        $second = $this->actingAsToken($this->userToken())->getJson(self::BOOKINGS);

        $this->assertSame($first->json('bookings'), $second->json('bookings'));
    }

    // ---------------------------------------------------------------------
    // Discovery.
    // ---------------------------------------------------------------------

    public function test_the_discovery_endpoint_answers_two_populated_lists(): void
    {
        $response = $this->actingAsToken($this->userToken())->getJson(self::DISCOVERY);

        $response->assertOk()->assertJsonStructure([
            'categories' => [['id', 'label', 'price_from', 'currency']],
            'featured_technicians' => [['id', 'name', 'trade', 'rating', 'completed_jobs']],
        ]);

        $this->assertNotSame([], $response->json('categories'));
        $this->assertNotSame([], $response->json('featured_technicians'));
    }

    public function test_every_category_prices_itself_in_rupees(): void
    {
        // `price_from` is an integer and `currency` is `INR` on every entry, so a
        // screen has one formatter rather than a per-category guess. Asserted on
        // every entry rather than the first, because a fourth category added with
        // a different currency is exactly the kind of thing a single-element
        // assertion misses.
        foreach ($this->actingAsToken($this->userToken())->getJson(self::DISCOVERY)->json('categories') as $category) {
            $this->assertIsInt($category['price_from']);
            $this->assertGreaterThan(0, $category['price_from']);
            $this->assertSame('INR', $category['currency']);
        }
    }

    public function test_discovery_and_matching_describe_the_same_people_the_same_way(): void
    {
        // The property that stops the two screens drifting apart. Before the
        // roster was shared, the dashboard advertised a technician at 4.9 and
        // matching offered the same person at 4.6, because the two literals had
        // been written from two different designs. A person tapping through both
        // would have seen somebody change their own history, and a screen has no
        // way to reconcile that — neither value is wrong about itself.
        //
        // Asserted by joining on the identifier rather than on the name, so a
        // rename that left the ratings consistent would still fail here.
        $discovery = $this->actingAsToken($this->userToken())->getJson(self::DISCOVERY)->json('featured_technicians');
        $matching = $this->actingAsToken($this->userToken())->getJson(self::MATCHING)->json('technicians');

        $this->assertNotSame([], $discovery);

        foreach ($discovery as $featured) {
            $match = collect($matching)->firstWhere('id', $featured['id']);

            $this->assertNotNull(
                $match,
                sprintf('Discovery advertises %s, whom matching does not offer.', $featured['id']),
            );

            $this->assertSame($featured['name'], $match['name']);
            $this->assertSame($featured['trade'], $match['trade']);
            $this->assertSame($featured['rating'], $match['rating']);
        }
    }

    public function test_a_carousel_card_has_no_base_fee_or_distance(): void
    {
        // The carousel draws a name, a trade, a rating and a count, and two fields
        // the endpoint deliberately leaves out. `distance_km` is the interesting
        // one: a carousel showing distances invites the comparison the "Near Me"
        // filter is meant to drive, and that comparison does not exist here.
        //
        // Asserted as an absence rather than as a schema, because a future card
        // that decided to draw a distance would be the change this catches.
        $first = $this->actingAsToken($this->userToken())->getJson(self::DISCOVERY)->json('featured_technicians.0');

        $this->assertArrayNotHasKey('base_fee', $first);
        $this->assertArrayNotHasKey('distance_km', $first);
        $this->assertArrayNotHasKey('availability', $first);
    }

    // ---------------------------------------------------------------------
    // Matching.
    // ---------------------------------------------------------------------

    public function test_the_matching_endpoint_answers_a_complete_literal(): void
    {
        $this->actingAsToken($this->userToken())->getJson(self::MATCHING)->assertOk()->assertJsonStructure([
            'query',
            'area',
            'found_count',
            'summary',
            'average_arrival_minutes',
            'estimated_cost' => ['min', 'max', 'currency'],
            'filters' => [['id', 'label']],
            'technicians' => [[
                'id', 'name', 'trade', 'years_experience', 'base_fee', 'currency',
                'rating', 'review_count', 'distance_km',
                'availability' => ['label', 'available_now'],
                'best_match',
            ]],
        ]);
    }

    public function test_found_count_and_the_number_of_results_disagree_on_purpose(): void
    {
        // The design draws "24 Found" above three cards. Reproducing the
        // arithmetic — saying 3, or padding the list to 24 — would have quietly
        // rewritten the frame to be self-consistent, and the disagreement is the
        // honest part: a real endpoint returns every match or pages them.
        //
        // **This asserts that they differ**, not what either is. The day somebody
        // fixes the arithmetic, this test fails and the fix has to justify itself,
        // which is the whole reason it is here rather than a comment.
        $response = $this->actingAsToken($this->userToken())->getJson(self::MATCHING);

        $this->assertGreaterThan(
            count($response->json('technicians')),
            $response->json('found_count'),
            'found_count is now consistent with the list, which is the one thing this endpoint must not be.',
        );
    }

    public function test_the_results_are_in_no_particular_order_because_nothing_ranked_them(): void
    {
        // Four chips offering "AI Best Match", "Near Me", "Price: Low to High" and
        // "Top Rated", and a list that is not sorted by any of them. The clearest
        // proof in the payload is that the highest-rated technician is listed
        // last: a list that had been sorted would not look like that.
        $technicians = $this->actingAsToken($this->userToken())->getJson(self::MATCHING)->json('technicians');

        $this->assertGreaterThan(1, count($technicians));

        $byRating = collect($technicians)->sortByDesc('rating')->values();
        $byFee = collect($technicians)->sortBy('base_fee')->values();
        $byDistance = collect($technicians)->sortBy('distance_km')->values();

        $this->assertNotSame(
            $byRating->pluck('id')->all(),
            collect($technicians)->pluck('id')->all(),
            'The list came back sorted by rating, so something ranked it.',
        );
        $this->assertNotSame(
            $byFee->pluck('id')->all(),
            collect($technicians)->pluck('id')->all(),
            'The list came back sorted by price, so something ranked it.',
        );
        $this->assertNotSame(
            $byDistance->pluck('id')->all(),
            collect($technicians)->pluck('id')->all(),
            'The list came back sorted by distance, so something ranked it.',
        );
    }

    public function test_asking_the_endpoint_to_sort_changes_nothing(): void
    {
        // The four chips have identifiers and labels and no behaviour. Sending
        // each of them as a query parameter is what a screen wired up properly
        // would do, and the answer must be byte-identical — otherwise some day a
        // reviewer would find that `?filter=price-low-high` worked and would take
        // it as evidence that the endpoint sorts, which is the belief this test
        // exists to prevent.
        $token = $this->userToken();

        $unsorted = $this->actingAsToken($token)->getJson(self::MATCHING)->json('technicians');

        foreach ($this->actingAsToken($token)->getJson(self::MATCHING)->json('filters') as $filter) {
            $this->actingAsToken($token)
                ->getJson(self::MATCHING.'?'.http_build_query(['filter' => $filter['id']]))
                ->assertOk();

            $this->assertSame(
                $unsorted,
                $this->actingAsToken($token)
                    ->getJson(self::MATCHING.'?'.http_build_query(['filter' => $filter['id']]))
                    ->json('technicians'),
                sprintf('Sending "%s" reordered the results, so the endpoint sorts something.', $filter['id']),
            );
        }
    }

    public function test_the_availability_flag_and_label_say_opposite_things_for_different_people(): void
    {
        // Both branches of the card's action need to be reachable, or the screen's
        // derivation of "Book Now" against "View Profile" is never exercised by
        // real data. A fixture where every technician is available would render a
        // screen that looks finished and has never drawn its second button.
        $technicians = $this->actingAsToken($this->userToken())->getJson(self::MATCHING)->json('technicians');

        $available = array_filter($technicians, fn (array $t): bool => $t['availability']['available_now']);
        $unavailable = array_filter($technicians, fn (array $t): bool => ! $t['availability']['available_now']);

        $this->assertNotSame([], $available, 'No technician is available now, so the booking action is never drawn.');
        $this->assertNotSame([], $unavailable, 'Every technician is available now, so the profile action is never drawn.');
    }

    public function test_exactly_one_result_is_badged_as_the_best_match(): void
    {
        // The badge is a position the fixture puts there, not the output of a
        // comparison. One is what the design draws; zero or two would make the
        // badge mean nothing, and a screen that draws it on the first card by
        // default would be indistinguishable from one that honours the flag.
        $badged = array_filter(
            $this->actingAsToken($this->userToken())->getJson(self::MATCHING)->json('technicians'),
            fn (array $t): bool => $t['best_match'],
        );

        $this->assertCount(1, $badged);
    }

    // ---------------------------------------------------------------------
    // The quote.
    // ---------------------------------------------------------------------

    public function test_the_quote_endpoint_answers_a_complete_literal(): void
    {
        $this->actingAsToken($this->userToken())->getJson(self::QUOTE)->assertOk()->assertJsonStructure([
            'booking_id',
            'category',
            'service',
            'technician' => ['id', 'name', 'trade', 'rating', 'review_count'],
            'dates' => [['date', 'weekday', 'day_label', 'is_today']],
            'times' => [['starts_at', 'label']],
            'estimate' => [
                'heading', 'badge',
                'lines' => [['label', 'amount']],
                'total', 'total_label', 'currency', 'footnote',
            ],
            'payment_methods' => [['id', 'title', 'note']],
        ]);
    }

    public function test_the_quote_refuses_a_booking_it_has_no_example_of(): void
    {
        // **The only mocked customer endpoint that can say no**, and the one
        // conditional here worth implementing: answering `BK-9999` with
        // `BK-2041`'s technician is exactly what an endpoint that forgot to look
        // anything up looks like, and the screen would render it without
        // complaint.
        $response = $this->actingAsToken($this->userToken())
            ->getJson('/api/v1/identity/users/bookings/BK-9999/quote');

        $response->assertNotFound();
        $response->assertJsonMissingPath('technician');
    }

    public function test_a_refused_quote_leaks_nothing_about_the_booking_that_exists(): void
    {
        // The `404`'s body is asserted rather than its status, because a `404`
        // carrying the example booking's technician would satisfy the status
        // check above and still tell a caller who is guessing identifiers what a
        // valid one looks like.
        $refused = $this->actingAsToken($this->userToken())
            ->getJson('/api/v1/identity/users/bookings/BK-9999/quote');

        $this->assertStringNotContainsString(
            'Imran Qureshi',
            (string) $refused->getContent(),
            'The refused quote named the technician of the booking that does exist.',
        );
    }

    public function test_the_three_offered_days_are_consecutive_and_only_one_is_today(): void
    {
        // The design says "TODAY / 14 Oct", which cannot both be true. The
        // endpoint resolves it with arithmetic, and this asserts the arithmetic
        // rather than the words: consecutive dates, exactly one flagged, and the
        // flagged one being the first.
        //
        // The weekday and day label are checked against the date they sit beside,
        // which is the assertion that would catch the labels being typed in and
        // the dates being computed — a fixture that did both would be right until
        // the fourteenth and wrong on the fifteenth.
        $dates = $this->actingAsToken($this->userToken())->getJson(self::QUOTE)->json('dates');

        $this->assertCount(3, $dates);
        $this->assertSame([0, 1, 2], array_keys($dates));

        foreach ($dates as $index => $day) {
            $parsed = Carbon::parse($day['date']);

            $this->assertSame(
                Carbon::today()->addDays($index)->toDateString(),
                $day['date'],
                sprintf('Day %d is not %d days from today.', $index, $index),
            );
            $this->assertSame($parsed->format('D'), $day['weekday']);
            $this->assertSame($parsed->format('d M'), $day['day_label']);
            $this->assertSame($index === 0, $day['is_today']);
        }
    }

    public function test_the_estimates_lines_add_up_to_the_total_it_states(): void
    {
        // The one arithmetic assertion in this file, and the one that matters most
        // for the quote: three lines that do not sum to the total beside them is
        // a screen a person can check, and they will check it.
        $estimate = $this->actingAsToken($this->userToken())->getJson(self::QUOTE)->json('estimate');

        $this->assertNotSame([], $estimate['lines']);

        $this->assertSame(
            $estimate['total'],
            array_sum(array_column($estimate['lines'], 'amount')),
            'The estimate lines do not add up to the total printed beside them.',
        );
    }

    public function test_the_quote_and_the_bookings_list_agree_about_the_same_booking(): void
    {
        // Three agreements, because two endpoints describing one booking as two
        // different jobs is the defect the shared fixture exists to prevent, and a
        // customer reading both would have no way to reconcile it:
        //
        // - the quote's booking is in the list at all,
        // - the list names the same technician,
        // - and the list's `service` is the quote's `category`.
        //
        // The price is checked too, in the test below, because that one is a
        // single literal on each side and would otherwise be free to drift.
        $token = $this->userToken();

        $quote = $this->actingAsToken($token)->getJson(self::QUOTE);
        $list = $this->actingAsToken($token)->getJson(self::BOOKINGS)->json('bookings');

        $booking = collect($list)->firstWhere('id', $quote->json('booking_id'));

        $this->assertNotNull($booking, sprintf('%s is not in the bookings list.', $quote->json('booking_id')));
        $this->assertSame($booking['worker_name'], $quote->json('technician.name'));
        $this->assertSame($booking['service'], $quote->json('category'));
    }

    public function test_the_quote_and_the_bookings_list_price_the_booking_the_same(): void
    {
        // A list that says ₹850 beside a detail that says "Total Payable ₹450" is
        // a discrepancy a customer would report and neither screen could explain.
        // Asserted as an agreement rather than as a number, so changing both ends
        // together is green and changing one is red.
        $token = $this->userToken();

        $quote = $this->actingAsToken($token)->getJson(self::QUOTE);
        $booking = collect($this->actingAsToken($token)->getJson(self::BOOKINGS)->json('bookings'))
            ->firstWhere('id', $quote->json('booking_id'));

        $this->assertSame($booking['price'], $quote->json('estimate.total'));
        $this->assertSame($booking['currency'], $quote->json('estimate.currency'));
    }

    public function test_the_technician_on_the_booking_is_not_one_of_the_ones_available_to_book(): void
    {
        // Discovery and matching offer three technicians. The booking's technician
        // is a fourth person, on a job. Reusing one of the three would have meant
        // a customer could book somebody who is currently in a van — a
        // contradiction a screen reader would never catch and a person very
        // quickly would.
        $token = $this->userToken();

        $assigned = $this->actingAsToken($token)->getJson(self::QUOTE)->json('technician');
        $available = array_column($this->actingAsToken($token)->getJson(self::MATCHING)->json('technicians'), 'id');

        $this->assertNotContains($assigned['id'], $available);
    }

    // ---------------------------------------------------------------------
    // Registration.
    // ---------------------------------------------------------------------

    public function test_registration_answers_created_without_creating_anything(): void
    {
        // Counted *after* the token is minted, and the ordering is load-bearing.
        // The token helper creates the very account this test counts, so reading
        // the count first and comparing at the end would fail for the right
        // number and the wrong reason — which is a test that teaches the next
        // reader that `201` implies a write.
        $token = $this->userToken();
        $before = User::count();

        $response = $this->actingAsToken($token)->postJson(self::REGISTER, $this->registrationPayload());

        $response->assertCreated()->assertJsonStructure(['success', 'message', 'user' => ['id', 'name', 'email'], 'token']);

        // The `201` is a decision, and the half of it that can be checked is that
        // nothing was written. A route that answered `201` while creating an
        // account would make this test fail, which is the only honest way for a
        // mock to advertise itself.
        $this->assertSame($before, User::count());
    }

    public function test_registration_echoes_the_name_and_email_it_was_given(): void
    {
        // The two fields the design's success state shows. The password is not
        // one of them, and the next test is why.
        $this->actingAsToken($this->userToken())
            ->postJson(self::REGISTER, $this->registrationPayload())
            ->assertCreated()
            ->assertJsonPath('user.name', 'Aarav Sharma')
            ->assertJsonPath('user.email', 'aarav@example.test');
    }

    public function test_registration_never_echoes_the_password_back(): void
    {
        // A credential in a response is a credential in a proxy log, a browser
        // cache and a screenshot. The controller accepts it and ignores it, and
        // this asserts the whole body rather than one field — because the failure
        // mode is the password appearing *anywhere*, not in a key somebody
        // remembered to check.
        $payload = $this->registrationPayload();

        $response = $this->actingAsToken($this->userToken())->postJson(self::REGISTER, $payload);

        $this->assertStringNotContainsString(
            $payload['password'],
            (string) $response->getContent(),
            'The registration response echoed the password back.',
        );
    }

    public function test_the_registration_token_is_not_a_credential(): void
    {
        // It looks exactly like one — that is the trap. Presented as a bearer
        // token it must be refused, because a screen that stores it and treats
        // the person as signed in would be holding something worthless.
        $token = $this->actingAsToken($this->userToken())
            ->postJson(self::REGISTER, $this->registrationPayload())
            ->json('token');

        $this->assertIsString($token);
        $this->assertNotSame('', $token);

        $this->app['auth']->forgetGuards();

        $this->withToken($token)->getJson('/api/v1/identity/users/me')->assertUnauthorized();
    }

    public function test_the_registration_token_differs_between_calls(): void
    {
        // Random rather than a constant, so two people registering in a demo do
        // not appear to share a session and no screenshot contains a string that
        // looks reusable.
        $token = $this->userToken();

        $first = $this->actingAsToken($token)->postJson(self::REGISTER, $this->registrationPayload())->json('token');
        $second = $this->actingAsToken($token)->postJson(self::REGISTER, $this->registrationPayload())->json('token');

        $this->assertNotSame($first, $second);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    /**
     * The registration payload the designed screen submits.
     *
     * Written once and used by every registration assertion, because the three
     * fields are the shape of the registration frame — full name, email,
     * password — and a second literal written out in a test is a second place for
     * the controller and the client to disagree about which fields exist.
     *
     * @return array{name: string, email: string, password: string}
     */
    private function registrationPayload(): array
    {
        return [
            'name' => 'Aarav Sharma',
            'email' => 'aarav@example.test',
            'password' => 'a-password-that-is-never-stored',
        ];
    }

    /**
     * Present a Sanctum token on the next requests, as a bearer header.
     *
     * `actingAs` with a token is deliberately avoided, for the reason given in
     * `AbilityScopedAuthorisationTest`: it bypasses the guard's token resolution,
     * which is the wiring under test.
     *
     * `forgetGuards` first, and it is load-bearing. Guards are singletons and
     * `RequestGuard::user()` memoises its answer, so within one test the second
     * request would otherwise be handed the first request's account and every
     * "the wrong token is refused" assertion would pass for the wrong reason.
     */
    private function actingAsToken(NewAccessToken $token): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($token->plainTextToken);
    }

    private function userToken(): NewAccessToken
    {
        return User::factory()->create()->createToken('api', ['users:*']);
    }
}
