<?php

use App\Http\Middleware\EnsureAccountCan;
use App\Http\Middleware\EnsurePasswordChanged;
use App\Http\Middleware\EnsureSessionCan;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            // The authorisation control. Named rather than applied as a class so
            // that a route states its access rule in the route file, next to the
            // path it protects, where a reviewer can read the two together:
            // `account.can:admins` says who may knock, and
            // `account.can:super_admins,accounts:read` says who may knock *and*
            // what they must be able to do.
            'account.can' => EnsureAccountCan::class,
            'password.changed' => EnsurePasswordChanged::class,

            // The mirror of the above, for the renewal route. A renewal token
            // is refused by `account.can` and allowed only by this, so the two
            // together are the whole of what a renewal token can reach.
            'session.can' => EnsureSessionCan::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // This application serves JSON and never HTML, so every error is
        // rendered as JSON regardless of the request's Accept header. Without
        // this, a plain browser request to an unknown path gets Laravel's HTML
        // error page, which is the one thing a JSON API must not do.
        //
        // The health endpoint is unaffected: it is a normal route that returns
        // its own response, and does not pass through this handler.
        $exceptions->shouldRenderJsonWhen(fn (): bool => true);

        // A refusal is a decision, not a malfunction, so it is rendered as one.
        //
        // Without this, a 403 takes the framework's generic exception path, which
        // in debug mode appends the exception class, the file, the line and a
        // full stack trace to the body. That is inconsistent with the two
        // refusals either side of it: the sign-in and throttle refusals were
        // built by hand to carry exactly the keys they mean to, and a 401 from
        // the framework's own authentication handler carries only a `message`. So
        // this one refusal had a third shape, the widest of them, and it described
        // the deployment's filesystem to whoever had been refused.
        //
        // Matched on the HTTP exception interface rather than on
        // `AuthorizationException`, because the handler converts that into an
        // `AccessDeniedHttpException` before any callback is consulted — a
        // callback typed to the exception the middleware threw would simply never
        // run, and the shape would depend on the debug setting.
        $exceptions->render(function (HttpExceptionInterface $e, Request $request) {
            if ($e->getStatusCode() !== 403 || ! $request->is('api/*')) {
                return null;
            }

            return response()->json(
                ['message' => $e->getMessage() !== '' ? $e->getMessage() : 'This action is unauthorized.'],
                403,
                $e->getHeaders(),
            );
        });
    })->create();
