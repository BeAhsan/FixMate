<?php

namespace App\Models;

use Database\Factories\ProductFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A catalogue product.
 *
 * The persistence model for the Catalog context, and the only class in the
 * request path that knows this row lives in a table called `products`. The four
 * credential stores do the same thing for their own context, with the same
 * `#[Fillable]` attribute rather than a `$fillable` property.
 */
#[Fillable(['name', 'price'])]
class Product extends Model
{
    /** @use HasFactory<ProductFactory> */
    use HasFactory;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            // Read back as a fixed-scale string, so the value that comes out of
            // the database is the value that went in. Note that this is a
            // *string*: left unconverted it serialises as `"19.99"`, which is the
            // one thing the API contract forbids. ProductResource is the single
            // place that converts it to a float.
            'price' => 'decimal:2',
        ];
    }
}
