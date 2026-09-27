<?php

namespace App\Http\Controllers\Accounts;

use App\Application\IdentityAndAccess\Exceptions\AccountNotFound;
use App\Application\IdentityAndAccess\UseCases\ShowAdminAccount;
use App\Http\Controllers\Controller;
use App\Http\Resources\Accounts\AdminAccountResource;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Reads one administrator's record.
 *
 * The identifier arrives as a plain integer rather than as a route-model-bound
 * `Admin`, and that is a security decision rather than a style one. Route model
 * binding resolves in the `api` middleware group, which runs *before* this
 * route's `account.can` middleware — so a bound model would produce a 404 for an
 * identifier that does not exist and a 403 for one that does, and the difference
 * between those two statuses is an oracle for walking the administrators table.
 * Taking the raw identifier and resolving it inside the use case, after the
 * ability has been checked, means an unauthorised caller gets the same 403
 * whether or not the record exists.
 */
class ShowAdminController extends Controller
{
    public function __construct(private ShowAdminAccount $showAdminAccount) {}

    public function __invoke(int $admin): JsonResponse
    {
        try {
            $account = $this->showAdminAccount->execute($admin);
        } catch (AccountNotFound $e) {
            // Translated to an HTTP 404 here rather than in the use case, so that
            // the application layer stays free of the idea of a status code.
            throw new NotFoundHttpException($e->getMessage(), $e);
        }

        return (new AdminAccountResource($account))
            ->response()
            ->setStatusCode(200);
    }
}
