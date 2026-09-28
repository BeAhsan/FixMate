<?php

namespace Database\Factories;

use App\Models\Product;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Product>
 */
class ProductFactory extends Factory
{
    /**
     * The catalogue this repository ships with, as name-and-price *pairs*.
     *
     * Held as pairs rather than as two parallel lists on purpose: with a name list
     * and a price list indexed independently, a row can be built from the name at
     * one index and the price at another, and the result is a product named
     * "Widget" that costs 124.50. A pair cannot be put together wrongly.
     *
     * It is a constant rather than a factory state so that the seeder and the
     * feature test read the same three rows. The two of them care about different
     * things — the seeder wants a catalogue a developer can look at, the test
     * wants one row with two decimal places and one with none — and both of those
     * are properties of this list.
     *
     * @var list<array{name: string, price: string}>
     */
    public const CATALOGUE = [
        ['name' => 'Widget', 'price' => '19.99'],
        ['name' => 'Gadget', 'price' => '5.00'],
        ['name' => 'Gizmo', 'price' => '124.50'],
    ];

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->unique()->words(2, true),
            'price' => fake()->randomFloat(2, 5, 500),
        ];
    }
}
