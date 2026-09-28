/**
 * What to show a person who could not sign in.
 *
 * The back end's message is used verbatim whenever there is one, and that is not
 * politeness. The sign-in refusal is worded so that it names neither which part
 * of the credentials was wrong nor whether the address exists — that
 * indistinguishability is the back end's most careful property — so any second
 * wording written here would be a second chance to get subtly wrong, in the one
 * place where being wrong leaks whether an address holds an account.
 *
 * The two rewritten cases are the two where the back end said nothing useful:
 *
 *   - `network`, meaning no response arrived at all. Without a sentence the
 *     screen would be blank, which is the single outcome that tells a person
 *     nothing about whether to retry.
 *   - `contract`, meaning a response arrived and no longer fitted the shape the
 *     client declares. That is a broken contract rather than a wrong password,
 *     and telling someone to check their password would send them away from the
 *     actual fault.
 *
 * `ApiError` is imported from the client package rather than from an application
 * module, so this file is loadable without a back end address and testable
 * without rendering a form.
 */
export interface SignInFailure {
    message: string
    /** The back end's per-field messages, when it sent any. */
    fields?: Record<string, string[]>
}

export function describeSignInFailure(error: unknown): SignInFailure {
    if (!isApiError(error)) {
        return { message: 'Something went wrong signing in. Please try again.' }
    }

    switch (error.kind) {
        case 'network':
            return {
                message:
                    'Could not reach the FixMate service. Check your connection and try again.',
            }

        case 'contract':
            return {
                message:
                    'The service replied in a shape this application does not recognise, so the sign-in could not be completed.',
            }

        default:
            return { message: error.message, fields: error.fields }
    }
}

/**
 * The shape this module needs from an error, checked structurally.
 *
 * `instanceof ApiError` would need the class imported as a *value*, and doing
 * that from a package that an application also imports risks two copies of the
 * module — under a bundler that would make every check here silently false, and
 * every failure would be reported as the generic "something went wrong". A
 * structural check cannot drift that way, and it is the only check that keeps
 * working if the error is ever re-thrown across a boundary.
 */
/**
 * A failure from the change-password screen.
 *
 * The same shape as {@link SignInFailure} and for the same reasons, but it is a
 * separate type rather than a shared one because the two screens have different
 * jobs: this one's failures are almost always per-field, and the caller needs to
 * know a message exists at all before it decides whether to show one beside a
 * field or on its own.
 */
export interface PasswordChangeFailure {
    message: string
    /** The back end's per-field messages, when it sent any. */
    fields?: Record<string, string[]>
}

/**
 * What to show a person whose password change was refused.
 *
 * The back end's wording is passed through verbatim, and the reason is the same
 * one that governs the sign-in refusal: a second wording written here is a second
 * chance to leak which check failed, and this endpoint's per-field messages are
 * precise on purpose. A wrong current password and a new password that is
 * unchanged are different problems with different fixes, and the back end names
 * the field each belongs to.
 *
 * The two rewritten cases are the two where the back end said nothing useful, and
 * they are the same two as in {@link describeSignInFailure}: no response at all,
 * and a response that no longer matches the declared shape. In both, the problem
 * is not the password.
 */
export function describePasswordChangeFailure(error: unknown): PasswordChangeFailure {
    if (!isApiError(error)) {
        return { message: 'Something went wrong changing your password. Please try again.' }
    }

    switch (error.kind) {
        case 'network':
            return {
                message: 'Could not reach the FixMate service. Check your connection and try again.',
            }

        case 'contract':
            return {
                message:
                    'The service replied in a shape this application does not recognise, so the password could not be changed.',
            }

        case 'unauthenticated':
            // A 401 here means the session went away between the form being shown
            // and the change being submitted — an expired access token, or a
            // sign-out in another tab. Every other route in the application would
            // fail the same way, so the redirect to sign-in is already in place and
            // this only has to not be alarming.
            return { message: 'Your session has ended. Please sign in again.' }

        default:
            return { message: error.message, fields: error.fields }
    }
}

function isApiError(error: unknown): error is {
    kind: string
    message: string
    fields: Record<string, string[]>
} {
    return (
        typeof error === 'object' &&
        error !== null &&
        typeof (error as { kind?: unknown }).kind === 'string' &&
        typeof (error as { message?: unknown }).message === 'string'
    )
}
