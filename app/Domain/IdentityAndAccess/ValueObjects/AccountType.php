<?php

namespace App\Domain\IdentityAndAccess\ValueObjects;

/**
 * The four account types, and the credential store each one owns.
 *
 * This is the single place in the platform where an account type and a password
 * broker are related. It exists because of the one security property that a
 * mistake in it would not announce: a password reset has to change exactly the
 * account it was requested for, and that account is chosen by *which door the
 * request arrived at*, never by the address. A person may hold an account in
 * several stores under one address, so "which of the four accounts does this
 * reset target" cannot be inferred from the address — it is decided here, by the
 * controller naming the case that belongs to its route.
 *
 * The enum's value is the name of the broker in `config/auth.php`, which is also
 * the guard and provider name. That is deliberate: the broker is the framework's
 * name for a credential store, the provider behind it is bound to exactly one
 * model, and the reset-token table behind that is a table per store. So a broker
 * name is not a label for an account type, it is the whole of that account
 * type's credential machinery, and selecting one selects all of it.
 *
 * Kept free of framework types on purpose — the account type is a domain
 * concept, and the mapping from it to a concrete Eloquent model belongs to the
 * provider that composes the two (`PasswordResetServiceProvider`).
 */
enum AccountType: string
{
    case User = 'users';
    case Worker = 'workers';
    case Admin = 'admins';
    case SuperAdmin = 'super_admins';

    /**
     * Every account type, in the order the four applications are declared.
     *
     * @return list<self>
     */
    public static function all(): array
    {
        return [self::User, self::Worker, self::Admin, self::SuperAdmin];
    }

    /**
     * The broker that owns this account type's reset tokens.
     *
     * Selected explicitly, by the case the route's controller names, and never
     * by mutating `config('auth.passwords')` at runtime: rewriting that array
     * would change which table every later caller reads, so a single mis-sorted
     * controller would move the whole platform's reset tokens rather than one
     * request's.
     */
    public function broker(): string
    {
        return $this->value;
    }

    /**
     * The abilities a token issued for this account type carries.
     *
     * The one place abilities are decided. Previously each of the four sign-in
     * use cases carried its own literal, which meant the platform's entire
     * access model was four strings in four files with nothing to compare them
     * against — a new account type would have added a fifth, and "an
     * administrator cannot do what a super administrator can" would have been
     * a convention rather than a fact.
     *
     * Note what an administrator does *not* get: the `accounts:*` family. That
     * is the separation the spec asks for, and it is expressed by their absence
     * here rather than by a check somewhere that a new account type could forget
     * to pass through.
     *
     * @return list<string>
     */
    public function abilities(): array
    {
        return match ($this) {
            self::User => ["{$this->value}:*"],
            self::Worker => ["{$this->value}:*"],
            self::Admin => ["{$this->value}:*"],
            // The wildcard alone. It already subsumes the `accounts:*` family,
            // so listing those names as well would be a second source of truth
            // for the same reach: one that a test could read as authoritative
            // and that a future rename would silently contradict. The names stay
            // in Ability, where the middleware that requires them looks, and the
            // wildcard is what carries them.
            self::SuperAdmin => [Ability::WILDCARD],
        };
    }

    /**
     * Whether a token for this account type may perform an ability.
     *
     * The wildcard matches everything, exactly as Sanctum's own `*` does, so
     * this agrees with what the middleware will actually decide rather than
     * approximating it.
     *
     * @param  list<string>  $abilities
     */
    public function may(array $abilities, string $ability): bool
    {
        if (in_array(Ability::WILDCARD, $abilities, true)) {
            return true;
        }

        return in_array($ability, $abilities, true);
    }
}
