<?php

namespace Database\Seeders;

use App\Models\Product;
use App\Models\User;
use Database\Factories\ProductFactory;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // User::factory(10)->create();

        User::factory()->create([
            'name' => 'Test User',
            'email' => 'test@example.com',
        ]);

        // A catalogue, so `GET /api/products` is never empty in development. The
        // endpoint's contract covers the empty case, and it has a test for it;
        // what a seeded database cannot do is show a developer the populated one
        // without them having to create rows by hand first.
        foreach (ProductFactory::CATALOGUE as $product) {
            Product::factory()->create($product);
        }
    }
}
