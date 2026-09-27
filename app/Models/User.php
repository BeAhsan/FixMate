<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'password', 'status', 'must_change_password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'password' => 'hashed',

            // Cast, so the attribute is a real boolean rather than the 0 or 1
            // the database returns. Without it a cleared `must_change_password` of 0 is
            // *not* `false` under a strict comparison, so every assertion about the
            // flag - and any `=== false` anywhere else - reads a cleared flag as still
            // set. Truthiness in an `if` hides it; strictness does not.
            'must_change_password' => 'boolean',
        ];
    }
}
