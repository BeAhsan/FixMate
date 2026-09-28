<?php

namespace App\Domain\Catalog\Entities;

/**
 * A catalogue product, as the domain understands one.
 *
 * A pure domain entity with no framework dependencies, matching the four
 * Identity and Access entities.
 *
 * The price is a `string` here even though it reads as a number, and that is not
 * an oversight. The database gives back exactly what was stored — `19.99` — and
 * carrying it as a string means the value that reaches the wire is the value
 * that was written, with no binary floating point rounding on the way through.
 * The cost of that decision is that somebody has to decide the wire type, and
 * that somebody is the API resource. A `Price` value object was considered and
 * rejected: with a single consumer and no arithmetic in the domain, it would wrap
 * one `string` in a class to be unwrapped immediately.
 *
 * There is no `ProductId` value object either, and for the same reason — nothing
 * takes a product as a path parameter, so an identifier is only ever read.
 */
readonly class Product
{
    public function __construct(
        public int $id,
        public string $name,
        public string $price,
    ) {}
}
