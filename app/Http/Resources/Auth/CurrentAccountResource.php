<?php

namespace App\Http\Resources\Auth;

use App\Application\IdentityAndAccess\DTOs\CurrentAccount;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The signed-in account, as the application that asked sees it.
 *
 * One shape for all four account types rather than four shapes, with the account
 * type named in the body. That is the opposite of the sign-in responses, which
 * nest the account under a per-type key, and the difference is deliberate: at
 * sign-in each application already knows what it is, so a key named after the
 * store is a convenience. Here the caller is asking "who am I", and the answer
 * has to be able to say that the thing answering is a customer when a worker was
 * expected — which is how an application notices it has been handed the wrong
 * token rather than silently rendering an empty screen.
 *
 * It is given the `CurrentAccount` DTO rather than the Eloquent model the guard
 * resolved, which is the layering rule the rest of the HTTP layer follows: the
 * resource is the boundary, and what reaches it has already been decided by the
 * use case underneath. Reading `$model->email` here would mean deciding the
 * response's shape from a database row, and adding a column to a table would
 * change what an application receives. The DTO also settles a question the model
 * cannot: `status` arrives as the value the domain normalised it to, so this
 * endpoint and `GET /admins/{admin}` — which reaches the same row through the
 * repository — cannot describe one record two different ways.
 */
class CurrentAccountResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $account = $this->resource;

        return [
            'account_type' => $account->accountType->value,
            'account' => [
                'id' => $account->id,
                'name' => $account->name,
                'email' => $account->email,
                'status' => $account->status,
            ],
            // Echoed back so a front end can hide or show things before it has
            // decided what to render. It is the token's own claim list, not a
            // fresh decision, so an application cannot be told one thing here and
            // another by the endpoint it then calls — and a token that had its
            // abilities narrowed is told the truth about them.
            'abilities' => $account->abilities,
        ];
    }
}
