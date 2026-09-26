<?php

namespace App\Application\IdentityAndAccess\Exceptions;

use RuntimeException;

/**
 * Base type for every reason a sign-in attempt is refused.
 *
 * A refusal is an expected outcome of a sign-in, not a fault, so it is modelled
 * as its own exception rather than allowed to surface as a framework error. The
 * application layer throws it and the HTTP layer decides what the person is
 * told; the domain layer never sees it.
 */
abstract class SignInRefused extends RuntimeException {}
