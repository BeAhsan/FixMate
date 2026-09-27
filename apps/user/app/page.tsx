'use client'

import { Card } from '@fixmate/ui'
import { ApplicationShell } from '@/lib/application'

/**
 * The end user's dashboard.
 *
 * A **client component**, and it has to be one. The shell renders the live
 * account type and filters navigation by the token's abilities, neither of which
 * exists at build time — so there is nothing for a server render to produce. The
 * page is still prerendered: `next build` writes this HTML to `out/index.html`,
 * and it becomes useful once the session has been restored in the browser.
 *
 * The `'use client'` is also what makes `lib/application` legal to import. That
 * module calls `createApplication()` at module scope, and Next.js refuses to call
 * a client-module function from a server render — it can only be rendered as a
 * component or passed as a prop. A server component importing it fails the build
 * with a message about collecting page data, which is a confusing way to be told
 * "this page depends on the session".
 *
 * The only thing in this application that is *content* rather than configuration.
 * The shell, the session and the sign-in flow are all imported.
 *
 * `data-export-marker` is what the packaging check greps for in the served HTML.
 * A real attribute rather than a comment, because a comment would not survive
 * minification and its absence would be indistinguishable from a build that
 * silently stopped rendering.
 */
export default function HomePage() {
    return (
        <ApplicationShell>
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
                        <li>Five images from one release, rolled back together.</li>
                    </ul>
                </section>
            </div>
        </ApplicationShell>
    )
}
