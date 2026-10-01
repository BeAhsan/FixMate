'use client'

import { Card } from '@fixmate/ui'
import { ApplicationShell, session } from '@/lib/application'

/**
 * The customer's own account, at `/account/`.
 *
 * **The one page here with no mocked data**, and that is the reason it exists:
 * the tab bar on the dashboard links to Profile, and a link to a route that
 * renders nothing is a dead end. The shell already links here too — `sections` in
 * `lib/application.ts` has listed `/account/` since before any of the designed
 * screens — so this page closes a gap that was already shipped rather than
 * opening a new one.
 *
 * Everything shown comes from the session. There is nothing to mock, because
 * there is nothing here that the repository cannot answer: who is signed in, what
 * type of account it is, and what abilities the live token carries.
 *
 * Not wrapped in one of the designed screens, deliberately. The dashboard and the
 * two booking screens draw their own header, and this one uses the shared shell
 * because there is no design for it — so it should look like the rest of the
 * application rather than like a fourth thing.
 */
export default function AccountPage() {
    const account = session.account()

    return (
        <ApplicationShell>
            <div className="flex flex-col gap-6">
                <Card title="Your account">
                    <p className="text-slate-600 dark:text-slate-300">
                        This is who the back end says you are signed in as. It is read
                        from the session rather than written here, so it cannot drift
                        from what the token actually carries.
                    </p>
                </Card>

                <section
                    data-account
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                    <h2 className="text-lg font-semibold">Identity</h2>

                    {account === null ? (
                        <p className="text-slate-600 dark:text-slate-300">
                            Checking who is signed in…
                        </p>
                    ) : (
                        <dl className="flex flex-col gap-2 text-sm">
                            <div className="flex justify-between gap-4">
                                <dt className="text-slate-500 dark:text-slate-400">Name</dt>
                                <dd className="font-medium">
                                    {account.name ?? 'Not given'}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-4">
                                <dt className="text-slate-500 dark:text-slate-400">
                                    Email
                                </dt>
                                <dd className="font-medium">{account.email}</dd>
                            </div>
                            <div className="flex justify-between gap-4">
                                <dt className="text-slate-500 dark:text-slate-400">
                                    Account type
                                </dt>
                                {/* The store name, because this is the one place
                                    the raw value is genuinely useful: it is what
                                    the token was minted from, and it is what
                                    somebody debugging a refusal needs to read.
                                    The shell's header shows the human label. */}
                                <dd className="font-medium">{account.accountType}</dd>
                            </div>
                            <div className="flex justify-between gap-4">
                                <dt className="text-slate-500 dark:text-slate-400">
                                    Abilities on this token
                                </dt>
                                <dd className="font-medium">
                                    {account.abilities.length === 0
                                        ? 'None'
                                        : account.abilities.join(', ')}
                                </dd>
                            </div>
                        </dl>
                    )}
                </section>
            </div>
        </ApplicationShell>
    )
}