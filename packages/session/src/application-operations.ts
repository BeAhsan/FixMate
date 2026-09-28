import { createApiClient, createOperations, type Operations } from '@fixmate/api-client'
import { createAccessTokenSource } from './access-token-source'

/**
 * Which operations each application is allowed to use.
 *
 * One map, in one place, rather than each of the four applications naming its
 * own three calls. The reason is not tidiness: an application that picked its own
 * operations could pick the wrong ones, and the symptom would be a 403 at the
 * moment somebody tried to sign in rather than a failure to build. Here a missing
 * entry is a `TypeError` on a plain object, and `ApplicationKey` is checked
 * against this map by a test that also reads the back end's
 * `config/applications.php`, so a fifth account type added there without a line
 * here fails the suite.
 *
 * The back end enforces the same mapping independently, in `account.can`. This
 * map is the front end's copy of a rule the server already owns; neither is
 * trusted on its own, and that is the point.
 */
export const OPERATIONS_BY_APPLICATION = {
    user: {
        signIn: 'signInUser',
        renew: 'renewSessionUser',
        signOut: 'signOutUser',
        whoAmI: 'currentUser',
        changePassword: 'changePasswordUser',
    },
    worker: {
        signIn: 'signInWorker',
        renew: 'renewSessionWorker',
        signOut: 'signOutWorker',
        whoAmI: 'currentWorker',
        changePassword: 'changePasswordWorker',
    },
    admin: {
        signIn: 'signInAdmin',
        renew: 'renewSessionAdmin',
        signOut: 'signOutAdmin',
        whoAmI: 'currentAdmin',
        changePassword: 'changePasswordAdmin',
    },
    'super-admin': {
        signIn: 'signInSuperAdmin',
        renew: 'renewSessionSuperAdmin',
        signOut: 'signOutSuperAdmin',
        whoAmI: 'currentSuperAdmin',
        changePassword: 'changePasswordSuperAdmin',
    },
} as const satisfies Record<string, Record<string, keyof Operations>>

export type ApplicationKey = keyof typeof OPERATIONS_BY_APPLICATION

/**
 * The five operations one application is allowed to use.
 *
 * Returning a narrowed object rather than the whole {@link Operations} is the
 * point: an application holding the full client could call `signInAdmin` from the
 * customer application, and the only thing stopping it would be the back end's
 * 403. Holding five functions means the mistake is not available to make.
 *
 * `changePassword` is the fifth, and it is here rather than called by each
 * application for the same reason as the other four: the door it belongs to is
 * decided by the application key, and an application that could name one would be
 * an application that could aim the change at another account type's store.
 */
export function operationsFor(operations: Operations, application: ApplicationKey) {
    const names = OPERATIONS_BY_APPLICATION[application]

    type CurrentAccount = {
        account_type: string
        account: { id: number; name: string; email: string; status: string }
        abilities: string[]
    }

    return {
        signIn: operations[names.signIn].bind(operations) as (
            input: { email: string; password: string },
        ) => Promise<{ token: string; renewal_token: string; access_token_expires_at: string; renewal_token_expires_at: string; must_change_password: boolean }>,
        renew: operations[names.renew].bind(operations) as () => Promise<{
            access_token: string
            renewal_token: string
            access_token_expires_at: string
            renewal_token_expires_at: string
            must_change_password: boolean
        }>,
        signOut: operations[names.signOut].bind(operations) as () => Promise<{ message: string }>,
        whoAmI: operations[names.whoAmI].bind(operations) as () => Promise<CurrentAccount>,
        changePassword: operations[names.changePassword].bind(operations) as (input: {
            current_password: string
            password: string
        }) => Promise<CurrentAccount>,
    }
}

/**
 * Build a client for one application.
 *
 * The access-token holder is created here, before the client, and the session
 * that writes it is built later from the same holder. That order is the reason
 * the holder is an object rather than a variable inside the session: the client
 * needs a getter at construction time and the session does not exist yet.
 */
export function createApplicationClient(baseUrl: string) {
    const tokens = createAccessTokenSource()

    const client = createApiClient({
        baseUrl,
        getAccessToken: tokens.get,
    })

    return { client, tokens, operations: createOperations(client) }
}
