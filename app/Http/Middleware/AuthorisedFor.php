<?php

namespace App\Http\Middleware;

use App\Application\IdentityAndAccess\Exceptions\NotPermitted;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;
use App\Infrastructure\IdentityAndAccess\AccountTypeRegistry;
use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use LogicException;
use Symfony\Component\HttpFoundation\Response;

/**
 * Refuses a request whose token does not belong to the application it called.
 *
 * This is the control the whole ticket is about, and it is deliberately the
 * only place the decision is made. The user interfaces hide navigation a person
 * has no use for, which is a courtesy; this is the thing that stands when
 * somebody opens a browser console and calls the endpoint anyway. An application
 * that only ever navigates its way around what it may do is protected by its own
 * front end, and a front end is a thing a person can change.
 *
 * Both halves of the rule are checked, in this order:
 *
 *   1. **The account is the type the route belongs to.** The platform has four
 *      credential stores and an endpoint belongs to exactly one of them. A token
 *      from the users store is not an administrator with fewer rights; it is a
 *      different kind of account, minted by a different door, and it carries
 *      abilities that were decided for a different application. Checking this
 *      first also gives the more actionable message: "you are in the wrong
 *      application" has a fix, "your token is missing an ability" does not.
 *
 *   2. **The token carries the ability the route requires.** Checked against the
 *      token's own claim list rather than against the account type's list, which
 *      is the difference between the two being separate checks. Re-deriving the
 *      abilities here from the account type would make half 2 a restatement of
 *      half 1, and a token that had been issued with its abilities narrowed
 *      would be treated as though it had not.
 *
 * The abilities are read off the token and offered to `AccountType::may()`,
 * which is where the wildcard is honoured. Reading them with Sanctum's own
 * `tokenCan()` instead would work today and quietly stop agreeing with the
 * domain the moment a model declared a `tokenCan` override — and the domain
 * method's own documentation promises that the two agree, which is only true if
 * the domain method is the one deciding.
 *
 * Both parameters are named rather than positional, so a route states its whole
 * rule where a reader can see it: `authorised:store=admins,ability=admins:*`.
 * A route with one unnamed parameter is a route whose rule has to be read out of
 * this class to be understood, and that is how a route ends up requiring the
 * wrong ability without anyone noticing.
 *
 * A malformed declaration is a programming error and is raised as one, loudly.
 * The request still fails closed — nothing is let through either way — but a 403
 * is the wrong shape for a typo in a route file, because it looks exactly like an
 * ordinary refusal and a route that has been quietly unreachable for six months
 * is the more expensive mistake of the two.
 */
class AuthorisedFor
{
    /**
     * @param  string  ...$parameters  The `key=value` pairs the route declared,
     *                                 already split on the comma.
     *
     * @throws NotPermitted
     */
    public function handle(Request $request, Closure $next, string ...$parameters): Response
    {
        ['store' => $store, 'ability' => $ability] = $this->ruleFrom($parameters);

        $account = $request->user();

        if (! $account instanceof Model) {
            // Unreachable behind auth:sanctum, which has already answered a
            // request with nobody on it. It is here because this middleware is
            // the platform's authorisation control and an authorisation control
            // that answers "allowed" when it cannot tell who is asking has
            // failed at the one job it has. The code and status match what
            // Sanctum's own refusal produces, so the two are indistinguishable.
            throw NotPermitted::notSignedIn();
        }

        $accountType = AccountTypeRegistry::for($account);

        if ($accountType !== $store) {
            throw NotPermitted::wrongAccountType($accountType, $store);
        }

        if (! $accountType->may($this->abilitiesOf($account), $ability)) {
            throw NotPermitted::abilityRequired($ability);
        }

        return $next($request);
    }

    /**
     * The route's two halves of the rule, read from what it declared.
     *
     * Parsed by name and validated here rather than by position, so that
     * `authorised:ability=admins:*,store=admins` is the same rule as
     * `authorised:store=admins,ability=admins:*` and neither is silently the
     * wrong rule.
     *
     * @param  list<string>  $parameters
     * @return array{store: AccountType, ability: string}
     */
    private function ruleFrom(array $parameters): array
    {
        $declared = [];

        foreach ($parameters as $parameter) {
            if (! str_contains($parameter, '=')) {
                continue;
            }

            [$name, $value] = explode('=', $parameter, 2);
            $declared[strtolower(trim($name))] = trim($value);
        }

        $store = AccountType::tryFrom($declared['store'] ?? '');

        if ($store === null) {
            throw $this->declarationError($parameters, 'a store that is one of '.implode(', ', array_column(AccountType::cases(), 'value')));
        }

        if (($declared['ability'] ?? '') === '') {
            throw $this->declarationError($parameters, 'an ability');
        }

        return ['store' => $store, 'ability' => $declared['ability']];
    }

    /**
     * The claim list on the token in hand.
     *
     * Read as a plain array and passed on, so the decision is `AccountType`'s
     * alone. Note what makes this safe: `config/sanctum.php` sets the guard list
     * to empty, so a session-authenticated account can never reach here holding
     * a `TransientToken` — whose `abilities` are `['*']` and whose `can()` is
     * unconditionally true, which would make every check below this line pass.
     *
     * Called as a *method*, which is not a detail. `currentAccessToken` is an
     * ordinary method on Sanctum's `HasApiTokens`, but Eloquent's `isRelation()`
     * answers true for any attribute name that is also a method on the model, so
     * reading it as a property sends `__get` down the relationship path and
     * Laravel answers with a `LogicException` — "must return a relationship
     * instance" — for a method that never claimed to be one. So it is called,
     * and a tokenless account is the ordinary null it is designed to return.
     *
     * @return list<string>
     */
    private function abilitiesOf(Model $account): array
    {
        return array_values($account->currentAccessToken()?->abilities ?? []);
    }

    /**
     * @param  list<string>  $parameters
     */
    private function declarationError(array $parameters, string $expected): LogicException
    {
        $given = $parameters === [] ? 'nothing' : implode(', ', $parameters);

        throw new LogicException(sprintf(
            'The authorised middleware was given [%s]. Every route using it must declare %s, as in '
            ."'authorised:store=admins,ability=admins:*'.",
            $given,
            $expected,
        ));
    }
}
