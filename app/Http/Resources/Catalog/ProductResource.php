<?php

namespace App\Http\Resources\Catalog;

use App\Domain\Catalog\Entities\Product;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One product in the catalogue list.
 *
 * **The one place the price becomes a number.** The domain carries it as the
 * string the database returned, because that is the value that was stored, and
 * `json_encode` renders a string as a string — so left alone this endpoint would
 * answer `"price": "19.99"`. The contract requires a JSON number, because the
 * front end formats the value directly and will not coerce a string first. The
 * conversion therefore happens here, and only here, where the wire format is
 * decided.
 *
 * The field names are exactly `id`, `name` and `price`, lowercase, because the
 * front end maps them one to one. There are no further fields, so nothing about
 * the internal representation can leak into a response.
 */
class ProductResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Product $product */
        $product = $this->resource;

        return [
            'id' => $product->id,
            'name' => $product->name,
            'price' => (float) $product->price,
        ];
    }
}
