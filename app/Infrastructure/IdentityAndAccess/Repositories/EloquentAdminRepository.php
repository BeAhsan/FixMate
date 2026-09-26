<?php

namespace App\Infrastructure\IdentityAndAccess\Repositories;

use App\Domain\IdentityAndAccess\Entities\Admin;
use App\Domain\IdentityAndAccess\Repositories\AdminRepository;
use App\Domain\IdentityAndAccess\ValueObjects\Email;
use App\Domain\IdentityAndAccess\ValueObjects\UserId;
use App\Models\Admin as EloquentAdmin;
use Illuminate\Support\Str;

/**
 * Eloquent implementation of AdminRepository.
 * This is the only layer that knows about Eloquent/database.
 *
 * It queries the admins table and nothing else - no fallback to users, to
 * workers, or to super_admins. That is the isolation property, and it is
 * structural here rather than a check that could be forgotten later. The
 * absence of a super_admins fallback is the same property applied inside staff:
 * a super administrator's address is not an administrator's address, and
 * promoting someone means creating a record in the other table.
 */
class EloquentAdminRepository implements AdminRepository
{
    public function findByEmail(Email $email): ?Admin
    {
        // Case-insensitive email lookup
        $eloquentAdmin = EloquentAdmin::whereRaw('LOWER(email) = ?', [Str::lower($email->value)])->first();

        if (! $eloquentAdmin) {
            return null;
        }

        return $this->toEntity($eloquentAdmin);
    }

    public function findById(UserId $id): ?Admin
    {
        $eloquentAdmin = EloquentAdmin::find($id->value);

        if (! $eloquentAdmin) {
            return null;
        }

        return $this->toEntity($eloquentAdmin);
    }

    public function save(Admin $admin): Admin
    {
        $eloquentAdmin = EloquentAdmin::updateOrCreate(
            ['id' => $admin->id->value],
            [
                'name' => $admin->name,
                'email' => $admin->email->value,
                'password' => $admin->passwordHash,
                'status' => $admin->status->value,
            ]
        );

        return $this->toEntity($eloquentAdmin);
    }

    private function toEntity(EloquentAdmin $eloquentAdmin): Admin
    {
        return Admin::fromPersistence(
            id: $eloquentAdmin->id,
            name: $eloquentAdmin->name,
            email: $eloquentAdmin->email,
            passwordHash: $eloquentAdmin->password,
            status: $eloquentAdmin->status,
        );
    }
}
