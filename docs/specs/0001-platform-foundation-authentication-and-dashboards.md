# Spec: FixMate platform foundation — authentication and dashboard shell for four front-end apps

## Problem Statement

FixMate is a service application. It will be used by four kinds of person — an
end user, a worker, an administrator, and a super administrator — and the
business domain behind those four roles is not yet decided. What is decided is
that each of the four needs its own front-end application, its own address, and
its own login, and that all four talk to one Laravel back end.

Today the Laravel application is an untouched skeleton. It has no API routes,
no authentication of any kind, no domain code, and no concept of a role. It does
have something worth keeping: a solid, working delivery pipeline. A single
immutable image is built by a Jenkins job, pushed to a registry, deployed to a
VPS by an rsync-and-swap script, health-checked, and rolled back automatically
on failure.

The problem is that the four front ends cannot be built on top of what exists.
There is no API to call, no way for anyone to sign in, and no place to hang the
role rules that will eventually separate an administrator from an end user. There
is also no address to serve a front end from: the application is reached by IP
and port only, and the web server that is supposed to sit in front of it is not
configured anywhere in this repository.

Building the four applications on this foundation without first fixing it means
four copies of an ad-hoc login flow, four hand-maintained lists of API URLs, and
a deploy pipeline that has never carried more than one image.

## Solution

Stand up a platform foundation, deliberately narrow, that the eventual domain
features can be built on without rework:

**A Laravel back end that is an API and nothing else.** Blade, the Vite asset
pipeline, and the example view are removed. Fortify provides the authentication
backend and Sanctum provides the tokens that authenticate API requests — the
pairing Laravel's own documentation recommends for a single-page application on a
Laravel API. The back end is organised as Domain-Driven Design with one real
bounded context — Identity and Access — established as the worked example that
later contexts will copy. API resources, not models, are what cross the HTTP
boundary, so the shape of a response is a deliberate decision rather than a
side effect of a database table.

**Four credential stores, four login screens.** End users, workers,
administrators and super administrators each have their own table, their own
sign-in endpoint, and their own password reset flow. Nobody is an administrator
because of a flag on their record; they are an administrator because they signed
in at the administrator application and their account is checked against the
administrators table and nothing else. Each application therefore authenticates
against exactly one account type, and a sign-in attempt never reveals whether an
address exists in a different store.

**Four Next.js applications in one repository, built as four separate
deployables.** They share a typed API client, a session layer, and a design
system through internal packages, so the login flow is written once. Each is
built to a static export and served as its own immutable image, so the four
applications add no Node processes and no new runtime to maintain on the server.

**One release, not five.** The back end and the four front ends are deployed as
an atomic set, recorded together, and rolled back together. A new back end with
old front ends means nobody can log in; that must never be a state the server
can rest in.

**The generated API client is the contract.** Wayfinder generates typed
TypeScript from Laravel's routes, into the shared package, during the build. If a
route is renamed, the front ends fail to compile rather than fail at runtime in
a user's browser.

## User Stories

### Signing in

1. As an end user, I want to sign in at the user application's own address, so that I reach my dashboard without passing through any other application.
2. As a worker, I want to sign in at the worker application's own address, so that my tools are separate from the customer-facing ones.
3. As an administrator, I want to sign in at the administrator application's own address, so that I reach the management dashboard directly.
4. As a super administrator, I want to sign in at the super administrator application's own address, so that access management is reached directly.
5. As a returning user of any of the four applications, I want to still be signed in after a page reload, so that I am not asked to sign in again every time I refresh.
6. As a returning user, I want to be returned to the page I was on when my session was restored, so that a reload does not lose my place.
7. As a user, I want a password reset link sent to my email address, so that I can recover my account without asking an administrator.
8. As a user, I want my password reset link to work exactly once, so that a forwarded email cannot be reused to take over my account.
9. As a user, I want my password reset link to expire, so that an old email sitting in my inbox cannot be used later.
10. As a user, I want to choose a new password and see whether it is acceptable before submitting, so that I am not rejected after the fact.
11. As a user, I want to sign out, so that my session ends immediately on a shared or public device.
12. As a user, I want to be signed out automatically after a period of inactivity, so that an unattended device does not stay signed in to my account.
13. As a user who mistypes my password, I want to be told the credentials were wrong without being told which part was wrong, so that I do not learn which addresses have accounts.
14. As a user who mistypes my password, I want to see a clear error rather than a blank page or a spinner that never stops, so that I know what happened.
15. As a user whose account is locked or awaiting approval, I want to be told that plainly, so that I know whether to wait or to contact an administrator.
16. As a user, I want the sign-in button to disable while my request is in flight, so that a double tap on a slow connection does not lock my account.
17. As a user, I want my browser's password manager to recognise the sign-in form, so that signing in is fast and I can use a strong generated password.
18. As a user, I want to be able to reveal the password I typed, so that I can check a mistyped character without starting over.
19. As a user using a screen reader, I want every sign-in field to be labelled and every error announced, so that I can sign in without seeing the screen.
20. As a user who cannot use a mouse, I want to reach and submit the sign-in form from the keyboard alone, so that I can sign in independently.
21. As a user signing in for the first time, I want to be required to set a new password, so that a default or shared password is never in use.
22. As a user, I want to be shown a privacy notice at sign-in, so that I know what is being collected and why.
23. As a user whose sign-in attempts keep failing, I want to be told plainly that I must wait before trying again, so that I understand my account is being protected and know when to retry rather than being met with an ordinary rejection.

