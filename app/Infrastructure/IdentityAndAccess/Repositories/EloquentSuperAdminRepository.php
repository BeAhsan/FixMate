<?php

namespace App\Infrastructure\IdentityAndAccess\Repositories;

use App\Domain\IdentityAndAccess\Entities\SuperAdmin;
use App\Domain\IdentityAndAccess\Repositories\SuperAdminRepository;
use App\Domain\IdentityAndAccess\ValueObjects\Email;
use App\Domain\IdentityAndAccess\ValueObjects\UserId;
use App\Models\SuperAdmin as EloquentSuperAdmin;
use Illuminate\Support\Str;

/**
 * Eloquent implementation of SuperAdminRepository.
 * This is the only layer that knows about Eloquent/database.
 *
 * It queries the super_admins table and nothing else - no fallback to admins,
 * to workers, or to users. The absence of an admins fallback is the part that
 * matters for this account type: it is what makes the super administrator a
 * separate door rather than an administrator with a wider key, and it is why
 * promotion moves a record instead of setting a column.
 */
class EloquentSuperAdminRepository implements SuperAdminRepository
{
    public function findByEmail(Email $email): ?SuperAdmin
    {
        // Case-insensitive email lookup
        $eloquentSuperAdmin = EloquentSuperAdmin::whereRaw('LOWER(email) = ?', [Str::lower($email->value)])->first();

        if (! $eloquentSuperAdmin) {
            return null;
        }

        return $this->toEntity($eloquentSuperAdmin);
    }

    public function findById(UserId $id): ?SuperAdmin
    {
        $eloquentSuperAdmin = EloquentSuperAdmin::find($id->value);

        if (! $eloquentSuperAdmin) {
            return null;
        }

        return $this->toEntity($eloquentSuperAdmin);
    }

    public function save(SuperAdmin $superAdmin): SuperAdmin
    {
        $eloquentSuperAdmin = EloquentSuperAdmin::updateOrCreate(
            ['id' => $superAdmin->id->value],
            [
                'name' => $superAdmin->name,
                'email' => $superAdmin->email->value,
                'password' => $superAdmin->passwordHash,
                'status' => $superAdmin->status->value,
            ]
        );

        return $this->toEntity($eloquentSuperAdmin);
    }

    private function toEntity(EloquentSuperAdmin $eloquentSuperAdmin): SuperAdmin
    {
        return SuperAdmin::fromPersistence(
            id: $eloquentSuperAdmin->id,
            name: $eloquentSuperAdmin->name,
            email: $eloquentSuperAdmin->email,
            passwordHash: $eloquentSuperAdmin->password,
            status: $eloquentSuperAdmin->status,
        );
    }
}
