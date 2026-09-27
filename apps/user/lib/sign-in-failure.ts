import { ApiError } from '@fixmate/api-client'

/**
 * What to show a person who could not sign in.
 *
 * `ApiError` is imported from the client package rather than from `lib/api`,
 * and that is not a detail. `lib/api` builds the client at module load and
 * throws when `NEXT_PUBLIC_API_URL` is unset, so importing it here would make
 * this module — which decides a sentence to show and nothing else — impossible
 * to load without a back end address. It also could not be tested. The error
 * class belongs to the package that throws it, and `instanceof` still matches,
 * because it is the same class object.
 *
 * `fields` carries the back end's per-field messages when it sent any. Nothing
 * reads it yet — this application's form has no per-field error slots — but it
 * is part of the returned value rather than dropped, so the next screen to want
 * it does not have to re-derive it from the error.
 */
export interface SignInFailure {
    message: string
    fields?: Record<string, string[]>
}

/**
 * Turn a rejection into something worth showing.
 *
 * The back end's message is used verbatim whenever there is one, and that is
 * not politeness. The sign-in refusal is worded so that it names neither which
 * part of the credentials was wrong nor whether the address exists — that
 * indistinguishability is ticket 04's whole subject — so any second wording
 * written here would be a second thing to get subtly wrong, in the one place
 * where being wrong leaks whether an address holds an account.
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
 */
export function describeSignInFailure(error: unknown): SignInFailure {
    if (!(error instanceof ApiError)) {
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
