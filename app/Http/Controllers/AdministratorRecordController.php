<?php

namespace App\Http\Controllers;

use App\Application\IdentityAndAccess\UseCases\DescribeAdministrator;
use App\Http\Resources\Auth\AccountSummaryResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Answers for one administrator's record, by identifier.
 *
 * The only endpoint on the platform that takes an identifier the caller supplied,
 * and the one that most needs its authorisation to be somewhere other than the
 * controller. It is not here: the route's `authorised` middleware has already
 * decided whether the caller may ask this store at all, and `DescribeAdministrator`
 * has already decided whether they may ask about *this* record. What is left for
 * a controller is to hand over the two facts the use case cannot see — who is
 * asking, and what their token carries — and return the resource.
 *
 * The identifier is deliberately not route-model-bound. Binding would have
 * Laravel look the record up and answer 404 for a miss, which is the correct
 * behaviour everywhere except here: this use case has to be able to refuse a
 * record that is not the caller's *before* deciding whether it exists, and
 * `SubstituteBindings` runs before the controller, so a bound model would have
 * already turned "not yours" and "not there" into two different answers.
 *
 * `whereNumber` rather than nothing, because `UserId` refuses zero and a negative
 * number is not an identifier anybody can hold. Keeping those out of the route
 * means the use case can trust that an integer reaching it is a candidate
 * identifier, instead of defending itself against a value that was never one.
 */
class AdministratorRecordController extends Controller
{
    public function __construct(
        private DescribeAdministrator $describeAdministrator,
    ) {}

    public function __invoke(Request $request, string $admin): JsonResponse
    {
        return (new AccountSummaryResource(
            $this->describeAdministrator->execute(
                $request->user(),
                (int) $admin,
                // The caller's own abilities, for the same reason the "who am I"
                // endpoint passes its token's: the use case has to weigh this
                // caller's reach, and re-deriving it from the account type would
                // make the ownership rule a rule about account types rather than
                // about tokens.
                $request->user()->currentAccessToken()?->abilities ?? [],
            ),
        ))->response();
    }
}
