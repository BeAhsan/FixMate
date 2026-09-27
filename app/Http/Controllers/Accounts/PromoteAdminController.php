<?php

namespace App\Http\Controllers\Accounts;

use App\Application\IdentityAndAccess\Exceptions\AccountNotFound;
use App\Application\IdentityAndAccess\Exceptions\CannotPromoteSelf;
use App\Application\IdentityAndAccess\Exceptions\SuperAdminAlreadyExists;
use App\Application\IdentityAndAccess\UseCases\PromoteAdminToSuperAdmin;
use App\Http\Controllers\Controller;
use App\Http\Resources\Accounts\PromotedAccountResource;
use App\Infrastructure\IdentityAndAccess\AccountTypeRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Promotes one administrator to super administrator.
 *
 * The raw identifier, for the reason `ShowAdminController` and
 * `SuspendAdminController` both take one: route model binding resolves before the
 * ability check, so a bound model would turn "no such administrator" into a 404
 * and "not yours" into a 403, and that difference walks the table.
 *
 * Two different failures come out of here as two different statuses, because they
 * ask the person different things. Promoting yourself is a conflict between the
 * request and who you are. Somebody who already holds the role is a conflict
 * between the request and the world. Both are 409; neither is a 403, because the
 * caller is permitted to promote and did not fail a permission check.
 */
class PromoteAdminController extends Controller
{
    public function __construct(private PromoteAdminToSuperAdmin $promoteAdminToSuperAdmin) {}

    public function __invoke(Request $request, int $admin): JsonResponse
    {
        $caller = $request->user();

        try {
            $result = $this->promoteAdminToSuperAdmin->execute(
                id: $admin,
                callerType: AccountTypeRegistry::for($caller),
                callerId: (int) $caller->getKey(),
            );
        } catch (AccountNotFound $e) {
            throw new NotFoundHttpException($e->getMessage(), $e);
        } catch (CannotPromoteSelf|SuperAdminAlreadyExists $e) {
            throw new ConflictHttpException($e->getMessage(), $e);
        }

        return (new PromotedAccountResource($result))
            ->response()
            ->setStatusCode(200);
    }
}
