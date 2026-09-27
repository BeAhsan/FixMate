<?php

namespace App\Infrastructure\IdentityAndAccess;

use App\Domain\IdentityAndAccess\Services\SessionRevoker;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;
use Illuminate\Database\Eloquent\Model;
use InvalidArgumentException;

/**
 * Revokes sessions through Sanctum.
 *
 * The one place that knows a session is a row in `personal_access_tokens`. The
 * interface it implements lives in the domain and names an account type and an
 * identifier, because that is how the sessions are keyed; the translation from
 * those to a tokenable model happens here and nowhere else.
 */
class SanctumSessionRevoker implements SessionRevoker
{
    public function revokeAllFor(AccountType $type, int $accountId): void
    {
        $this->modelFor($type, $accountId)->tokens()->delete();
    }

    public function revokeAllExcept(AccountType $type, int $accountId, ?string $exceptTokenId): void
    {
        $model = $this->modelFor($type, $accountId);

        if ($exceptTokenId === null) {
            $model->tokens()->delete();

            return;
        }

        // Scoped by the tokenable as well as the token, so a token id from another
        // account cannot be used to spare this account's session by accident. The
        // comparison is on the id column and not on the plain-text half, which is
        // never stored.
        $model
            ->tokens()
            ->where('id', '!=', $exceptTokenId)
            ->delete();
    }

    /**
     * The tokenable model for an account type and identifier.
     *
     * Throws rather than returning null. A revocation that silently did nothing
     * because the account could not be found would leave every session alive after
     * a password change, and the caller would have no way to know: the password
     * would be changed, the old sessions would still work, and the person would
     * believe they had signed everything out.
     */
    private function modelFor(AccountType $type, int $accountId): Model
    {
        /** @var class-string<Model> $modelClass */
        $modelClass = AccountTypeRegistry::modelFor($type);

        $model = $modelClass::query()->find($accountId);

        if (! $model) {
            throw new InvalidArgumentException(
                "No {$type->label()} account with the identifier {$accountId} exists, so its "
                .'sessions cannot be revoked.'
            );
        }

        return $model;
    }
}
