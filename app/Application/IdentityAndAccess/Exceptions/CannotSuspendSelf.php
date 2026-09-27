<?php

namespace App\Application\IdentityAndAccess\Exceptions;

use RuntimeException;

/**
 * An administrator tried to suspend the account they are signed in with.
 *
 * Its own exception rather than a 403, because the caller *is* permitted to
 * suspend accounts — they hold the ability and passed every guard. What they
 * attempted is the one thing that ability does not extend to. Refusing it with the
 * same answer as "you may not do this at all" would be a lie about why, and the
 * message is what tells a person that they have locked themselves out of their own
 * account before they do it.
 *
 * The wording is deliberately about the consequence and not about the rule. "You
 * cannot suspend your own account" invites an argument; "another administrator
 * can restore it, and you will not be able to" is the thing the person needs to
 * hear before they click.
 */
final class CannotSuspendSelf extends RuntimeException
{
    public const MESSAGE = 'You cannot suspend the account you are signed in with. Ask another super administrator to do it, or sign in as someone else first.';
}
