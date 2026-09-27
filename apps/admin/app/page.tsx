'use client'

import { Card } from '@fixmate/ui'
import { ApplicationShell } from '@/lib/application'

/**
 * The administrator's dashboard.
 *
 * The only thing in this application that is *content* rather than
 * configuration. The shell, the session and the sign-in flow are all imported.
 *
 * The content is deliberately plain; real dashboard data arrives with ticket 19.
 * `data-export-marker` is what the packaging check greps for in the served HTML,
 * and it differs per application so a check can tell the four images apart.
 */
export default function HomePage() {
    return (
        <ApplicationShell>
            <div className="flex flex-col gap-6">
                <Card title="Welcome">
                    <p className="text-slate-600 dark:text-slate-300">You are signed in to the FixMate administrator application. Account management belongs to a super administrator, so those functions are not offered here — and would be refused if they were called.</p>
                </Card>

                <section
                    data-export-marker="admin-app"
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                    <h2 className="text-lg font-semibold">What arrives next</h2>
                    <ul className="flex list-disc flex-col gap-2 pl-5 text-slate-600 dark:text-slate-300">
                        <li>Dashboard data, with loading, empty and failure states.</li>
                        <li>Five images from one release, rolled back together.</li>
                    </ul>
                </section>
            </div>
        </ApplicationShell>
    )
}
