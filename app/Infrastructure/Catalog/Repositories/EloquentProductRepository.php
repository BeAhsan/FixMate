<?php

namespace App\Infrastructure\Catalog\Repositories;

use App\Domain\Catalog\Entities\Product;
use App\Domain\Catalog\Repositories\ProductRepository;
use App\Models\Product as EloquentProduct;

/**
 * Eloquent implementation of ProductRepository.
 * This is the only layer that knows about Eloquent/database.
 */
class EloquentProductRepository implements ProductRepository
{
    public function all(): array
    {
        return EloquentProduct::query()
            // Ordered by identifier so the response order is stable and total. A
            // front end rendering this list can then rely on the same row staying
            // in the same place between two requests, and a person comparing two
            // moments sees the products in the same sequence.
            ->orderBy('id')
            ->get()
            ->map(fn (EloquentProduct $row) => $this->toEntity($row))
            ->all();
    }

    private function toEntity(EloquentProduct $row): Product
    {
        return new Product(
            id: (int) $row->id,
            name: (string) $row->name,
            // The `decimal:2` cast already produces a fixed-scale string, so this
            // cast is a type declaration rather than a conversion. It is still
            // needed because the entity is not optional about it.
            price: (string) $row->price,
        );
    }
}
