import { resolveApiBaseUrl } from '@fixmate/api-client'
import { createApplication } from '@fixmate/session'

/**
 * The super administrator application.
 *
 * **This file is the whole application.** Everything below is configuration: the
 * key that says which account type this is, the address, the navigation, and
 * three pieces of copy. There is no sign-in flow here, no shell, no session
 * handling and no fetch call — those are `@fixmate/session` and `@fixmate/ui`,
 * and the other three applications import exactly the same ones.
 *
 * That is the property the monorepo is arranged around, and a repository-wide
 * test enforces it: no application may contain a copy of the sign-in flow or the
 * shell, and no application may name another account type's operations.
 *
 * The account type is not named here at all. It is implied by
 * `application: 'super-admin'`, and `OPERATIONS_BY_APPLICATION` in
 * `@fixmate/session` turns that into the five operations this door may call. An
 * application cannot reach a customer's door because it has no way to say so;
 * the only thing that could stop it is the back end's `account.can`.
 *
 * Copy `apps/user` to add a fifth: the Dockerfile, the manifests and this file.
 * Nothing else in an application is worth copying.
 */

/**
 *
 * The super administrator's navigation, and the only application where the
 * restricted sections are actually reachable: a super administrator's token carries
 * the wildcard ability. Every `requiredAbility` below is satisfied.
 *
 * `operations` is exported beside the components because the account directory is
 * not one of the session's five operations: the page that renders it calls it
 * directly. The name is available to this application because the operations map
 * in `@fixmate/session` lists it under this application's key, and it is not
 * available to the other three because theirs do not.
 */
/**
 * The navigation this door offers.
 *
 * Two entries, and that is not an oversight.
 *
 * `/admins/` and `/audit/` were both here and both were reachable, because a
 * super administrator's token carries `*` and `canReach` honours the wildcard —
 * so unlike the gated entries in the other three applications, these two were
 * links a signed-in super administrator could see and follow to a 404. They are
 * recorded in `routes_not_yet_built` in `config/applications.php` rather than
 * left here, so the intent survives without the broken links.
 *
 * `/accounts/` is gated behind `accounts:read` and does have a page. The gate is
 * not doing anything for this account type — `*` satisfies everything — so it is
 * documentation rather than control, and it is written as documentation: a
 * reader can tell which entries this door will grow without comparing an ability
 * list by hand.
 *
 * `FrontEndNavigationResolvesTest` fails if an entry is added back without a
 * page, and fails if a page is built without the entry being restored.
 */
const sections = [
    { href: '/', label: 'Dashboard' },
    { href: '/accounts/', label: 'All accounts', requiredAbility: 'accounts:read' },
]

export const {
    session,
    operations,
    SessionProvider,
    ApplicationShell,
    SignInScreen,
    ChangePasswordScreen,
} = createApplication({
    application: 'super-admin',
    applicationLabel: 'FixMate Super Admin',
    // Inlined into the bundle at build time, because a static export has nothing
    // to read an environment variable at run time. The Dockerfile takes it as a
    // build argument with no default, so omitting it fails the build rather than
    // shipping an image pointing at localhost.
    baseUrl: resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_URL),
    sections,
    subject: 'super administrator',
})
