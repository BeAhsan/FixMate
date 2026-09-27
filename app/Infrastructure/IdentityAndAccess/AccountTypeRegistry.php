<?php

namespace App\Infrastructure\IdentityAndAccess;

use App\Domain\IdentityAndAccess\ValueObjects\AccountType;
use App\Models\Admin;
use App\Models\SuperAdmin;
use App\Models\User;
use App\Models\Worker;
use Illuminate\Database\Eloquent\Model;
use InvalidArgumentException;

/**
 * Which Eloquent model stands for which account type.
 *
 * One map, read by everything that has to go from a model to a store. It lives
 * here, in Infrastructure, because the domain must not know that Eloquent
 * models exist — and the two consumers are a password reset URL builder and the
 * "who am I" endpoint, which would otherwise each carry their own copy of the
 * same four lines. A fifth account type would be one entry here instead of one
 * per consumer, and a consumer that forgot would be a reset link on the wrong
 * application's page, which looks like a working flow.
 */
final class AccountTypeRegistry
{
    /**
     * @var array<class-string<Model>, AccountType>
     */
    private const ACCOUNT_TYPES = [
        User::class => AccountType::User,
        Worker::class => AccountType::Worker,
        Admin::class => AccountType::Admin,
        SuperAdmin::class => AccountType::SuperAdmin,
    ];

    /**
     * The account type a model stands for.
     *
     * Throws rather than returning null or a default. Every caller here is
     * about to address something to a store — a reset link's page, a token's
     * account type — and a wrong guess produces output that looks entirely
     * correct while belonging to the wrong person. An unmapped model is a bug
     * that should stop the request, not a value to paper over.
     */
    public static function for(Model $model): AccountType
    {
        return self::ACCOUNT_TYPES[$model::class] ?? throw new InvalidArgumentException(
            'No account type owns '.$model::class.'. Add it to AccountTypeRegistry, or it has no store.'
        );
    }

    /**
     * The model that stands for an account type.
     */
    public static function modelFor(AccountType $type): string
    {
        $model = array_search($type, self::ACCOUNT_TYPES, true);

        return $model === false
            ? throw new InvalidArgumentException("No model stands for {$type->value}.")
            : $model;
    }

    /**
     * Every model that can own a token, for the places that must consider all of
     * them — a morph map, a test sweeping every store.
     *
     * @return list<class-string<Model>>
     */
    public static function models(): array
    {
        return array_keys(self::ACCOUNT_TYPES);
    }
}
