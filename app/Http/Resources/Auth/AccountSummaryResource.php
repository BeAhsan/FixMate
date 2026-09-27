<?php

namespace App\Http\Resources\Auth;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Another account's record, as a reader who is not that account may see it.
 *
 * Flat, where `CurrentAccountResource` nests the account under an `account` key,
 * and the difference is not cosmetic. A "who am I" answer has a known subject, so
 * the account is the payload and nesting it leaves room to grow around it. Here
 * the subject is whoever the caller asked about, and the caller already knows who
 * that is — they put the identifier in. A key that names the record would be one
 * more thing for a client to read past, and the one thing a client cannot skip is
 * the thing that decides whether it is allowed to see this at all.
 *
 * The absence of `abilities` here is deliberate and is asserted by the tests. The
 * abilities in this platform describe the token that asked, not the record being
 * read; handing a caller the target's list would put another person's authority on
 * screen in their own window, and an application that built navigation from it
 * would offer links the caller cannot follow.
 */
class AccountSummaryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $account = $this->resource;

        return [
            'account_type' => $account->accountType->value,
            'id' => $account->id,
            'name' => $account->name,
            'email' => $account->email,
            'status' => $account->status,
        ];
    }
}
