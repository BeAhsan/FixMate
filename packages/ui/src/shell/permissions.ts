/**
 * How each account type is named to a person.
 *
 * The back end answers with the *store* name — `users`, `super_admins` — because
 * that is what it needs to be for routing and for `account.can`. Rendering it
 * would put the inside of the credential model on screen, and "Signed in as
 * super_admins" is not an answer to the question somebody is asking.
 *
 * The values are the back end's own `AccountType::label()` strings, lower-cased
 * as it returns them, and a test asserts the four line up — so a fifth account
 * type added there without a label here fails the suite rather than shipping a
 * raw store name into a header.
 *
 * Unknown values pass through unchanged. A new account type should be visible
 * and obviously unpolished rather than blank: "signed in as whatever-this-is"
 * is a bug somebody can report, and an empty header is not.
 */
const ACCOUNT_TYPE_LABELS: Readonly<Record<string, string>> = {
    users: 'end user',
    workers: 'worker',
    admins: 'administrator',
    super_admins: 'super administrator',
}

export function accountTypeLabel(accountType: string): string {
    return ACCOUNT_TYPE_LABELS[accountType] ?? accountType
}

/** The four labels, for the test that keeps them in step with the back end. */
export function knownAccountTypes(): readonly string[] {
    return Object.keys(ACCOUNT_TYPE_LABELS)
}

/**
 * Can this token reach this section?
 *
 * The wildcard is a super administrator's alone, and it is the only thing that
 * satisfies every ability. Written as one function rather than at each call site
 * because the two callers — the shell and its test — must agree exactly: a
 * filter that hid a section in one place and not the other would produce a
 * navigation that differs between what is rendered and what is asserted.
 *
 * A section with no `requiredAbility` is always shown. That is a deliberate
 * statement: it means "this page needs no particular ability", not "we forgot to
 * say".
 */
export function canReach(abilities: readonly string[], required: string | undefined): boolean {
    if (required === undefined) {
        return true
    }

    return abilities.includes('*') || abilities.includes(required)
}

/**
 * The sections this account type can actually reach, in the order given.
 *
 * Order is preserved rather than sorted, because the order is the order somebody
 * chose for their application and re-sorting it by label would quietly discard
 * that.
 */
export function reachableSections<T extends { requiredAbility?: string }>(
    sections: readonly T[],
    abilities: readonly string[],
): T[] {
    return sections.filter((section) => canReach(abilities, section.requiredAbility))
}
