<?php

namespace App\Infrastructure\IdentityAndAccess\Repositories;

use App\Domain\IdentityAndAccess\Entities\Worker;
use App\Domain\IdentityAndAccess\Repositories\WorkerRepository;
use App\Domain\IdentityAndAccess\ValueObjects\Email;
use App\Domain\IdentityAndAccess\ValueObjects\UserId;
use App\Models\Worker as EloquentWorker;
use Illuminate\Support\Str;

/**
 * Eloquent implementation of WorkerRepository.
 * This is the only layer that knows about Eloquent/database.
 *
 * It queries the workers table and nothing else - there is no fallback to
 * users. That is the isolation property, and it is structural here rather than
 * a check that could be forgotten later.
 */
class EloquentWorkerRepository implements WorkerRepository
{
    public function findByEmail(Email $email): ?Worker
    {
        // Case-insensitive email lookup
        $eloquentWorker = EloquentWorker::whereRaw('LOWER(email) = ?', [Str::lower($email->value)])->first();

        if (! $eloquentWorker) {
            return null;
        }

        return $this->toEntity($eloquentWorker);
    }

    public function findById(UserId $id): ?Worker
    {
        $eloquentWorker = EloquentWorker::find($id->value);

        if (! $eloquentWorker) {
            return null;
        }

        return $this->toEntity($eloquentWorker);
    }

    public function save(Worker $worker): Worker
    {
        $eloquentWorker = EloquentWorker::updateOrCreate(
            ['id' => $worker->id->value],
            [
                'name' => $worker->name,
                'email' => $worker->email->value,
                'password' => $worker->passwordHash,
                'status' => $worker->status->value,
            ]
        );

        return $this->toEntity($eloquentWorker);
    }

    private function toEntity(EloquentWorker $eloquentWorker): Worker
    {
        return Worker::fromPersistence(
            id: $eloquentWorker->id,
            name: $eloquentWorker->name,
            email: $eloquentWorker->email,
            passwordHash: $eloquentWorker->password,
            status: $eloquentWorker->status,
        );
    }
}
