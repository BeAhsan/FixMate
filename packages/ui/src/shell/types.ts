import type { ReactNode } from 'react'

/**
 * Who is signed in, and which application this is.
 *
 * Passed in by each application rather than derived, because a shared device is
 * the case this exists for: somebody who has signed in as a customer and then
 * opened the worker application needs to be able to tell, at a glance, which
 * identity is live. The account type comes from the *session* rather than from
 * the application's own configuration — the back end is what decides, and an
 * application that labelled itself would be labelling itself on trust.
 */
export interface ShellIdentity {
    /** This application's key, matching `config/applications.php` on the back end. */
    application: string
    /** Shown in the header. */
    applicationLabel: string
    /** The account type the live session actually belongs to. */
    accountType: string
    /** The person's name, when the session knows it. */
    accountName?: string | undefined
    /** The person's address, when the session knows it. */
    accountEmail?: string | undefined
}

/**
 * One place in the navigation.
 *
 * `requiredAbility` is what makes the navigation honest rather than decorative.
 * A section whose ability the live token does not carry is not rendered, so
 * nobody is offered a link that will refuse them — while the *back end* refuses
 * it regardless, because hiding navigation is a convenience and not the
 * protection. Both halves are needed and they are not the same half.
 */
export interface ShellSection {
    href: string
    label: string
    /** Hide unless the session's token carries this ability. */
    requiredAbility?: string
}

export interface AppShellProps {
    identity: ShellIdentity
    sections: readonly ShellSection[]
    /** The abilities on the live token. Empty means signed out. */
    abilities: readonly string[]
    children: ReactNode
    onSignOut: () => void
    /** Marks the current page in the navigation. */
    currentPath?: string
    /** False while the session is still being restored, so a shell can wait. */
    ready?: boolean
}
