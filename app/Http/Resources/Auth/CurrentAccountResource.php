<?php

namespace App\Http\Resources\Auth;

use App\Application\IdentityAndAccess\DTOs\CurrentAccount;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The signed-in account, as the application that asked sees it.
 *
 * Takes a {@see CurrentAccount} rather than a model or a raw array, so the shape
 * of this response is decided in one place and cannot drift with a column
 * addition — which is the whole reason API resources are the HTTP boundary here.
 *
 * One shape for all four account types rather than four shapes, with the account
 * type named in the body. That is the opposite of the sign-in responses, which
 * nest the account under a per-type key, and the difference is deliberate: at
 * sign-in each application already knows what it is, so a key named after the
 * store is a convenience. Here the caller is asking "who am I", and the answer
 * has to be able to say that the thing answering is a customer when a worker was
 * expected — which is how an application notices it has been handed the wrong
 * token rather than silently rendering an empty screen.
 */
class CurrentAccountResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var CurrentAccount $account */
        $account = $this->resource;

        return [
            'account_type' => $account->accountType->value,
            'account' => [
                'id' => $account->id,
                'name' => $account->name,
                'email' => $account->email,
                'status' => $account->status,
            ],
            // Echoed so a front end can hide or show things before it has decided
            // what to render. It is the token's own claim list, carried by
            // {@see CurrentAccount}, so an application cannot be told one thing
            // here and another by the endpoint it then calls.
            'abilities' => $account->abilities,
        ];
    }
}
