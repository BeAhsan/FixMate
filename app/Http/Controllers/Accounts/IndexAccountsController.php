<?php

namespace App\Http\Controllers\Accounts;

use App\Application\IdentityAndAccess\UseCases\ListAllAccounts;
use App\Http\Controllers\Controller;
use App\Http\Resources\Accounts\AccountSummaryResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Every account in the platform, across all four account types.
 *
 * The account-management counterpart to `ShowAdminController`, and it takes no
 * identifier at all — which sidesteps the whole question that controller has to be
 * careful about. There is no path parameter to probe, so there is no 404-versus-403
 * distinction to leak and nothing to enumerate. An unauthorised caller is refused
 * by the middleware before this class runs, and learns only that.
 *
 * The response is wrapped in a `data` envelope by Laravel's resource collection,
 * so the four front ends read `{ "data": [...] }`. That is the same envelope every
 * other collection in this API produces, and a list that wrapped itself differently
 * would be the one response shape a generated client could not describe.
 */
class IndexAccountsController extends Controller
{
    public function __construct(private ListAllAccounts $listAllAccounts) {}

    public function __invoke(): JsonResponse
    {
        return AnonymousResourceCollection::make(
            $this->listAllAccounts->execute(),
            AccountSummaryResource::class,
        )->response()->setStatusCode(200);
    }
}
