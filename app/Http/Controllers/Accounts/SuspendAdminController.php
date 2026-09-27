<?php

namespace App\Http\Controllers\Accounts;

use App\Application\IdentityAndAccess\Exceptions\AccountNotFound;
use App\Application\IdentityAndAccess\Exceptions\CannotSuspendSelf;
use App\Application\IdentityAndAccess\UseCases\SuspendAdminAccount;
use App\Http\Controllers\Controller;
use App\Http\Resources\Accounts\AdminAccountResource;
use App\Infrastructure\IdentityAndAccess\AccountTypeRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Suspends one administrator, keeping the record.
 *
 * Takes the raw identifier for the same reason `ShowAdminController` does: route
 * model binding resolves before `account.can` runs, so a bound model would answer
 * 404 for an identifier that does not exist and 403 for one that does, and that
 * difference is a way to walk the administrators table. Resolution happens inside
 * the use case, after the ability has been checked.
 *
 * The caller's own identity is read from the request and handed to the use case,
 * which needs both the subject and the caller to enforce "not yourself". Taken
 * from `$request->user()` rather than from a body field, because a caller who could
 * name their own identifier in the request could simply name a different one.
 */
class SuspendAdminController extends Controller
{
    public function __construct(private SuspendAdminAccount $suspendAdminAccount) {}

    public function __invoke(Request $request, int $admin): JsonResponse
    {
        $caller = $request->user();

        try {
            $account = $this->suspendAdminAccount->execute(
                id: $admin,
                callerType: AccountTypeRegistry::for($caller),
                callerId: (int) $caller->getKey(),
            );
        } catch (AccountNotFound $e) {
            throw new NotFoundHttpException($e->getMessage(), $e);
        } catch (CannotSuspendSelf $e) {
            // A 409 rather than a 403. The caller *is* permitted to suspend
            // accounts — they hold the ability and passed every guard — so a 403
            // would be a false statement about why they were stopped. The conflict
            // is between what they asked for and who they are.
            throw new ConflictHttpException($e->getMessage(), $e);
        }

        return (new AdminAccountResource($account))
            ->response()
            ->setStatusCode(200);
    }
}