### Staying signed in, safely

24. As a signed-in user, I want my access to be granted for a short period and renewed without me noticing, so that I am not asked to sign in constantly but a stolen token is also short-lived.
25. As a signed-in user, I want to be signed out as soon as my account is suspended, so that a change of access takes effect immediately rather than at my next sign-in.
26. As a signed-in user, I want my session to end when I sign out in one application while using another, so that my own sign-out is trustworthy.
27. As a user on a shared device, I want the sign-in form to be a separate address from my dashboard rather than a modal, so that no dashboard data is left on screen for the next person.
28. As a security-minded user, I want to see that my session is active and be able to end it, so that I am not left wondering whether I am still signed in.

### Account types and access

29. As an end user, I want to be refused entry to the administrator application, so that I never see management functions I am not entitled to.
30. As an end user, I want to be refused entry to the worker application, so that I cannot present myself as a worker.
31. As a worker, I want to be refused entry to the administrator application, so that operational tools and management tools stay separate.
32. As an administrator, I want to be refused the account-management functions that belong to a super administrator, so that access management stays with one accountable role.
33. As a user, I want administrative API endpoints to refuse me even when I call them directly from the browser console, so that the user interface is not the only thing standing between me and admin data.
34. As an administrator, I want to receive a clear "not permitted" response rather than a broken page, so that I know the problem is my access and not a fault.
35. As an administrator, I want to be refused access to an endpoint that exists but is not mine, so that I cannot reach another administrator's records by guessing an identifier.
36. As a person who holds both a customer account and a worker account, I want each application to check only its own account type when I sign in, so that a wrong password in one application never tells me anything about the other.
37. As a person who holds both a customer account and a worker account, I want to sign in to each independently, so that a problem with one account does not lock me out of the other.
38. As a user resetting my password, I want only the account I used to be changed, so that resetting it does not silently alter a different account I hold.
39. As a super administrator, I want to suspend an administrator account without deleting it, so that I can remove access while keeping the record of what that person did.
40. As a super administrator, I want to see every account across all four account types in one place, with each one's status, so that I can audit who has access anywhere in the system.
41. As a super administrator, I want to promote an administrator to a super administrator and be warned when that role is held by more than a couple of people, so that the most powerful account type stays narrow and deliberate.
42. As an administrator, I want to be unable to suspend or delete my own account, so that I cannot lock myself and my colleagues out.
43. As a user whose account has been suspended, I want to be told that plainly at sign-in, so that I know to contact an administrator rather than keep retrying a password that is not the problem.
44. As a user, I want to be refused at the correct address when I sign in with an account of the wrong type, so that I am told I am in the wrong place rather than that my password is wrong.

### The four dashboards

