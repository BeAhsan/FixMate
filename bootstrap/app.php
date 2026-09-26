<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        //
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
    })->create();
