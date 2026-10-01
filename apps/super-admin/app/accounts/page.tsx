'use client'

import type { AccountSummary } from '@fixmate/api-client'
import { useEffect, useState } from 'react'
import { AccountsScreen, type TypeFilter } from '@/lib/accounts-screen'
import { ApplicationShell, operations } from '@/lib/application'

/**
 * The account directory page, at `/accounts/`.
 *
 * Spec 0002. The application is a static export, so the fetch happens in the
 * browser, in a single effect guarded against unmount — the same pattern
 * `SessionProvider` uses. The call goes through the application's bound
 * operations, never through `fetch`: the token attachment, silent renewal and
 * error normalisation belong to the API client, and this page owns none of them.
 *
 * This module default-exports the page and nothing else. Next.js inspects a
 * page module's exports and refuses any it does not know, so the screen this
 * renders lives in `lib/accounts-screen` — which is also what lets the screen
 * be tested as markup without a router.
 */

/**
 * The page: fetch the directory, hold the filter state, render the screen.
 *
 * The filter state is held here rather than inside the screen so that a retry
 * does not wipe out what the person had typed — the state is the caller's, the
 * rendering is the screen's.
 */
export default function AccountsPage() {
    const [accounts, setAccounts] = useState<AccountSummary[] | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

    /** Bumped to re-run the fetch. One variable is the whole retry protocol. */
    const [attempt, setAttempt] = useState(0)

    useEffect(() => {
        // Guards a state update after unmount, which a fast navigation during
        // the request would otherwise cause — the same guard SessionProvider
        // keeps around its own restore.
        let cancelled = false

        async function load() {
            setLoading(true)
            setError(null)

            try {
                const directory = await operations.listAccounts()

                if (!cancelled) {
                    setAccounts(directory)
                }
            } catch {
                // The error's own wording is the back end's, not this page's, and
                // the states the person can act on are "wait" and "try again".
                // Keeping one honest sentence is better than relaying a message
                // that may name a stack trace.
                if (!cancelled) {
                    setError('Please try again.')
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        void load()

        return () => {
            cancelled = true
        }
    }, [attempt])

    return (
        <ApplicationShell>
            <AccountsScreen
                loading={loading}
                error={error}
                accounts={accounts}
                search={search}
                onSearchChange={setSearch}
                typeFilter={typeFilter}
                onTypeFilterChange={setTypeFilter}
                onRetry={() => setAttempt((current) => current + 1)}
            />
        </ApplicationShell>
    )
}