45. As a signed-in end user, I want a dashboard that is my landing page after sign-in, so that I have somewhere to start.
46. As a signed-in worker, I want a dashboard that is my landing page after sign-in, so that I can see my work at a glance.
47. As a signed-in administrator, I want a dashboard that is my landing page after sign-in, so that I can see the state of the business at a glance.
48. As a signed-in super administrator, I want a dashboard that is my landing page after sign-in, so that I can see the state of access management at a glance.
49. As a dashboard user, I want the application shell — header, navigation, and sign-out — to be present and consistent, so that the four applications feel like one product.
50. As a dashboard user, I want navigation to show only the sections my account type can reach, so that I am not offered links that will refuse me.
51. As a dashboard user, I want to be told which application and which account type I am signed in as, so that on a shared device I can tell at a glance which identity is active.
52. As a dashboard user, I want a visible loading state while my dashboard data is fetched, so that a slow connection does not look like an empty account.
53. As a dashboard user, I want to be told when my dashboard cannot be loaded and given a way to retry, so that a transient failure is not a dead end.
54. As a dashboard user, I want a clear empty state on a dashboard with no data yet, so that I know the absence is intentional rather than a failure to load.
55. As a dashboard user, I want to reach the sign-in screen when my session has ended, so that I understand why I have been returned to sign-in.
56. As a dashboard user, I want to be returned to my dashboard after signing in from that redirect, so that being signed out does not cost me my place.
57. As a dashboard user on a phone, I want the dashboard to be usable without horizontal scrolling, so that I can work from a phone.
58. As a dashboard user with a keyboard, I want to move through the whole application shell by keyboard, so that I am not blocked by mouse-only navigation.
59. As a dashboard user, I want the dashboard readable at high zoom without losing content, so that low vision does not hide functions from me.
60. As a dashboard user, I want to be able to reach the core dashboard actions from the keyboard, so that I never have to reach for a mouse.
61. As a dashboard user, I want the four dashboards to share one visual language, so that moving between them does not mean relearning the interface.

### The API contract

62. As a developer, I want the front ends to call typed functions rather than hand-written URLs, so that a renamed route fails the build instead of failing in a user's browser.
63. As a developer, I want route parameters to be typed, so that I cannot call an endpoint with the wrong identifier type.
64. As a developer, I want the generated client in one shared package, so that a change to it benefits all four applications at once.
65. As a developer, I want the generated client produced fresh by the build, so that it can never drift from the back end's actual routes.
66. As a developer, I want the build to fail when the generated client is out of date, so that a broken contract cannot reach production.
67. As a developer, I want API responses validated against a declared shape on arrival, so that a back end change surfaces as a clear error rather than a blank screen.
68. As a developer, I want every error response to have one consistent shape, so that the four applications handle failure the same way.
69. As a developer, I want the back end's domain rules to exist in exactly one place, so that the four applications cannot disagree about what is true.
70. As a developer, I want a change in one context to be unable to reach into another's data, so that contexts stay separable as the domain grows.
71. As a developer, I want the back end's data access to sit behind interfaces the domain owns, so that the domain does not depend on the database framework.
72. As a developer, I want domain rules to be testable without a database or a web server, so that the important logic runs in milliseconds.
73. As a developer, I want the pattern for adding a new bounded context to be demonstrated by a real one, so that I can copy a working example rather than invent one.

### Deploying and operating

74. As an operator, I want the back end and all four front ends deployed as one release, so that a new back end is never live against old front ends.
75. As an operator, I want a failed deployment to roll all five components back together, so that I never serve a half-deployed state.
76. As an operator, I want to see which five component versions are currently live, so that I can answer what is running right now.
77. As an operator, I want each component's health checked independently, so that one broken front end is identified rather than reported as a general failure.
78. As an operator, I want a deployment to be declared failed if any front end is unreachable from outside the server, so that a component that is healthy internally but not publicly does not ship.
79. As an operator, I want the server's automatic rollback to restore the previous front-end versions as well as the previous back end, so that rollback actually returns me to a working state.
80. As an operator, I want each front end served as an immutable image with no source on disk, so that a deployed version is exactly the version that was tested.
81. As an operator, I want the four front ends to add no long-running processes to the server, so that the server's memory use does not grow with the number of applications.
82. As an operator, I want to add a proper domain name later by changing only the front web server's configuration and one list of allowed addresses, so that the applications need no change.
83. As an operator, I want each front end's address listed in one configuration file, so that adding or renaming an address is a single edit.
84. As an operator, I want the server's existing automated rollback to keep working after these changes, so that the safety net I have now is not lost.
85. As an operator, I want the migration rule of never reverting a database change to be preserved, so that a rollback never risks the schema.
86. As an operator, I want each back-end change to be safe to roll back on its own, so that reverting one release is always an option.

### Quality gates

87. As a developer, I want every change to the back end to be checked by an automated test before it can be merged, so that a broken change never reaches the branch.
88. As a developer, I want every change to the four front ends type-checked and built before it can be merged, so that a front end that cannot build is never merged.
89. As a developer, I want the pull-request gate and the delivery pipeline to run the same checks, so that a change cannot pass one and fail the other.
90. As a developer, I want a formatting check on the back end that matches what the delivery pipeline runs, so that formatting is not a surprise at deploy time.
91. As a developer, I want tests to run against an in-memory database with no external services, so that the suite is fast and cannot be broken by a service being down.
92. As a reviewer, I want tests to assert what the system does rather than how it is built internally, so that refactoring does not break the suite.
93. As a reviewer, I want one test to cover each of the four sign-in paths and each cross-account-type refusal, so that the access rules are demonstrably enforced rather than assumed.

