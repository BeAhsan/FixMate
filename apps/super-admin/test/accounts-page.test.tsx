import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AccountsScreen, type AccountsScreenProps } from '../lib/accounts-screen'

/**
 * The account directory screen, checked as markup.
 *
 * `renderToStaticMarkup` rather than jsdom, and for the same reason the session
 * package's screen tests give: this application has no Testing Library and no
 * browser environment, and adding them to prove a composition is a worse trade
 * than rendering the tree and reading it. The clicking is trivial; what is worth
 * proving is that the states exist, that they are announced, and that the table
 * carries the words a screen reader needs.
 *
 * The page half — the fetch, the filter state, the shell — is deliberately not
 * rendered here: it needs a router and a network, and its wiring is the kind of
 * thing the type system and the operation tests already hold.
 */

const ROWS = [
    { type: 'users', id: 3, name: 'A Customer', email: 'customer@example.test', status: 'active' },
    { type: 'workers', id: 2, name: 'A Worker', email: 'worker@example.test', status: 'pending' },
    { type: 'admins', id: 4, name: 'An Administrator', email: 'admin@example.test', status: 'active' },
    { type: 'super_admins', id: 1, name: 'The Caller', email: 'super@example.test', status: 'suspended' },
]

function render(overrides: Partial<AccountsScreenProps> = {}): string {
    return renderToStaticMarkup(
        <AccountsScreen
            loading={false}
            error={null}
            accounts={ROWS}
            search=""
            onSearchChange={() => {}}
            typeFilter="all"
            onTypeFilterChange={() => {}}
            onRetry={() => {}}
            {...overrides}
        />,
    )
}

describe('the account directory screen', () => {
    it('renders every account as a row, whatever its type', () => {
        const html = render()

        for (const row of ROWS) {
            expect(html).toContain(row.name)
            expect(html).toContain(row.email)
        }
    })

    it('names each account type in words, not as the store name', () => {
        // "Signed in as super_admins" is the mistake the shell already made once;
        // a directory repeating it would put the inside of the credential model
        // on screen four times over.
        const html = render()

        expect(html).toContain('end user')
        expect(html).toContain('worker')
        expect(html).toContain('administrator')
        expect(html).toContain('super administrator')
        expect(html).not.toContain('>users<')
        expect(html).not.toContain('>super_admins<')
    })

    it('labels the table and its columns, so a screen reader can introduce it', () => {
        const html = render()

        expect(html).toMatch(/<caption[^>]*>/)
        for (const header of ['Account type', 'Name', 'Email', 'Status']) {
            expect(html).toContain(header)
        }
        expect(html).toContain('scope="col"')
    })

    it('writes every known status as a word, not as colour alone', () => {
        const html = render()

        expect(html).toContain('Active')
        expect(html).toContain('Pending')
        expect(html).toContain('Suspended')
    })

    it('renders an unknown status as itself rather than hiding it', () => {
        // Fail visible: a status this front end has not been taught about should
        // show up as obviously unpolished, not disappear.
        const html = render({
            accounts: [{ type: 'users', id: 9, name: 'X', email: 'x@example.test', status: 'mystery' }],
        })

        expect(html).toContain('mystery')
    })

    it('announces that the directory is loading, politely', () => {
        const html = render({ accounts: null, loading: true })

        expect(html).toContain('role="status"')
        expect(html).toContain('Loading the account directory')
    })

    it('distinguishes an empty result from a failure to load', () => {
        // Story 54's distinction, applied to the directory: "nothing matches" and
        // "the request failed" are different sentences, and one component with a
        // flag would blur them.
        const empty = render({ accounts: [] })
        expect(empty).toContain('data-empty-state')
        expect(empty).toContain('No accounts match')

        const failing = render({ accounts: null, error: 'Please try again.' })
        expect(failing).not.toContain('data-empty-state')
        expect(failing).toContain('The directory could not be loaded')
    })

    it('offers a retry when the directory fails', () => {
        const html = render({ accounts: null, error: 'Please try again.' })

        expect(html).toContain('Try again')
    })

    it('keeps the table off the screen while the request has failed', () => {
        // An error beside a stale table would invite acting on rows the screen
        // has just admitted it cannot vouch for.
        const html = render({ accounts: ROWS, error: 'Please try again.' })

        expect(html).not.toContain('data-accounts-table')
    })

    it('narrows to the searched name or email', () => {
        const html = render({ search: 'worker@example.test' })

        expect(html).toContain('A Worker')
        expect(html).not.toContain('A Customer')
        expect(html).not.toContain('An Administrator')
    })

    it('narrows by account type', () => {
        const html = render({ typeFilter: 'admins' })

        expect(html).toContain('An Administrator')
        expect(html).not.toContain('A Customer')
        expect(html).not.toContain('A Worker')
    })

    it('labels the search and type controls, so they can be reached without seeing them', () => {
        const html = render()

        expect(html).toMatch(/<label[^>]*>Search by name or email<\/label>/)
        expect(html).toMatch(/<label[^>]*>Account type<\/label>/)
        expect(html).toContain('accounts-search')
        expect(html).toContain('accounts-type')
    })
})
