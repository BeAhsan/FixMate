/**
 * One error shape for four applications.
 *
 * The back end answers every failure in one envelope — `message`, `code`,
 * `errors`, `details` — so the work here is no longer inventing a shape. It is
 * turning *every* kind of failure into one `ApiError`: a refusal the back end
 * composed, a dead network, a 500 from a container that just restarted, a
 * response that no longer matches the declared shape. Four applications that each
 * branch on the raw failure is four applications that each get it slightly wrong,
 * so nothing reaches the operations layer except an `ApiError`.
 *
 * `code` and `details` are the two that earn the envelope its keep. `kind` alone
 * is a category — a front end can say "you may not do that" — while `code` says
 * *which* refusal it is, in words the back end promises not to reword:
 * `wrong_account_type` is a person in the wrong application, and
 * `ability_required` is a person in the right one whose token lacks a function.
 * Both are 403s, so neither the status nor the message can tell them apart.
 * `details` carries what to act on: the account type an endpoint expected, the
 * ability it required, how long a throttled request has to wait.
 *
 * All of those default to `null` or `{}` because a transport failure and a
 * hand-rolled 5xx have no envelope behind them, and this type has to survive
 * those too.
 */

export type ApiErrorKind =
    /** 422, or any response carrying a Laravel `errors` map. */
    | 'validation'
    /** 401. The access token is missing, expired or revoked. */
    | 'unauthenticated'
    /** 403. */
    | 'forbidden'
    /** 404. */
    | 'notFound'
    /** 419 or 429. */
    | 'rateLimited'
    /** 5xx. */
    | 'server'
    /** The request never produced a response. */
    | 'network'
    /** A response arrived but no longer matches the declared shape. */
    | 'contract'
    /** Anything else. */
    | 'unknown';

export interface ApiErrorInit {
    kind: ApiErrorKind;
    message: string;
    status: number;
    /** The back end's stable identifier, e.g. `ability_required`. Null when the failure was not one it composed. */
    code: string | null;
    fields: Record<string, string[]>;
    /**
     * Structured facts from the back end's envelope: `required_ability`,
     * `account_type`, `retry_after`. Always an object, often empty, so a caller
     * reads `error.details.retry_after` without checking whether the key exists.
     */
    details: Record<string, unknown>;
    retryable: boolean;
    cause?: unknown;
}

/**
 * The single error type every operation rejects with.
 *
 * `status` is the HTTP status, or 0 when there was no response at all, so
 * `status === 0` is the single test for "the back end was never reached".
 */
export class ApiError extends Error implements ApiErrorInit {
    readonly kind: ApiErrorKind;
    readonly status: number;
    readonly code: string | null;
    readonly fields: Record<string, string[]>;
    readonly details: Record<string, unknown>;
    readonly retryable: boolean;
    readonly cause?: unknown;

    constructor(init: ApiErrorInit) {
        super(init.message);

        this.name = 'ApiError';
        this.kind = init.kind;
        this.status = init.status;
        this.code = init.code;
        this.fields = init.fields;
        this.details = init.details;
        this.retryable = init.retryable;
        this.cause = init.cause;
    }

    /** Whether re-authenticating could plausibly fix this. */
    get requiresAuthentication(): boolean {
        return this.kind === 'unauthenticated';
    }
}

const RETRYABLE: ReadonlySet<number> = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * The status-to-kind mapping, in one place.
 *
 * 422 is validation. 419 is what Laravel returns for a stale CSRF token, and
 * 429 for a throttled sign-in; both mean "not now", so they are treated alike
 * rather than being a fourth and fifth special case in each application.
 */
function kindForStatus(status: number, hasFieldErrors: boolean): ApiErrorKind {
    if (hasFieldErrors || status === 422) {
        return 'validation';
    }

    if (status === 401) {
        return 'unauthenticated';
    }

    if (status === 403) {
        return 'forbidden';
    }

    if (status === 404) {
        return 'notFound';
    }

    if (status === 419 || status === 429) {
        return 'rateLimited';
    }

    if (status >= 500) {
        return 'server';
    }

    return status === 0 ? 'network' : 'unknown';
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
    typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/**
 * The envelope's `details`, if the body carried one.
 *
 * Anything that is not a plain object is dropped rather than passed through, so a
 * hand-rolled error body cannot make `error.details.required_ability` a string
 * where the operations layer expects to read a value out of an object.
 */
const detailsFrom = (body: Record<string, unknown> | null): Record<string, unknown> => asRecord(body?.['details']) ?? {};

/**
 * Pull Laravel's `errors` map into a plain field-to-messages record.
 *
 * A field with a non-list value is kept as a single message, so a hand-rolled
 * error body cannot end up with `fields.email` being a string where the shape
 * says an array.
 */
function fieldsFrom(body: Record<string, unknown> | null): Record<string, string[]> {
    const errors = asRecord(body?.['errors']);

    if (errors === null) {
        return {};
    }

    const fields: Record<string, string[]> = {};

    for (const [field, messages] of Object.entries(errors)) {
        fields[field] = Array.isArray(messages) ? messages.map((message) => String(message)) : [String(messages)];
    }

    return fields;
}

const messageFrom = (body: Record<string, unknown> | null, fallback: string): string => {
    const message = body?.['message'];

    return typeof message === 'string' && message !== '' ? message : fallback;
};

/**
 * Turn a failed HTTP response into an ApiError.
 *
 * The raw body is never returned to a caller, so four applications cannot each
 * decide to read a different part of it.
 */
export function normaliseErrorResponse(status: number, body: unknown): ApiError {
    const record = asRecord(body);
    const fields = fieldsFrom(record);
    const kind = kindForStatus(status, Object.keys(fields).length > 0);
    const code = typeof record?.['code'] === 'string' ? (record['code'] as string) : null;

    return new ApiError({
        kind,
        status,
        code,
        fields,
        details: detailsFrom(record),
        retryable: RETRYABLE.has(status),
        message: messageFrom(record, defaultMessageForKind(kind, status)),
    });
}

/**
 * Turn a thrown value from `fetch` into an ApiError. There was no response, so
 * the status is 0 and the kind is `network`.
 */
export function normaliseTransportFailure(cause: unknown): ApiError {
    return new ApiError({
        kind: 'network',
        status: 0,
        code: null,
        fields: {},
        details: {},
        retryable: true,
        message: 'The back end could not be reached.',
        cause,
    });
}

/**
 * Turn a response that failed its declared shape into an ApiError.
 *
 * This is the check that makes a back-end change a clear error at the boundary
 * instead of `undefined is not an object` three components deep.
 */
export function normaliseContractFailure(path: string, expected: string, cause: unknown): ApiError {
    return new ApiError({
        kind: 'contract',
        status: 0,
        code: 'response_shape_mismatch',
        fields: {},
        details: {},
        retryable: false,
        message: `The back end returned a response that does not match ${expected} (${path}).`,
        cause,
    });
}

function defaultMessageForKind(kind: ApiErrorKind, status: number): string {
    if (kind === 'network') {
        return 'The back end could not be reached.';
    }

    if (kind === 'server') {
        return `The back end failed with status ${status}.`;
    }

    return 'The request was refused.';
}
