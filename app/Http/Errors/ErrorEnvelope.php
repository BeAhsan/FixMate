<?php

namespace App\Http\Errors;

use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

/**
 * The one shape every error on this API is written in.
 *
 * The spec asks for "a single consistent error envelope, because four
 * applications handling four error shapes is the kind of thing that becomes four
 * bugs". Before this existed the platform was already answering with four: a
 * validation failure carried `errors`, an unauthenticated request carried
 * `message` alone, a throttled request carried `message` and `retry_after`, and
 * a refusal composed by a controller could carry whatever that controller felt
 * like. Four front ends would each have grown a handler for all four.
 *
 * Four keys, always all four, in this order:
 *
 *   message  one sentence a person can read. The only field anyone should have
 *            to display, and the one that is allowed to be reworded freely.
 *   code     a stable machine-readable identifier, so a front end branches on
 *            the kind of failure instead of matching English. This is the field
 *            that makes the envelope worth having; `message` alone cannot be
 *            matched against without breaking on a copy edit.
 *   errors   field-keyed messages, for a form. Empty when the failure is not
 *            about a field.
 *   details  structured facts a client can act on — the account type an endpoint
 *            expects, the ability it requires, how long to wait. Always present
 *            and often empty, because a key that is sometimes missing is a key
 *            every client ends up writing `?? []` around.
 *
 * "Always present and often empty" is the whole design constraint. An envelope
 * that varied its keys by failure is not one shape, it is four shapes with a
 * common prefix.
 *
 * Nothing here varies per request beyond the message itself. No request id, no
 * timestamp, no path: two refusals for the same reason must be byte-identical,
 * because the sign-in tests compare responses that way to prove that an unknown
 * address and a wrong password are indistinguishable, and a correlation id in
 * the body would be one more thing that has to stay out.
 */
final class ErrorEnvelope
{
    /**
     * The keys, in the order they are written.
     *
     * Asserted directly by the feature tests. The order is not cosmetic: it is
     * what lets a test say "the body is exactly these four keys and nothing
     * else", which is the only way to catch an error path that starts leaking a
     * stack trace or a file path.
     */
    public const KEYS = ['message', 'code', 'errors', 'details'];

    /**
     * The code for a failure that arrived without one of its own.
     *
     * Every status the API produces on its own has a fixed meaning, so the
     * mapping is a table rather than a guess. The `422` and `429` entries are
     * the two that Laravel itself raises, and they are here so that a
     * framework-raised refusal and a refusal this application composes
     * identically are indistinguishable to a client.
     */
    private const CODES = [
        400 => 'bad_request',
        401 => 'unauthenticated',
        403 => 'forbidden',
        404 => 'not_found',
        405 => 'method_not_allowed',
        409 => 'conflict',
        419 => 'page_expired',
        422 => 'validation_failed',
        429 => 'too_many_requests',
        500 => 'server_error',
    ];

    private function __construct() {}

    /**
     * The body, with the keys in their fixed order.
     *
     * The two maps are cast to objects on the way out so that an empty one
     * encodes as `{}` rather than `[]`. A field map that is sometimes an array
     * and sometimes an object is a type a client has to branch on, and the point
     * of the cast is that `errors.email` and `details.required_ability` mean the
     * same thing whether or not anything is in them.
     *
     * @param  array<string, list<string>>  $errors
     * @param  array<string, mixed>  $details
     * @return array{message: string, code: string, errors: object, details: object}
     */
    public static function body(string $code, string $message, array $errors = [], array $details = []): array
    {
        return [
            'message' => $message,
            'code' => $code,
            'errors' => (object) $errors,
            'details' => (object) $details,
        ];
    }

    /**
     * A complete error response, envelope and all.
     *
     * @param  array<string, list<string>>  $errors
     * @param  array<string, mixed>  $details
     * @param  array<string, mixed>  $headers
     */
    public static function response(
        string $code,
        string $message,
        int $status,
        array $errors = [],
        array $details = [],
        array $headers = [],
    ): JsonResponse {
        return new JsonResponse(
            self::body($code, $message, $errors, $details),
            $status,
            $headers,
        );
    }

    /**
     * Put a rendered error into the envelope, if it is not in it already.
     *
     * Wired to the exception handler's `respond` hook, so it sees every response
     * produced by rendering an exception and nothing else — not a successful
     * response, and not the health check's HTML. That is the mechanism that
     * makes the guarantee total: a new failure mode cannot produce a new shape
     * by being added somewhere nobody remembered to wrap, because wrapping is
     * the default and opting out is the thing that would have to be written
     * deliberately.
     *
     * Being idempotent is what lets the two hooks coexist. A refusal this
     * application composes arrives already carrying all four keys and is
     * returned untouched; anything the framework composed is filled in, keeping
     * whatever `message` and `errors` it already had, because those are the
     * parts Laravel got right.
     *
     * A body that is not a JSON object is left alone. There is nothing sensible
     * to do to one, and the honest thing is not to invent an envelope around a
     * string and call the result consistent.
     */
    public static function normalise(Response $response): Response
    {
        if ($response->getStatusCode() < 400) {
            return $response;
        }

        $body = json_decode((string) $response->getContent(), true);

        if (! is_array($body) || self::isEnvelope($body)) {
            return $response;
        }

        $status = $response->getStatusCode();

        return self::response(
            code: is_string($body['code'] ?? null) ? $body['code'] : (self::CODES[$status] ?? 'error'),
            message: is_string($body['message'] ?? null) ? $body['message'] : Response::$statusTexts[$status] ?? 'Request failed.',
            status: $status,
            errors: is_array($body['errors'] ?? null) ? $body['errors'] : [],
            details: is_array($body['details'] ?? null) ? $body['details'] : [],
            headers: $response->headers->all(),
        );
    }

    /**
     * Whether a decoded body is already the envelope.
     *
     * All four keys, because that is what the envelope is. Checking for one key
     * would let a partial body through and be silently completed, which is how
     * a stray `code` added by something else would end up overriding the
     * table's answer.
     *
     * @param  array<mixed>  $body
     */
    private static function isEnvelope(array $body): bool
    {
        foreach (self::KEYS as $key) {
            if (! array_key_exists($key, $body)) {
                return false;
            }
        }

        return true;
    }
}
