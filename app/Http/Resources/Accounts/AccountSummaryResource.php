<?php

namespace App\Http\Resources\Accounts;

use App\Application\IdentityAndAccess\DTOs\AccountSummary;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One row of the account directory, whatever account type it is.
 *
 * Takes the {@see AccountSummary} interface rather than any of the four concrete
 * types, and reads only through the interface's accessors. That is what makes the
 * "each account type gets its own representation" rule structural instead of a
 * convention: this resource cannot reach a field that is not on the interface, so
 * adding a staff-only field to one summary type cannot leak into this response by
 * somebody forgetting that it should be conditioned on the type.
 *
 * The `type` field is on every row and is the account type's own `value` — the
 * same string the sign-in path and the token abilities already use. A front end
 * switches on that rather than on a display label, so renaming a label in the back
 * end cannot invalidate a stored preference, and a row is self-describing: a list
 * that mixes four types is otherwise uninterpretable.
 *
 * Carries no password hash and no reset token, for the same reason
 * {@see AdminAccountResource} does: neither exists on the interface, so there is
 * nothing here to filter out at render time.
 */
class AccountSummaryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var AccountSummary $summary */
        $summary = $this->resource;

        return [
            'type' => $summary->type()->value,
            'id' => $summary->id(),
            'name' => $summary->name(),
            'email' => $summary->email(),
            // A plain string rather than the enum, for the same reason as
            // AdminAccountResource: the wire format is what the four front ends
            // switch on and an enum's name is an implementation detail.
            'status' => $summary->status()->value,
        ];
    }
}
