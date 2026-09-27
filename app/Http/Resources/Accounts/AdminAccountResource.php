<?php

namespace App\Http\Resources\Accounts;

use App\Application\IdentityAndAccess\DTOs\AdminAccount;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One administrator, as the account-management surface describes it.
 *
 * Carries no password hash and no reset token, and that is a property of taking
 * a {@see AdminAccount} rather than a model: the DTO has no field to leak, so
 * adding a sensitive column to the `admins` table cannot silently add it to this
 * response. The entity does carry `passwordHash`, and the use case does not copy
 * it across — which is the boundary doing its job rather than the resource
 * filtering a list at render time.
 */
class AdminAccountResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var AdminAccount $account */
        $account = $this->resource;

        return [
            'id' => $account->id,
            'name' => $account->name,
            'email' => $account->email,
            // A plain string rather than the enum: the wire format is what the
            // four front ends switch on, and an enum's name is an implementation
            // detail that a rename in PHP would otherwise change underneath them.
            'status' => $account->status->value,
        ];
    }
}
