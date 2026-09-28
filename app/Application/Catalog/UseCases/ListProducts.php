<?php

namespace App\Application\Catalog\UseCases;

use App\Domain\Catalog\Entities\Product;
use App\Domain\Catalog\Repositories\ProductRepository;

/**
 * Every product in the catalogue, in one list.
 *
 * The Catalog counterpart to `ListAllAccounts`, and much smaller than it. That
 * use case exists to merge four credential stores into one flat list, so it
 * takes four repositories and produces a summary type per account type. This one
 * has a single source and a single row shape, so it takes one repository and
 * returns what it read.
 *
 * There is deliberately no `ProductSummary` DTO between the entity and the
 * response. A summary type earns its keep when it merges or reshapes several
 * source types into one, which is what `AccountSummary` does; with one entity
 * and one representation it would be a class whose every method forwards to a
 * property of the same name, and the wire shape would be defined in two places
 * that could disagree.
 */
class ListProducts
{
    public function __construct(private ProductRepository $products) {}

    /**
     * @return list<Product>
     */
    public function execute(): array
    {
        return $this->products->all();
    }
}
