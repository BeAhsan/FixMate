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
            // The registry, not a map held here. It was the only place a second
            // copy of the model-to-store mapping lived, and it was an empty one
            // — a constant annotated as deprecated and read by nothing, left
            // behind as a pointer to a decision that had since been made properly.
            // A pointer to code that no longer calls it is a claim that two lists
            // are kept in step, and there was only one list.
            $accountType = AccountTypeRegistry::for($notifiable);

            $url = (string) config('password-reset.urls.'.$accountType->broker());

            return $url.'?'.http_build_query([
                'token' => $token,
                'email' => $notifiable->getEmailForPasswordReset(),
            ]);
        });
    }
}
