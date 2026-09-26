<?php

namespace App\Providers;

use App\Domain\IdentityAndAccess\ValueObjects\AccountType;
use App\Models\Admin;
use App\Models\SuperAdmin;
use App\Models\User;
use App\Models\Worker;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\ServiceProvider;
use InvalidArgumentException;

/**
 * Teaches the password reset notification where the four reset pages live.
 *
 * The core notification builds its button by calling `route('password.reset')`,
 * a route that exists in an application with web pages and does not exist in
 * this one. Left alone it would raise a routing exception the first time anyone
 * used the flow, in production, having passed every test that faked the
 * notification outright. So the URL is built here instead, from configuration,
 * and the account type is read off the notifiable — which is the only thing the
 * callback is given that says which store the link belongs to.
 */
class PasswordResetServiceProvider extends ServiceProvider
{
    /**
     * The model behind each account type.
     *
     * A map rather than a chain of `instanceof` checks in the callback, because
     * it is the same list the account types come from and reading the two side
     * by side is how a fifth store would be noticed. An unmapped model is a hard
     * error rather than a default: guessing a store here would put a real reset
     * link on the wrong application's page, and a working recovery flow for the
     * wrong account is a failure that looks like a success.
     *
     * @var array<class-string<Model>, AccountType>
     */
    private const ACCOUNT_TYPES = [
        User::class => AccountType::User,
        Worker::class => AccountType::Worker,
        Admin::class => AccountType::Admin,
        SuperAdmin::class => AccountType::SuperAdmin,
    ];

    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        ResetPassword::createUrlUsing(function (Model $notifiable, string $token): string {
            $accountType = self::ACCOUNT_TYPES[$notifiable::class]
                ?? throw new InvalidArgumentException(
                    'No account type owns '.$notifiable::class.', so no password reset link can be addressed to it.'
                );

            $url = (string) config('password-reset.urls.'.$accountType->broker());

            return $url.'?'.http_build_query([
                'token' => $token,
                'email' => $notifiable->getEmailForPasswordReset(),
            ]);
        });
    }
}
