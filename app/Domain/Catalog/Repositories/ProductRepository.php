<?php

namespace App\Domain\Catalog\Repositories;

use App\Domain\Catalog\Entities\Product;

/**
 * Repository interface for Product entities.
 * This is the contract the domain depends on - no framework types.
 */
interface ProductRepository
{
    /**
     * Every product in the catalogue, or an empty list when there are none.
     *
     * An empty list rather than null, because the endpoint's contract is that an
     * empty catalogue is a `200` with `{"data": []}` and not a 404 or a null. A
     * `null` return would put that decision in the consumer, where it would have
     * to be made again by everything that reads this method.
     *
     * Order is the implementation's business; nothing above this line should
     * depend on it.
     *
     * @return list<Product>
     */
    public function all(): array;
}