## Implementation Decisions

### Repository shape

A single repository becomes an npm-workspaces monorepo. Four Next.js
applications sit under an applications directory; shared code sits under a
packages directory. npm is used rather than a second package manager, because the
repository already has an npm lockfile and the delivery pipeline already
installs with it.

Four separate packages, each deployed on its own:

- **User application** — the end user's client.
- **Worker application** — the worker's client.
- **Administrator application** — the administrator's client.
- **Super administrator application** — access management's client.

This is a deliberate departure from "four separate applications, four separate
repositories", and it is the one decision most worth revisiting. The
justification is that at this scope the four applications are largely the same
program: the same sign-in flow, the same session handling, the same API client,
the same shell. Four repositories would mean four copies of the sign-in flow and
four lists of allowed addresses to keep in step. Each application is still built,
tagged, deployed and rolled back independently, so the operational independence
the separate applications were wanted for is preserved.

Shared internal packages:

- **API client** — the generated Wayfinder output plus the fetch wrapper, token
  attachment, response validation and error normalisation. The single place that
  knows how to talk to the back end.
- **Session** — sign-in, sign-out, token storage, silent renewal, and the
  signed-in/signed-out state exposed to the application.
- **User interface** — the design system, the application shell, and the form
  and feedback primitives the four dashboards share.
- **Configuration** — the address of the back end and the identity of the
  application, supplied at build time.

### Authentication

**Sanctum for tokens, Fortify for the credential lifecycle.** These are
complementary, not alternatives. Sanctum issues and revokes the tokens that
authenticate API requests. Fortify supplies the authentication backend —
credential checking, login throttling, username canonicalisation, and password
reset token handling. This is the pairing Laravel's own documentation recommends
for a single-page application backed by a Laravel API.

**Fortify is used as a library of actions, not as a route registrar.** This is
the one significant constraint in this design, and it comes from the four-table
decision rather than from Fortify. Fortify's configuration is a single global
file holding a single user model, a single guard, a single path prefix, and one
set of routes. It is built to serve one account type. So Fortify is installed
with its views disabled and only the features this work needs enabled, its route
registration is suppressed via `Fortify::ignoreRoutes()`, and the four sign-in
endpoints and their password reset flows are registered by this application —
each bound to its own guard, each reusing Fortify's actions for the parts that
are genuinely reusable.

**The throttle key must include the guard.** Fortify's `LoginRateLimiter`
builds its key from `email|ip` and does not include the guard, so four endpoints
on four guards would share one rate-limit bucket by default — an attacker could
trip one door and lock out all four account types. A `GuardAwareLoginRateLimiter`
subclass prefixes the key with the guard name (`users|email|ip`,
`workers|email|ip`, etc.), so the four doors throttle independently. This is the
one place the four-guard requirement changes the off-the-shelf behaviour, and it
is covered by its own test (ticket 05).

**Fortify does not ship password-reset action classes.** It publishes *stubs*
for `ResetUserPassword` and `UpdateUserPassword` that implement the
`ResetsUserPasswords` and `UpdatesUserPasswords` interfaces — those stubs are
your code, not Fortify's. The stub `UpdateUserPassword` hardcodes the validation
rule `current_password:web`, so each account type needs its own implementation
with the correct guard. This is why the four password-reset flows are separate
implementations rather than one reused class, and it is a smaller code footprint
than it sounds.

**Per-request guard mutation is a trap.** Mutating `config('fortify.guard')` in
middleware works in a single-threaded request but breaks under Octane or queue
workers where global config is shared across concurrent requests. The correct
pattern is explicit DI: four controller classes, each constructed with
`Auth::guard('users')`, `Auth::guard('workers')`, etc., and their own
`LoginRateLimiter` instance. The one adapter boundary stays one blast radius.

**What this buys.** Login throttling, which is the reason to want Fortify here
at all. Four unguarded sign-in endpoints is a brute-force amplifier, and
throttling is the cheapest meaningful defence. Username canonicalisation comes
with it, so an address typed in different case reaches the same account.
Everything else Fortify offers — registration, email verification, two-factor
authentication, password confirmation — is out of scope, and its features are
switched off rather than left installed and unused.

