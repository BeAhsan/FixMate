/**
 * The banner that says the data on this screen is a fixture.
 *
 * ## Why this is a component rather than a paragraph in each screen
 *
 * The three mocked customer screens all render invented numbers, and the whole
 * risk of that is that the invention is invisible. A screen showing a
 * technician's coordinates, a `0.92` confidence and a price range looks exactly
 * like a screen showing real ones — a map with a marker on it is
 * indistinguishable from a map with a *moving* marker on it in a screenshot, in
 * a demo, and in review. That is precisely how a fixture gets mistaken for a
 * feature, and it does not need anybody to be careless: it needs one screenshot.
 *
 * So the disclosure is a component, and every mocked screen renders one. A
 * fourth screen that forgets is then a visible omission in review rather than a
 * silent one, and the wording lives in one place instead of drifting into three
 * slightly different promises.
 *
 * ## The wording is a promise this repository cannot keep yet
 *
 * It says what is actually true and nothing more: the numbers are examples, the
 * request is real, and nobody is being tracked or diagnosed. It deliberately does
 * **not** promise a date, a service level, or that a real estimator is coming —
 * those are product decisions nobody has made, and a screen that claims them is
 * worse than one that stays silent. The same discipline as the sign-in privacy
 * notice, and for the same reason: a claim the code cannot support is a bug even
 * when it reads well.
 *
 * Rendered as `role="note"` rather than `role="alert"` or `role="status"`: it is
 * context for the page rather than a message about what just happened, so it
 * should not interrupt anything on arrival.
 */
export function MockedDataNotice({ detail }: { detail?: string }) {
    return (
        <p
            role="note"
            data-mocked-data-notice
            className="flex flex-col gap-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
            <span className="font-medium">Example data</span>
            <span className="text-amber-800 dark:text-amber-200">
                Everything below is a fixed example from the back end, not a real result. Nobody is
                being diagnosed, matched or tracked, and no booking will be made.
                {detail !== undefined && ` ${detail}`}
            </span>
        </p>
    )
}