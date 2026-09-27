<?php

namespace App\Http\Controllers;

use App\Application\IdentityAndAccess\UseCases\DescribeCurrentAccount;
use App\Http\Resources\Auth\CurrentAccountResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Answers "who am I" for whichever account type is signed in.
 *
 * One controller for all four stores, and that is a change of mind worth
 * explaining: four `me` controllers, one per application, would each have been six
 * lines and would each have had to be right. They would differ only in which use
 * case they call, and the four differences are decided by the route's middleware
 * rather than by anything here — the `authorised` middleware has already refused
 * a token belonging to another store, so by the time this runs the account is
 * known to be the type the route belongs to. Four controllers would have been the
 * same decision written four times, and the fifth account type would have been a
 * fifth copy of it.
 *
 * The abilities are read from the token here rather than derived, and the comment
 * on the line says why. Everything else is what the existing controllers already
 * do: take what the framework has already established, call one use case, return
 * a resource.
 */
class CurrentAccountController extends Controller
{
    public function __construct(
        private DescribeCurrentAccount $describeCurrentAccount,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        return (new CurrentAccountResource(
            $this->describeCurrentAccount->execute(
                $request->user(),
                // The token's own claim list, passed through rather than
                // re-derived from the account type. Two reasons, and the second
                // is the one that matters: the response must not tell a caller
                // its token can do something the token cannot do, and a token
                // whose abilities were narrowed must be told the truth about
                // them. Reading it here also means this endpoint cannot disagree
                // with the middleware that let the request through — both read
                // the same list, from the same place.
                $request->user()->currentAccessToken()?->abilities ?? [],
            ),
        ))->response();
    }
}