**How Fortify is configured, concretely.** Four guards are registered in
`config/auth.php` — one per account type, each with its own provider and its own
model, so a credential is only ever checked against the table behind the guard
that the request arrived on. Fortify's `views` option is `false`, which disables
its view routes; that is the mode intended for a JavaScript client, and it is
what keeps Blade out of the back end. A single `FortifyServiceProvider` calls
`Fortify::ignoreRoutes()`, disables every feature except `resetPasswords()`,
binds four `GuardAwareLoginRateLimiter` singletons, and wires the per-guard
action implementations. A single adapter is the only code in the application
that touches Fortify's action classes, which is what gives the internal-API
dependency named above one blast radius rather than four.

**Four account types, four credential stores.** End users, workers,
administrators and super administrators each have their own table, their own
authenticatable model, and their own guard. These are genuinely different kinds
of account and are modelled as such: a worker is a supplier to the platform with
skills, rates and availability attached to it, while an administrator is staff.
Treating a worker as "a user with a flag" would put commercial attributes on the
customer record.

**Four sign-in endpoints, one table each.** Each application has its own sign-in
screen and calls the endpoint for its own account type. The endpoint resolves
credentials against exactly one table and never falls back to another. This is
a security property, not a convenience: a sign-in attempt at the worker
application cannot confirm whether an address exists among customers, so the four
stores do not leak into each other. Every failure — unknown address, wrong
password, suspended account — returns the same response, so a wrong-type
sign-in cannot be distinguished from a wrong password by an attacker.

Each sign-in issues a token carrying the ability for its account type, so that
access cannot be widened by changing which application the request came from.
The super administrator token is issued the wildcard ability, and the wildcard is
granted sparingly and visibly.

Access to an endpoint is enforced by middleware that checks the token's ability
*and* that the authenticated model is of the type the route belongs to. This is
the control that makes the user interface's hiding of navigation a convenience
rather than the protection itself.

**The cost of this choice, stated plainly.** Adding a fifth account type later
requires a new table, a new authenticatable model, a new guard, a new sign-in
endpoint, a new ability, and a new login screen — an engineering change rather
than a data change. A single shared table with roles would have made that a
single row insert. The trade is accepted deliberately: the four account types
are separated in the business, and the isolation between them is worth more here
than the convenience of adding a type later. It also means a person who is both
a customer and a worker has two accounts with two passwords, which is a real
cost borne by that person and must be communicated to them plainly.

**Where the cost concentrates.** The customer/worker split is well justified —
they are different kinds of thing. The administrator/super administrator split
is the weakest of the four, because a super administrator is an administrator
with more permissions, and separating them means promoting someone moves a
record rather than setting a flag. If this is ever reconsidered, that pair is the
seam to change; it touches one guard, one endpoint, one ability and one table,
and nothing outside Identity and Access.

### Session handling in the browser

The four applications are built to static exports, so there is no application
server to hold a session and no place to set an httpOnly cookie from
application code. The access token is therefore held in memory only, never in
local storage, so that it is not readable by injected script and does not
survive the tab being closed.

Because an in-memory token does not survive a page reload, renewal is required
on load. Two mechanisms, and the choice between them depends on having a domain
name:

- **Without a domain name** — the access token is held in memory and the
  renewal token is stored in browser storage. This works at any address but
  means a renewal token is readable by injected script, so its lifetime is kept
  short and it is rotated on every use.
- **With a domain name** — the renewal token becomes an httpOnly, secure cookie
  scoped to the shared parent domain, unreadable by any of the four
  applications' scripts. The applications continue to be static; only the back
  end sets the cookie.

The second is preferred and is the reason to acquire a domain name, but nothing
in this work is blocked on it. User story 5 is satisfied by the first mechanism
from the start and upgraded by the second.

### The API

All routes under a versioned prefix, so that a future incompatible change has
somewhere to go. A single consistent error envelope, because four applications
handling four error shapes is the kind of thing that becomes four bugs.

The back end exposes one route group per bounded context, each with its own
middleware and its own throttle. This is the sense in which each application has
its own gateway: a distinct surface, with its own access rules, rather than one
undifferentiated pile of endpoints.

The generated client is produced once, into the shared API client package, and
all four applications import it. Generating per application was considered and
rejected: the filtering it would provide is a convenience, and access control
that matters belongs on the server, not in which functions a front end happens
to have imported.

CORS is configured from an explicit list of the four application origins, held in
one place. The list is by origin, not by pattern, so it works unchanged whether
the applications are addressed by port or by hostname.

### Domain-driven design in the back end

One real bounded context is built: **Identity and Access**. It owns
authentication, the four account types and their separate credential stores, and
the abilities attached to each. It is built as the worked example that later
contexts will copy, rather than scaffolding several empty contexts that would
each be a guess.

