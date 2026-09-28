<?php

namespace App\Http\Controllers\Catalog;

use App\Application\Catalog\UseCases\ListProducts;
use App\Http\Controllers\Controller;
use App\Http\Resources\Catalog\ProductResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Every product in the catalogue.
 *
 * The Catalog counterpart to `IndexAccountsController`, and unlike that one it
 * names no middleware: the endpoint is deliberately open, because the catalogue
 * is public and the contract the front end is coded against says so. That is a
 * decision, not an oversight — the absence of `auth:sanctum` here is the thing
 * the route file has to keep saying out loud, so it is commented there too.
 *
 * The status code is set explicitly for the same reason `IndexAccountsController`
 * sets it. `AnonymousResourceCollection` is a 200 by default, and this makes the
 * contract's `200` a stated fact rather than an inherited default — particularly
 * for the empty case, which has to be a 200 with `{"data": []}` and not a 404.
 * Laravel's resource collection supplies the `data` envelope, so an empty
 * catalogue serialises as `{"data":[]}` and a populated one as `{"data":[...]}`,
 * with no pagination envelope around it.
 */
class IndexProductsController extends Controller
{
    public function __construct(private ListProducts $listProducts) {}

    public function __invoke(): JsonResponse
    {
        return AnonymousResourceCollection::make(
            $this->listProducts->execute(),
            ProductResource::class,
        )->response()->setStatusCode(200);
    }
}
