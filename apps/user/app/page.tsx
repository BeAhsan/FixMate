/**
 * The landing page.
 *
 * Deliberately plain. This route exists to prove the packaging: that a Next.js
 * application in this workspace builds to a static export, that the export
 * survives a trip through a container image, and that nginx renders it with no
 * application server behind it. The application shell - header, navigation,
 * sign-out - arrives with ticket 17, and the sign-in screen with ticket 15.
 *
 * The `data-export-marker` attribute is what the packaging check greps for in
 * the served HTML. It is a real element, not a comment, because a comment
 * would not survive minification and its absence would be indistinguishable
 * from a build that silently stopped rendering.
 */
export default function HomePage() {
    return (
        <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-8 px-6 py-16">
            <header className="flex flex-col gap-2">
                <p className="text-sm font-medium tracking-wide text-sky-700 uppercase dark:text-sky-400">
                    FixMate
                </p>
                <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                    The end user application
                </h1>
            </header>

            <section
                data-export-marker="user-app"
                className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
                <h2 className="text-lg font-semibold">Served as a static export</h2>
                <p className="text-slate-600 dark:text-slate-300">
                    This page was rendered at build time and written to a directory of
                    HTML, CSS and JavaScript. nginx serves those files directly, so
                    there is no Node process and no application server in this
                    container.
                </p>
            </section>

            <section className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                    What arrives next
                </h2>
                <ul className="flex list-disc flex-col gap-2 pl-5 text-slate-600 dark:text-slate-300">
                    <li>Signing in against the back end&rsquo;s user door.</li>
                    <li>The shared session layer, with the token held in memory.</li>
                    <li>The application shell shared by all four applications.</li>
                </ul>
            </section>
        </main>
    );
}
