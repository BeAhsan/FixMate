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

    public function all(): array
    {
        return EloquentUser::query()
            ->orderBy('id')
            ->get()
            ->map(fn (EloquentUser $row) => $this->toEntity($row))
            ->all();
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
                // Written because the entity carries it. Omitting it here is a bug
                // that is invisible until something tries to clear the flag: `updateOrCreate`
                // writes only the keys it is given, so a save() that left this out
                // would keep the stored value whatever the domain had decided, and
                // `must_change_password` could never be cleared.
                'must_change_password' => $user->mustChangePassword,
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
            mustChangePassword: (bool) $eloquentUser->must_change_password,
        );
    }
}
