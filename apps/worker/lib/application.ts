import { resolveApiBaseUrl } from '@fixmate/api-client'
import { createApplication } from '@fixmate/session'

/**
 * The worker application.
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
 * `application: 'worker'`, and `OPERATIONS_BY_APPLICATION` in
 * `@fixmate/session` turns that into the five operations this door may call. An
 * application cannot reach a customer's door because it has no way to say so;
 * the only thing that could stop it is the back end's `account.can`.
 *
 * Copy `apps/user` to add a fifth: the Dockerfile, the manifests and this file.
 * Nothing else in an application is worth copying.
 */

/**
 * The navigation this door offers.
 *
 * A worker holds `workers:*` and nothing else, so nothing here is restricted —
 * what a worker reaches is the worker's own work, not the platform's.
 *
 * One entry, and that is not an oversight. `/jobs/`, `/availability/`,
 * `/earnings/` and `/account/` were all here, and all four pointed at routes
 * that have never existed — `apps/worker` has exactly one page, the dashboard.
 * Nothing failed when they were removed: the shell renders whatever it is
 * handed, so a navigation entry is not checked for a screen behind it by
 * anything that builds.
 *
 * The four are recorded in `routes_not_yet_built` in `config/applications.php`
 * rather than left here, so the intent that a worker will have a jobs screen
 * survives its absence without a link that 404s standing in for it.
 *
 * `FrontEndNavigationResolvesTest` fails if an entry is added back without a
 * page, and fails if a page is built without the entry being restored.
 */
const sections = [
    { href: '/', label: 'Dashboard' },
]

export const {
    session,
    SessionProvider,
    ApplicationShell,
    SignInScreen,
    ChangePasswordScreen,
} = createApplication({
    application: 'worker',
    applicationLabel: 'FixMate',
    // Inlined into the bundle at build time, because a static export has nothing
    // to read an environment variable at run time. The Dockerfile takes it as a
    // build argument with no default, so omitting it fails the build rather than
    // shipping an image pointing at localhost.
    baseUrl: resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_URL),
    sections,
    subject: 'worker',
    // The worker's door is built to its own design: a portal hero, a two-tab
    // credential selector (mobile OTP / partner ID), a support hub, social-proof
    // figures and a benefits grid. `plain` stays the default in
    // `@fixmate/session`, so the customer, administrator and super administrator
    // doors are untouched by this.
    signInFlow: 'designed-worker',
    signInTitle: 'Partner Sign In',
})