Each context is layered:

- **Domain** — entities, value objects, domain services, and the repository
  *interfaces* the domain depends on. No framework types, no query builder, no
  HTTP.
- **Application** — one class per use case, taking and returning data transfer
  objects. This is the layer the HTTP layer calls.
- **Infrastructure** — the database models and the implementations of the
  domain's repository interfaces. The only layer that knows Eloquent exists.
- **Http** — controllers, request validation, and API resources. Controllers
  are thin: validate, call one use case, return a resource.

API resources are the boundary that keeps the four applications honest. What an
administrator sees of a person and what a worker sees of themselves are different
representations built from the same domain object, and adding a field to a
database table does not silently change what an application receives.

Explicitly excluded: event sourcing, CQRS read models, and a repository per
aggregate. At this scope they cost weeks before the first feature ships.

**The back end becomes a pure API.** Blade views, the Vite asset pipeline, the
CSS and JavaScript entry points, and the Docker build stage that produces them
are all removed, along with the example view and the route that renders it, and
the test that asserts that route returns a page. The health endpoint is kept
unchanged — the deploy script depends on it. Removing the front end also means
the generated client can no longer be produced by a front-end build plugin, so
generation moves into the build pipeline as an explicit step.

### Schema

- **users** — customer accounts: name, email, password, status, timestamps.
  Email is unique within this table.
- **workers** — worker accounts: the same credential shape, plus the attributes
  that make a worker bookable. Kept separate from customers so that commercial
  attributes never land on the customer record.
- **admins** — staff accounts with administrative access.
- **super_admins** — staff accounts with unrestricted access. A separate table
  because promotion moves a record rather than setting a flag; see the note in
  the authentication decision.
- **personal access tokens** — created by Sanctum. Its polymorphic owner column
  already supports four authenticatable models, so all four account types share
  one token table and one revocation mechanism.
- **password reset tokens** — one per account type, because a reset must resolve
  the account type it was requested for and must never fall back to another.
- **sessions** — not used for application authentication, retained for whatever
  still needs them.

Every account table carries its own status, so that access is withdrawn by
suspending a record rather than deleting it, and the record of what that person
did survives. The account type names, the abilities, and the mapping from
application to account type are configuration rather than migration constants, so
that the four applications agree with the back end about which is which.

**Fortify's published migration is not used.** `fortify:install` publishes a
migration adding `two_factor_secret`, `two_factor_recovery_codes` and
`two_factor_confirmed_at` to the `users` table. Two-factor authentication is out
of scope, so those columns are not added. Every one of the four account tables
would otherwise need the same three columns added and then left permanently null,
which is schema carrying a feature that does not exist. If two-factor
authentication is ever adopted, it is added once, to all four tables, as its own
piece of work.

### Generated client and the contract

`laravel/wayfinder` is a development dependency. Generation runs as an explicit
step in the build, not via the Vite plugin, because the back end no longer has a
front-end build to hang it on.

The generated output is **not committed**. It is produced fresh in the build
pipeline, in a throwaway PHP container, before the four front-end images are
built from the same workspace. This means no front-end image needs PHP or
Composer installed, and the output cannot be stale.

The pipeline fails if generation produces a diff against what the front ends
expect, which is the one check that catches a renamed route before a user finds
it.

Wayfinder is in beta and its interface may change. Generation is therefore
isolated behind a single step, so that a breaking change is a fix in one place.

### Deployment

Five images, all built from the same commit, all pushed to the registry under
the existing owner and project:

- the API image, as today, from the existing Dockerfile with its asset stage
  removed;
- four front-end images, each a static export served by nginx.

The build stays single-architecture, matching the existing pipeline parameter.
The platform must match the target server's processor, and getting it wrong
succeeds at build time and fails at run time, so this is not a value to change
casually.

The production compose file gains four services alongside the existing five,
each with a memory limit and a health check, each joining the existing network
and publishing its own address. The deploy script becomes a set deploy: it pulls
all five, migrates, brings all five up, then health-checks each. The release
record becomes the set of five versions rather than one, and rollback restores
all five.

That last point is the reason for doing it this way. Because the front ends are
built against a generated client, a back end that has changed its contract while
the front ends are still on the old one produces an application that nobody can
sign in to. Recording and rolling back the five together makes that state
unreachable, and re-asserts the existing rule that a database migration is never
reverted.

**Addresses.** Today everything is IP and port, and the deploy script, the
compose file and the health check all work that way. Each front end is published
on its own port, and each application's address is named in one configuration
file. Acquiring a domain name later is then a change to the front web server's
virtual hosts and to the allowed-origins list — no image, no compose, and no
application code changes.

