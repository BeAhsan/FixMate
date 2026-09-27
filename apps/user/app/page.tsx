import { Card } from '@fixmate/ui'
import { DashboardShell } from './dashboard-shell'

/**
 * The landing page, inside the application shell.
 *
 * The content is deliberately plain. This route exists to prove the packaging —
 * that a Next.js application in this workspace builds to a static export, that
 * the export survives a trip through a container image, and that nginx renders it
 * with no application server behind it. The shell arrived with ticket 17 and the
 * dashboard it wraps arrives with ticket 19, and the difference the shell makes
 * is visible precisely because there is not much underneath it yet.
 *
 * The `data-export-marker` attribute is what the packaging check greps for in
 * the served HTML. It is a real attribute, not a comment, because a comment would
 * not survive minification and its absence would be indistinguishable from a
 * build that silently stopped rendering.
 */
export default function HomePage() {
    return (
        <DashboardShell>
            <div className="flex flex-col gap-6">
                <Card title="Welcome">
                    <p className="text-slate-600 dark:text-slate-300">
                        You are signed in to the FixMate end user application. This page was
                        rendered at build time and written to a directory of HTML, CSS and
                        JavaScript; nginx serves those files directly, so there is no Node
                        process and no application server in this container.
                    </p>
                </Card>

                <section
                    data-export-marker="user-app"
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                    <h2 className="text-lg font-semibold">What arrives next</h2>
                    <ul className="flex list-disc flex-col gap-2 pl-5 text-slate-600 dark:text-slate-300">
                        <li>Dashboard data, with loading, empty and failure states.</li>
                        <li>The other three applications, as copies of this one.</li>
                    </ul>
                </section>
            </div>
        </DashboardShell>
    )
}
