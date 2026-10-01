import type { AccountSummary } from '@fixmate/api-client'
import { accountTypeLabel, Alert, Button, Card, EmptyState } from '@fixmate/ui'
import { useMemo } from 'react'

/**
 * The account directory screen: every account in the platform, across all four
 * types.
 *
 * Spec 0002. The back end answers one question — who has access anywhere in this
 * system — and this component is that answer rendered. It is the presentational
 * half: props in, markup out, no router and no network, so tests render it with
 * `renderToStaticMarkup`. The fetch, the filter state and the shell live in the
 * page that renders it, which is the split the session package's screens use.
 *
 * The response arrives grouped by account type, then by identifier within each
 * type, and that order is kept rather than re-sorted: the back end chose it so
 * that a person comparing two moments sees rows in the same places.
 */

/**
 * Which row is selected in the account-type filter.
 *
 * `'all'` rather than an empty-string sentinel, so the value stays a type the
 * compiler can exhaust.
 */
export type TypeFilter = 'all' | 'users' | 'workers' | 'admins' | 'super_admins'

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
    { value: 'all', label: 'All types' },
    { value: 'users', label: 'End users' },
    { value: 'workers', label: 'Workers' },
    { value: 'admins', label: 'Administrators' },
    { value: 'super_admins', label: 'Super administrators' },
]

/** The statuses the back end can put on a row, and the words to show for them. */
const STATUS_LABELS: Record<string, string> = {
    active: 'Active',
    suspended: 'Suspended',
    pending: 'Pending',
}

/**
 * The badge classes for each status.
 *
 * Every badge carries the word as well as the colour, so the meaning survives
 * without colour vision. An unknown status falls through to a plain badge with
 * the value as its own label — visible and obviously unpolished rather than
 * hidden, which is the same fail-visible rule the shell applies to account
 * types.
 */
const STATUS_BADGES: Record<string, string> = {
    active: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100',
    suspended:
        'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100',
    pending:
        'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
}

const PLAIN_BADGE =
    'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'

function StatusBadge({ status }: { status: string }) {
    return (
        <span
            className={[
                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                STATUS_BADGES[status] ?? PLAIN_BADGE,
            ]
                .filter(Boolean)
                .join(' ')}
        >
            {STATUS_LABELS[status] ?? status}
        </span>
    )
}

export interface AccountsScreenProps {
    /** Whether the directory request is in flight. */
    loading: boolean
    /** What went wrong, or null while the request stands. */
    error: string | null
    /** The directory, or null before the first successful answer. */
    accounts: AccountSummary[] | null
    /** The search text, held by the caller so a retry does not lose it. */
    search: string
    onSearchChange: (search: string) => void
    /** The account-type filter, held by the caller for the same reason. */
    typeFilter: TypeFilter
    onTypeFilterChange: (filter: TypeFilter) => void
    onRetry: () => void
}

export function AccountsScreen({
    loading,
    error,
    accounts,
    search,
    onSearchChange,
    typeFilter,
    onTypeFilterChange,
    onRetry,
}: AccountsScreenProps) {
    const filtered = useMemo(() => {
        if (accounts === null) {
            return []
        }

        const needle = search.trim().toLowerCase()

        return accounts.filter((account) => {
            if (typeFilter !== 'all' && account.type !== typeFilter) {
                return false
            }

            if (needle === '') {
                return true
            }

            return (
                account.name.toLowerCase().includes(needle) ||
                account.email.toLowerCase().includes(needle)
            )
        })
    }, [accounts, search, typeFilter])

    const showTable = accounts !== null && !error
    const showEmpty = showTable && filtered.length === 0

    return (
        <div className="flex flex-col gap-6">
            <Card title="All accounts">
                <p className="text-slate-600 dark:text-slate-300">
                    Every account in the platform, across all four credential stores,
                    including suspended and pending ones. A suspension should never be
                    indistinguishable from a deletion.
                </p>
            </Card>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex flex-1 flex-col gap-1">
                    <label
                        htmlFor="accounts-search"
                        className="text-sm font-medium text-slate-700 dark:text-slate-300"
                    >
                        Search by name or email
                    </label>
                    <input
                        id="accounts-search"
                        type="search"
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="e.g. ada@example.test"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-sky-700 dark:border-slate-700 dark:bg-slate-900 dark:focus:outline-sky-400"
                    />
                </div>

                <div className="flex flex-col gap-1">
                    <label
                        htmlFor="accounts-type"
                        className="text-sm font-medium text-slate-700 dark:text-slate-300"
                    >
                        Account type
                    </label>
                    <select
                        id="accounts-type"
                        value={typeFilter}
                        onChange={(event) => onTypeFilterChange(event.target.value as TypeFilter)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-sky-700 dark:border-slate-700 dark:bg-slate-900 dark:focus:outline-sky-400"
                    >
                        {TYPE_FILTERS.map((filter) => (
                            <option key={filter.value} value={filter.value}>
                                {filter.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Announced politely, because a loading message that interrupts is
                worse than no message: the person may still be typing. The
                `status` tone already renders `role="status"`. */}
            {loading && <Alert tone="status">Loading the account directory…</Alert>}

            {error !== null && (
                <Alert tone="error">
                    <p>The directory could not be loaded. {error}</p>
                    <Button type="button" variant="secondary" onClick={onRetry}>
                        Try again
                    </Button>
                </Alert>
            )}

            {showEmpty && (
                <EmptyState title="No accounts match">
                    Nothing in the directory matches the current search and type filters.
                    Clear them to see every account.
                </EmptyState>
            )}

            {showTable && !showEmpty && (
                <div
                    className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
                    data-accounts-table
                >
                    {/* A caption, because a table of accounts without one is a
                        table a screen reader introduces as "table". The horizontal
                        scroll container is for the narrowest widths; the table
                        itself never scrolls its own body. */}
                    <table className="w-full text-left text-sm">
                        <caption className="sr-only">
                            Every account in the platform, grouped by account type
                        </caption>
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800">
                                <th scope="col" className="px-4 py-3 font-medium">
                                    Account type
                                </th>
                                <th scope="col" className="px-4 py-3 font-medium">
                                    Name
                                </th>
                                <th scope="col" className="px-4 py-3 font-medium">
                                    Email
                                </th>
                                <th scope="col" className="px-4 py-3 font-medium">
                                    Status
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((account) => (
                                <tr
                                    key={`${account.type}-${account.id}`}
                                    className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
                                >
                                    <td className="px-4 py-3">{accountTypeLabel(account.type)}</td>
                                    <td className="px-4 py-3 font-medium">{account.name}</td>
                                    <td className="px-4 py-3">{account.email}</td>
                                    <td className="px-4 py-3">
                                        <StatusBadge status={account.status} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
