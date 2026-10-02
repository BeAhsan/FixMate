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
        /**
         * The eight mocked customer endpoints, and the only application that may
         * hold them.
         *
         * They sit here rather than in the components that render them because
         * this map is the front end's copy of a rule the back end already owns:
         * each of those routes carries `account.can:users`, so a worker token
         * would be refused by the server. The narrowing here means the mistake
         * is not available to make in the first place — the other three
         * applications cannot name a customer's bookings, because their entries
         * do not carry the name.
         *
         * **Every one of these eight answers a literal.** They are on the map so
         * the designed screens have a shape something validates, not because the
         * platform can diagnose, rank, track, register or price. Each name is
         * commented at the operation in `@fixmate/api-client`, and the customer
         * screens repeat it on the screen, because a validated `confidence` is
         * exactly what makes a reader believe there is a model behind it.
         *
         * `bookingQuote` is the only one of the eight that takes an argument, and
         * the argument is a booking identifier in the path rather than a body.
         * The key reads `bookingQuote` rather than `quote` so it is not confused
         * with the routes it sits among: the map holds operation *names*, and the
         * name is what the screen's own loader is written around.
         */
        diagnosis: 'getDiagnosis',
        diagnosisSuggestions: 'getDiagnosisSuggestions',
        tracking: 'getTracking',
        bookings: 'listBookings',
        register: 'registerUser',
        discovery: 'getDiscovery',
        matching: 'getMatching',
        bookingQuote: 'getBookingQuote',
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
        /**
         * The account directory. Super-administrator-only on the back end, and
         * named here so the session's narrowing can hand it — and only it — to
         * the one application whose token can actually reach it.
         */
        listAccounts: 'listAccounts',
    },
} as const satisfies Record<string, Record<string, keyof Operations>>

export type ApplicationKey = keyof typeof OPERATIONS_BY_APPLICATION

/**
 * The operations one application is allowed to use.
 *
 * Returning a narrowed object rather than the whole {@link Operations} is the
 * point: an application holding the full client could call `signInAdmin` from the
 * customer application, and the only thing stopping it would be the back end's
 * 403. Holding the bound functions means the mistake is not available to make.
 *
 * The five session operations are bound for every application. Anything else the
 * application's own entry names is bound alongside them — which is how the super
 * administrator application receives `listAccounts` and the other three receive
 * nothing: the extra is on their entry or it is not, and for the three it is
 * not, so `operations.listAccounts` is not merely a 403 waiting to happen but a
 * name the application cannot hold.
 *
 * `changePassword` is the fifth of the five, and it is here rather than called by each
 * application for the same reason as the other four: the door it belongs to is
 * decided by the application key, and an application that could name one would be
 * an application that could aim the change at another account type's store.
 */
export function operationsFor<K extends ApplicationKey>(
    operations: Operations,
    application: K,
) {
    const names = OPERATIONS_BY_APPLICATION[application]

    const session: SessionOperations = {
        signIn: operations[names.signIn].bind(operations) as (
            input: { email: string; password: string },
        ) => Promise<SignInForSession>,
        renew: operations[names.renew].bind(operations) as () => Promise<RenewedForSession>,
        signOut: operations[names.signOut].bind(operations) as () => Promise<{ message: string }>,
        whoAmI: operations[names.whoAmI].bind(operations) as () => Promise<CurrentAccount>,
        changePassword: operations[names.changePassword].bind(operations) as (input: {
            current_password: string
            password: string
        }) => Promise<CurrentAccount>,
    }

    // Everything on this application's entry beyond the five session names, bound
    // by loop rather than by a hand-written conditional per extra. The loop is the
    // narrowing: an extra is bound only when the entry names it, so the returned
    // type carries the key for the application whose entry has it and does not
    // carry it for the applications whose entry does not.
    //
    // Written as a loop because the previous version spelled `listAccounts` out
    // in a `('listAccounts' in names ? … : {})` ternary, and the customer screens
    // needed five more. Five conditionals would have meant five places to forget
    // one, and the failure mode is silent: the screen's `operations.tracking` is
    // `undefined`, and the first symptom is a click that throws rather than a
    // build that fails.
    const extras: Record<string, unknown> = {}

    for (const [key, operation] of Object.entries(names)) {
        if (key in session) {
            continue
        }

        extras[key] = operations[operation as keyof Operations].bind(operations)
    }

    return { ...session, ...extras } as OperationsForApplication<K>
}