This is explicitly the interim arrangement. The web server that fronts the
application is not configured in this repository; port 80 on the server is
already taken by something outside it, and there is no TLS listener. Standing up
a proper front door with hostnames and certificates is real work and is listed
as out of scope, with the consequence stated plainly: until it happens, the
applications are served over plain HTTP on a private network, and must not be
exposed to the public internet as they stand.

### Relationship to the existing pipeline

The existing pipeline is kept and extended, not replaced: the same registry, the
same controller, the same credentials, the same rsync-and-swap deploy, the same
automatic rollback, the same release history.

Two additions to the build are required, and both are the kind of thing that
silently breaks if forgotten. The container ignore file does not currently
exclude a new front-end directory, and the Dockerfile copies the whole build
context, so the monorepo would otherwise be swept into the API image on every
build. The pull-request workflow has no Node step at all, so without an
addition the four front ends would sit entirely outside the merge gate.

Per the repository's existing rule, any new check is added to both the
pull-request workflow and the delivery pipeline, or to neither.

## Testing Decisions

**A good test asserts observable behaviour from outside the module.** If a test
would break when a class is renamed or a method is reordered, it is testing the
inside, and it is wrong. The test says what a person or a client can observe —
a response, a state change, a refusal — and nothing about how it was produced.

**Prefer the highest seam available, and add as few seams as possible.** One new
seam is proposed, and two existing ones are reused.

**Reused — HTTP feature tests on the back end.** This seam already exists: the
suite runs on an in-memory database with array cache, array session and a
synchronous queue, so it needs no MySQL, no Redis, and no running web server.
It is the highest seam available for the back end and it is where the sign-in
paths, the account-type refusals, the error envelope and the response shapes are
asserted. The context layering does not change this seam: controllers stay thin,
so asserting through a real request genuinely tests the use case underneath.
This is the primary test surface and it needs no new infrastructure.

**New — the generated-client drift check.** This is the one genuinely new seam,
and it is the failure mode that having four front ends creates: a route is
renamed, the back-end suite still passes, and all four applications break at
runtime in a browser. A build step that regenerates the client and fails on a
diff is one command and closes the only gap four separate front ends actually
open. It is the highest seam available for the contract between the two sides,
because it is above both of them.

**Reused — the deploy health and smoke checks.** The deploy script already waits
on the health endpoint and then verifies database connectivity, and the
pipeline already curls an externally-reachable address after deploying. These
are extended to cover each of the four front ends rather than replaced, so the
"healthy inside the server but unreachable from outside" case still fails a
build.

**What gets tested where.**

- The Identity and Access context's domain layer is tested with pure unit tests,
  with no database and no framework, covering the rules that decide what a token
  may do.
- All four sign-in paths, sign-out, token renewal, and every cross-account-type
  refusal are tested as feature tests through HTTP, because that is how they are
  actually reached.
- **The isolation between the four credential stores is the most important thing
  to test here, and it is tested from outside.** For each of the four
  applications: a valid credential from one store must be refused by the other
  three sign-in endpoints, and all four must return an identical response for an
  unknown address, a wrong password and a suspended account, so that no
  endpoint reveals which addresses exist in another store. This is a security
  property, it is invisible from the inside, and a refactor that quietly made one
  endpoint fall back to another table would not fail any other test.
- **Login throttling is tested, and it is tested per account type.** Repeated
  failures against one sign-in endpoint eventually produce a throttle response
  rather than an authentication failure, and the four endpoints are throttled
  independently — exhausting one must not lock the same address out of the other
  three. This is asserted through HTTP because the throttle key includes the
  guard, and a test that reached past the HTTP layer into the limiter would not be
  testing the thing that actually varies.
- Each of the four applications is tested by type-checking and by a production
  build. This is deliberate: the applications are almost entirely presentation
  at this scope, and their real logic — validation, authorisation — is on the
  back end where it is already covered at the HTTP seam.
- The shared API client and user interface packages are the only places that get
  component tests, because they are the only front-end code with logic in it
  that no back-end test can reach.
- **Deliberately not included:** browser end-to-end tests. With no features
  built, they would assert nothing, and running four of them adds a browser
  dependency to every pipeline run. Revisit when there is behaviour worth
  driving through a browser.

**Prior art.** The repository has two example tests and no other precedent. They
are conventional PHPUnit tests extending the framework's base test case, and the
feature test's pattern of asserting a real response is the pattern to follow.
The formatting and test commands the pipeline runs are the commands a change
must pass locally before it is pushed.

