<?php

use App\Application\IdentityAndAccess\Exceptions\AccountNotFound;
use App\Application\IdentityAndAccess\Exceptions\NotPermitted;
use App\Http\Errors\ErrorEnvelope;
use App\Http\Middleware\AuthorisedFor;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Symfony\Component\HttpFoundation\Response;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // The platform's own authorisation control, aliased rather than named out
        // in full on every route. See AuthorisedFor for why a route states its
        // store and its ability as middleware parameters.
        $middleware->alias([
            'authorised' => AuthorisedFor::class,
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

        // Every refusal the platform composes itself, written in the envelope.
        //
        // These two are registered by class rather than composed at the call
        // site, so the wording, the machine-readable code and the status of each
        // refusal live in the exception's named constructor and nowhere else. A
        // front end branches on `code`, and a code spelled at a call site is a
        // code that is one typo away from a branch nobody exercises.
        //
        // Each callback's first parameter is typed rather than a `match` over
        // every exception in the hierarchy, because the framework dispatches on
        // that type — so declaring it here is what binds the refusal to its
        // exception rather than to a string that could be spelled wrongly.
        $exceptions->render(fn (NotPermitted $e): Response => ErrorEnvelope::response(
            code: $e->errorCode,
            message: $e->getMessage(),
            status: $e->status,
            details: $e->details,
        ));

        $exceptions->render(fn (AccountNotFound $e): Response => ErrorEnvelope::response(
            code: AccountNotFound::CODE,
            message: $e->getMessage(),
            status: 404,
            details: $e->details,
        ));

        // Put every *other* error into the envelope, if it is not in it already.
        //
        // This is the hook that makes "one consistent error envelope" a property
        // of the platform rather than a promise, and it is on `respond` rather
        // than on each individual exception for that reason: the framework's own
        // refusals — an unauthenticated request, a validation failure, a
        // throttled one, a 404, a 500 — are composed deep in code nobody here
        // writes, and wrapping each one at its source is a list that has to be
        // kept in step with the framework. Wrapping the output instead means a
        // new failure mode cannot produce a new shape by being added somewhere
        // nobody remembered, because enveloping is the default and opting out is
        // the thing that would have to be written deliberately.
        //
        // It is also the last word, which is deliberate. The two refusals above
        // arrive already complete and are returned untouched, and anything the
        // framework composed in debug — a file path, a call stack — is replaced
        // rather than merged. A body's shape that depends on the environment is
        // not a consistent shape, and the trace is a map of the deployment for
        // anyone who would rather not have one.
        $exceptions->respond(
            fn (Response $response): Response => ErrorEnvelope::normalise($response),
        );
    })->create();
