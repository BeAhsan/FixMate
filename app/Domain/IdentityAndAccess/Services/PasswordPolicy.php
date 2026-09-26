<?php

namespace App\Domain\IdentityAndAccess\Services;

use Illuminate\Validation\Rules\Password;

/**
 * What counts as an acceptable password.
 *
 * One place, because a reset is not the only way a password arrives and the
 * rule must not depend on which door it came through: the same twelve
 * characters of policy apply to every one of the four account types, and the
 * same `Password` rule object is what checks them.
 *
 * Deliberately no `uncompromised()`. It asks Have I Been Pwned over HTTP, which
 * means a password reset depends on a third party being up, and a person locked
 * out of their own account because an external service was unreachable is a
 * worse outcome than a weak-but-memorable password. The strength rules below
 * are what the platform promises; adding the pwned check is a decision, not a
 * default to inherit.
 */
final class PasswordPolicy
{
    /**
     * The shortest password the platform accepts.
     *
     * Length is the rule that actually resists guessing, so it carries the
     * weight and the other three only rule out the passwords that are short and
     * predictable at the same time.
     */
    public const MIN_LENGTH = 12;

    /**
     * The validation rules a submitted password must satisfy.
     *
     * Returned rather than applied, so the rules can be attached to a request
     * (`'password' => [...PasswordPolicy::rules()]`) and be checked before the
     * reset is performed. That ordering is the point: a password that would be
     * refused has to be refused *before* the token is redeemed, or a person
     * would spend a single-use link on a submission that was never going to be
     * accepted.
     *
     * @return list<Password>
     */
    public static function rules(): array
    {
        return [
            Password::min(self::MIN_LENGTH)->letters()->mixedCase()->numbers()->symbols(),
        ];
    }
}