## Out of Scope

- **The business domain.** No service catalogue, no bookings, no workers as
  bookable entities, no payments, no disputes, no scheduling. Account types
  beyond the four specified here are deliberately not invented. The dashboards
  are shells with a consistent frame, a real session, and real access control —
  not domain content.
- **Any second bounded context.** Identity and Access is the only one built. The
  structure is established so others can be added; they are not scaffolded empty.
- **Registration and self-service sign-up.** Sign-in, sign-out, password reset
  and session renewal are in scope. How an account comes into existence is not,
  and the answer depends on the domain.
- **Email verification, two-factor authentication, passkeys, and social login.**
- **A front door with hostnames and TLS.** No domain name, no DNS, no
  certificates, and no configuration for the web server that already sits in
  front of the application. The interim arrangement is documented above,
  including its consequence: plain HTTP, private network, not public-facing.
- **Multi-tenancy, multiple cities or countries, and localisation.** Timezone is
  currently fixed to UTC in configuration rather than read from the
  environment; changing that is a small, separate piece of work.
- **Email or push notifications.**
- **Rate limiting anywhere other than the four sign-in endpoints.** Login
  throttling is in scope, and comes from Fortify. Throttling the dashboards, the
  password reset endpoints, or the API generally is not, and is worth doing before
  any public exposure.
- **File uploads, media handling, and the public storage disk.**
- **Performance work, caching strategy, and query optimisation.** The dashboards
  have no data to be slow about yet.
- **An audit log of administrative actions.** Recording who created, suspended or
  promoted a staff account is in scope as columns on that account; a general
  audit trail of everything administrators do is not.
- **Deleting the fixtures and the example view's replacement.** The four fixture
  directories are unrelated to this work and are left alone.

## Further Notes

**The most important open question is still the domain.** It is genuinely
deferred, and this spec is scoped so that deferral is safe — but the shape of
the Identity and Access context is the shape the rest of the domain will lean
on, and it was designed without knowing what the business is. When the domain
is decided, the context boundaries should be revisited before the second context
is added, not after.

**Defining a fifth account type is now an engineering task, not a data change.**
This is the direct consequence of the four-table decision, and it is the one
place where "define the roles later" is no longer free. Four account types are
specified and cost nothing further. A fifth would need a table, a model, a guard,
a sign-in endpoint, an ability, a login screen, and a fifth deployable — so the
point at which this decision should be revisited is *before* that fifth type is
needed, not after. Which of the four existing types are likely candidates for
splitting later is worth knowing now: if, for example, "user" turns out to need
distinguishing between a customer and a business customer, that is a fifth table
and a fifth login screen, and the same work would be cheaper done once, up
front.

**Four decisions in this spec are worth a second opinion, and each is cheap to
reverse.** Four separate credential stores is the newest and the one most likely
to be revisited, because it trades a data change for a code change and puts two
passwords on anyone who is both a customer and a worker. The monorepo over four
repositories is the largest structural choice and would be painful to undo once
four applications exist separately. Static export forecloses server components,
streaming rendering, and the httpOnly-cookie session, none of
which are needed for a login screen and a dashboard shell. Bearer tokens held in
browser memory are a real security posture, mitigated by short lifetimes and
rotation, and the cookie-based improvement depends on acquiring a domain name.

**Fortify's action classes are internal, and that is a live dependency.** Using
Fortify as a library of actions rather than as a route registrar means calling
classes the package does not promise to keep. Three things keep that acceptable
rather than merely noted: the dependency is confined to a single adapter, every
one of the four sign-in paths is covered by feature tests, so a moved class fails
loudly on the next test run rather than changing behaviour quietly; and the
fallback is known and small — core Laravel's `RateLimiter` and `Password` broker
provide the same two capabilities Fortify is wanted for here, in perhaps a hundred
lines. The arrangement should be re-examined at the next Fortify major version
rather than carried forward indefinitely on the strength of having worked once.

**Wayfinder is a beta dependency** and the generated client is the mechanism that
keeps four front ends honest. If it proves unsuitable, the fallback is a
hand-maintained typed client with a contract test in place of the drift check —
which is why the drift check is specified as its own step rather than folded into
generation.

**There is a documentation discrepancy to settle separately.** The agent notes in
this repository describe project skills as living under a skills directory, and
the README describes four build stages and different pipeline defaults than the
pipeline file actually contains. None of that blocks this work, but the notes
will mislead the next agent, and the pipeline defaults in particular are the kind
of stale value that fails silently at deploy time.
