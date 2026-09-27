<?php

namespace App\Providers;

use App\Infrastructure\IdentityAndAccess\AccountTypeRegistry;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\ServiceProvider;

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
     * @deprecated Read it from AccountTypeRegistry instead. This map is kept as a
     *             pointer so that the two lists cannot drift: the registry is now
     *             the only copy, and this is where the password reset flow reads
     *             it from.
     *
     * @var array<class-string<Model>, AccountType>
     */
    private const ACCOUNT_TYPES = [];

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
            $accountType = AccountTypeRegistry::for($notifiable);

            $url = (string) config('password-reset.urls.'.$accountType->broker());

            return $url.'?'.http_build_query([
                'token' => $token,
                'email' => $notifiable->getEmailForPasswordReset(),
            ]);
        });
    }
}
