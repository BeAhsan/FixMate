<?php

namespace App\Http\Resources\Auth;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * API Resource for sign-in response.
 * Declares the exact response shape - prevents silent changes from database.
 */
class SignInResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        // The resource data is already an array with token, user, abilities
        return $this->resource;
    }
}
