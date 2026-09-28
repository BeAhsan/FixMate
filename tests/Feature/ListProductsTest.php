<?php

namespace Tests\Feature;

use App\Models\Product;
use Database\Factories\ProductFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The public product catalogue, over HTTP, with no token.
 *
 * The front end is being written against this endpoint in parallel, so these
 * assertions are the contract rather than a description of it. The two failures
 * worth writing a test for are the two the contract calls out by name: a `price`
 * that arrives as a string, and an empty catalogue that answers 404 or `null`
 * instead of `{"data": []}`.
 *
 * Nothing here authenticates, and that is asserted by omission — the request
 * carries no token at all. A guard added to this route later would fail the first
 * test, which is the point.
 */
class ListProductsTest extends TestCase
{
    use RefreshDatabase;

    private const PRODUCTS = '/api/products';

    public function test_it_lists_every_product_with_an_id_a_name_and_a_numeric_price(): void
    {
        foreach (ProductFactory::CATALOGUE as $product) {
            Product::factory()->create($product);
        }

        $response = $this->getJson(self::PRODUCTS);

        $response->assertOk();
        $this->assertStringContainsString(
            'application/json',
            (string) $response->headers->get('Content-Type'),
        );

        $rows = $response->json('data');

        $this->assertIsArray($rows);
        $this->assertCount(count(ProductFactory::CATALOGUE), $rows);

        // The types are checked on the *decoded* body with gettype-style
        // predicates rather than assertIsNumeric, because assertIsNumeric passes
        // on the string "19.99" — which is the exact failure the contract forbids.
        // A front end that formats this value directly does not coerce a string,
        // so a string here is a broken release, not a cosmetic difference.
        foreach ($rows as $row) {
            $this->assertIsInt($row['id'], 'id must be a JSON integer.');
            $this->assertIsString($row['name'], 'name must be a JSON string.');
            $this->assertNotSame('', $row['name'], 'name must not be empty.');
            $this->assertTrue(
                is_float($row['price']) || is_int($row['price']),
                'price must be a JSON number, and it arrived as '.get_debug_type($row['price']).'.',
            );
        }

        // And on the raw body as well, because a decoded number can only be
        // asserted about the field the test looked at, while this proves the
        // bytes on the wire are unquoted. `19.99` is one of the seeded prices;
        // json_encode renders a float without quotes and a string with them, so
        // this substring cannot be produced by `"price":"19.99"`.
        $this->assertStringContainsString('"price":19.99', $response->getContent());
    }

    public function test_it_answers_with_an_empty_data_array_when_there_are_no_products(): void
    {
        $response = $this->getJson(self::PRODUCTS);

        // A 200, not a 404 and not a 204. The contract is explicit about this
        // because "no results" is an ordinary state for a catalogue and a client
        // that has to distinguish it from a failure is a client with two code
        // paths for one screen.
        $response->assertOk();
        $this->assertSame([], $response->json('data'));

        // The exact bytes, so the shape is checked on the wire as well: `[]` and
        // not `null`, `{}` or an empty body.
        $this->assertStringContainsString('"data":[]', $response->getContent());
    }

    public function test_the_response_carries_no_pagination_envelope(): void
    {
        Product::factory()->create(ProductFactory::CATALOGUE[0]);

        $body = $this->getJson(self::PRODUCTS)->assertOk()->json();

        // `data` and nothing else. A front end reading `body.data` does not care
        // about this, but a generated client has to describe every key it is
        // given, so a `meta`/`links` wrapper added later would change the
        // operation's type in the client package rather than just its payload.
        $this->assertSame(['data'], array_keys($body));
    }
}
