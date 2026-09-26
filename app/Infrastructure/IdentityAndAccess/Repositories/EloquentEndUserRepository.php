<?php

namespace App\Infrastructure\IdentityAndAccess\Repositories;

use App\Domain\IdentityAndAccess\Entities\EndUser;
use App\Domain\IdentityAndAccess\Repositories\EndUserRepository;
use App\Domain\IdentityAndAccess\ValueObjects\Email;
use App\Domain\IdentityAndAccess\ValueObjects\UserId;
use App\Models\User as EloquentUser;
use Illuminate\Support\Str;

/**
 * Eloquent implementation of EndUserRepository.
 * This is the only layer that knows about Eloquent/database.
 */
class EloquentEndUserRepository implements EndUserRepository
{
    public function findByEmail(Email $email): ?EndUser
    {
        // Case-insensitive email lookup
        $eloquentUser = EloquentUser::whereRaw('LOWER(email) = ?', [Str::lower($email->value)])->first();

        if (! $eloquentUser) {
            return null;
        }

        return $this->toEntity($eloquentUser);
    }

    public function findById(UserId $id): ?EndUser
    {
        $eloquentUser = EloquentUser::find($id->value);

        if (! $eloquentUser) {
            return null;
        }

        return $this->toEntity($eloquentUser);
    }

    public function save(EndUser $user): EndUser
    {
        $eloquentUser = EloquentUser::updateOrCreate(
            ['id' => $user->id->value],
            [
                'name' => $user->name,
                'email' => $user->email->value,
                'password' => $user->passwordHash,
                'status' => $user->status->value,
            ]
        );

        return $this->toEntity($eloquentUser);
    }

    private function toEntity(EloquentUser $eloquentUser): EndUser
    {
        return EndUser::fromPersistence(
            id: $eloquentUser->id,
            name: $eloquentUser->name,
            email: $eloquentUser->email,
            passwordHash: $eloquentUser->password,
            status: $eloquentUser->status,
        );
    }
}