/** What `whoAmI` and `changePassword` resolve with, spelled once. */
type CurrentAccount = {
    account_type: string
    account: { id: number; name: string; email: string; status: string }
    abilities: string[]
}

/** What `signIn` resolves with, spelled once so the two callers agree. */
type SignInForSession = {
    token: string
    renewal_token: string
    access_token_expires_at: string
    renewal_token_expires_at: string
    must_change_password: boolean
}

/** What `renew` resolves with, spelled once so the two callers agree. */
type RenewedForSession = {
    access_token: string
    renewal_token: string
    access_token_expires_at: string
    renewal_token_expires_at: string
    must_change_password: boolean
}

/**
 * The five operations every application holds, whatever its entry says.
 *
 * Bound by hand above rather than by loop, because each one is cast to the shape
 * this package promises: `Operations` types them with the wider declared
 * responses, and the session narrows them to the five fields it reads. Keeping
 * the five here — and the extras in the mapped type below — is what lets the
 * loop skip them by name.
 */
type SessionOperations = {
    signIn: (input: { email: string; password: string }) => Promise<SignInForSession>
    renew: () => Promise<RenewedForSession>
    signOut: () => Promise<{ message: string }>
    whoAmI: () => Promise<CurrentAccount>
    changePassword: (input: {
        current_password: string
        password: string
    }) => Promise<CurrentAccount>
}

/** The five names bound above, as a union for `Exclude` to remove from. */
type SessionOperationName = keyof SessionOperations

/**
 * Take an operation's declared signature and unbind it.
 *
 * `Operations` declares its methods as `operations.method(input)`, which is a
 * method on an interface and therefore arrives carrying the object. Every one of
 * them is `Promise`-returning by construction, so the return is awaited here and
 * the caller sees a plain `Promise<T>` — which is what calling it unbound
 * actually gives you.
 */
type Unbound<F> = F extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never

/**
 * The bound operations an application of key `K` may hold: the five session
 * operations, plus every extra its entry in {@link OPERATIONS_BY_APPLICATION}
 * names.
 *
 * **The mapped type is the narrowing, and it is the point of this file.** The
 * keys are drawn from the application's own entry, so
 * `operationsFor(operations, 'user')` has `tracking` and `bookings` in its type
 * and `operationsFor(operations, 'worker')` has neither — the mistake is refused
 * where it is written, rather than becoming a 403 discovered in a browser.
 *
 * Derived from the entry rather than written out, because the alternative was a
 * conditional type per extra and the customer screens needed five more. That
 * version's failure mode is quiet: forget one and the key is simply absent from
 * the returned type, the cast above stops it mattering, and the screen's first
 * symptom is `operations.tracking is not a function` on a click. Writing the
 * keys out also meant the map and the type were two lists that could disagree,
 * and only one of them is the thing the back end enforces.
 *
 * `AccountSummary` is no longer imported for the conditional that used to name
 * it. The extra's signature is now read off `Operations` itself, so a client
 * generated from a changed response cannot leave a stale type behind here.
 */
/**
 * One application's entry, widened so its values are usable as an index into
 * `Operations`.
 *
 * The intersection with `Record<string, keyof Operations>` is a type-level
 * counterpart to the `satisfies` on the map itself: `satisfies` checks the
 * literals are real operation names without widening them away, which leaves
 * TypeScript unable to index `Operations` with a value it has not resolved yet.
 * The `& keyof Operations` in the mapped type below is then redundant in the
 * resolved case and load-bearing in the generic one.
 */
type EntryFor<K extends ApplicationKey> = (typeof OPERATIONS_BY_APPLICATION)[K] &
    Record<string, keyof Operations>

export type OperationsForApplication<K extends ApplicationKey> = SessionOperations & {
    [E in Exclude<keyof (typeof OPERATIONS_BY_APPLICATION)[K], SessionOperationName>]: Unbound<
        Operations[EntryFor<K>[E] & keyof Operations]
    >
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
