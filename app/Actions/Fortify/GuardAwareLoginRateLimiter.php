<?php

namespace App\Actions\Fortify;

use Illuminate\Cache\RateLimiter;
use Illuminate\Http\Request;
use Laravel\Fortify\LoginRateLimiter as BaseLoginRateLimiter;

/**
 * Guard-aware login rate limiter that includes the guard name in the throttle key.
 * This ensures each guard (users, workers, admins, super_admins) has its own
 * rate limit bucket, preventing cross-guard lockout.
 */
class GuardAwareLoginRateLimiter extends BaseLoginRateLimiter
{
    public function __construct(
        RateLimiter $limiter,
        private string $guard,
    ) {
        parent::__construct($limiter);
    }

    /**
     * Get the throttle key for the given request, prefixed with the guard name.
     */
    protected function throttleKey(Request $request): string
    {
        return $this->guard.'|'.parent::throttleKey($request);
    }
}
