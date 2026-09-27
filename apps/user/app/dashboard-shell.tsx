'use client'

import { useSession } from '@/app/session-provider'
import { session } from '@/lib/api'
import { AppShell, type ShellSection } from '@fixmate/ui'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * This application's shell, wiring the shared one to this application's session.
 *
 * The split is deliberate: `@fixmate/ui` knows about headers, navigation and
 * focus, and nothing about sessions. This file knows that the account type is
 * `Customer`, that the doors are `/users/*`, and that signing out means calling
 * the session. Moving to the worker application is a copy of this file with
 * three values changed.
 */

/**
 * The end user's own navigation.
 *
 * `requiredAbility` is what keeps it honest — a section the live token cannot
 * reach is not offered. The back end refuses it either way; this is the
 * courtesy, and the two are not the same protection.
 *
 * "All accounts" is here deliberately and is genuinely hidden for this account
 * type, which carries `users:*` and nothing else. It is in the list to prove the
 * filter runs on this application too, rather than passing because the list
 * happened to contain nothing restricted.
 */
const sections: readonly ShellSection[] = [
    { href: '/', label: 'Dashboard' },
    { href: '/bookings/', label: 'Bookings' },
    { href: '/account/', label: 'Account' },
    { href: '/accounts/', label: 'All accounts', requiredAbility: 'accounts:read' },
]

export function DashboardShell({ children }: { children: ReactNode }) {
    const router = useRouter()
    const pathname = usePathname()
    const { ready, accountType, accountName, accountEmail, abilities } = useSession()

    return (
        <AppShell
            identity={{
                application: 'user',
                applicationLabel: 'FixMate',
                // The back end's answer. Null only in the moment before it
                // arrives, and the shell shows that as "Checking…" rather than
                // guessing "Customer" — a shell that labelled itself would be
                // labelling itself on trust.
                accountType: accountType ?? 'Checking…',
                accountName: accountName ?? undefined,
                accountEmail: accountEmail ?? undefined,
            }}
            sections={sections}
            abilities={abilities}
            currentPath={pathname}
            ready={ready}
            onSignOut={() => {
                // The back end revokes every token this account holds, which is
                // what ends the session in the other three applications. This
                // one is already signed out locally by the time the call
                // returns, whatever the network says.
                void session.signOut().then(() => router.replace('/sign-in/'))
            }}
        >
            {children}
        </AppShell>
    )
}
