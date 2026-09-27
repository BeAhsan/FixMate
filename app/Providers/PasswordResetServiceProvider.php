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
 *
 * This provider used to carry its own map from model to account type. It does
 * not any more: {@see AccountTypeRegistry} is the only copy, because the
 * password reset URL and the "who am I" endpoint both need the same answer and
 * two lists would eventually disagree — and they would disagree by putting a
 * working reset link on the wrong application's page, which looks like a working
 * flow rather than like a bug.
 */
class PasswordResetServiceProvider extends ServiceProvider
{
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
