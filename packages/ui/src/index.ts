/**
 * `@fixmate/ui` — the design system, the application shell, and the form and
 * feedback primitives the four dashboards share.
 *
 * It imports nothing from `@fixmate/session`. The shell takes the identity, the
 * abilities and a sign-out callback as props, which is what keeps this package
 * free of any opinion about sessions and testable without one. The four
 * applications wire the two together; nothing else changes.
 *
 * ```tsx
 * <AppShell
 *   identity={{ application: 'user', applicationLabel: 'FixMate', accountType: 'Customer' }}
 *   sections={[{ href: '/', label: 'Dashboard' }]}
 *   abilities={abilities}
 *   onSignOut={signOut}
 * >
 *   <Card title="Dashboard">…</Card>
 * </AppShell>
 * ```
 */

export { AppShell } from './shell/app-shell'
export { accountTypeLabel, canReach, knownAccountTypes, reachableSections } from './shell/permissions'
export type { AppShellProps, ShellIdentity, ShellSection } from './shell/types'

export { Field, fieldInputProps } from './primitives/field'
export type { FieldProps } from './primitives/field'

export { Button } from './primitives/button'
export { PrivacyNotice } from './primitives/privacy-notice'
export { PasswordField } from './primitives/password-field'
export type { PasswordFieldProps } from './primitives/password-field'
export type { ButtonProps } from './primitives/button'

export { Alert } from './primitives/alert'
export type { AlertProps, AlertTone } from './primitives/alert'

export { Card, EmptyState } from './primitives/card'
