'use client'

import type { DiagnosisSuggestions, DiagnosisResult, MoneyRange } from '@fixmate/api-client'
import { Alert } from '@fixmate/ui'
import { MockedDataNotice } from './mocked-data-notice'
import { formatMoneyRange } from './money'
import { JAKARTA_FONT_CLASS } from './typeface'
import {
    ACCENT_TEXT,
    ACTION,
    AMBER_TEXT,
    CARD,
    GROUND,
    INK,
    INK_SOFT,
    PILL_OFF,
} from './tokens'
import { useMockedResource, type MockedResource } from './use-mocked-resource'

/**
 * The AI Problem Diagnosis frame, built to the design and fed by the mocked
 * endpoints.
 *
 * ## What is real and what is not
 *
 * **Real:** the request, the typed response, the validation of that response
 * against a declared shape, and every control on the screen. The refresh button
 * re-requests. The three suggestions are rendered from what arrived, not from a
 * constant in this file.
 *
 * **Not real:** everything the response contains. No model reads a question, and
 * `confidence` is a number in a controller rather than a probability of anything.
 * The `MockedDataNotice` above the content says so on the screen, and the notice
 * is a component rather than a sentence in this file so a fourth mocked screen
 * cannot forget it.
 *
 * ## The two endpoints, and why there are two
 *
 * `diagnosisSuggestions` is fetched alongside `diagnosis` rather than after it.
 * They are independent — one is a menu of categories, the other is the answer to
 * the one already chosen — and fetching the second only after the first resolves
 * would make the screen show its menu a round trip later for no reason.
 *
 * Both failures are rendered, and neither hides the other: if the diagnosis
 * arrives and the suggestions do not, the diagnosis is still shown and the
 * suggestion strip carries its own message. The alternative, throwing away good
 * data because something adjacent failed, is the worse error.
 */
export function AiDiagnosis({
    loadDiagnosis,
    loadSuggestions,
}: {
    loadDiagnosis: () => Promise<DiagnosisResult>
    loadSuggestions: () => Promise<DiagnosisSuggestions>
}) {
    const diagnosis = useMockedResource(loadDiagnosis, 'diagnosis')
    const suggestions = useMockedResource(loadSuggestions, 'diagnosis-suggestions')

    // Refreshes both, because both are the same two literals from the same two
    // endpoints and a person who presses refresh means "get me the current
    // answer" — not "get me a different half". The two are independent requests
    // because they are independent resources, and either may fail alone.
    const refreshAll = () => {
        diagnosis.reload()
        suggestions.reload()
    }

    return (
        <AiDiagnosisScreen
            diagnosis={diagnosis}
            suggestions={suggestions}
            onRefresh={refreshAll}
        />
    )
}

/**
 * The screen, given its two states.
 *
 * **Split from the fetching on purpose.** `useMockedResource` runs in an effect,
 * and `renderToStaticMarkup` — the only renderer available in this package,
 * which has no jsdom and does not add one for this — never runs an effect. So a
 * screen that only exists as a hook cannot be shown its *ready* state in a test
 * at all: every render would be the loading state, and the assertion would
 * really be that a spinner is a spinner.
 *
 * Taking the states as props makes each one a plain object a test can write by
 * hand. That is the whole reason for the seam, and it costs one extra exported
 * component rather than a jsdom dependency and a workspace that suddenly renders
 * differently depending on which package is under test.
 */
export function AiDiagnosisScreen({
    diagnosis,
    suggestions,
    onRefresh,
}: {
    diagnosis: MockedResource<DiagnosisResult>
    suggestions: MockedResource<DiagnosisSuggestions>
    onRefresh: () => void
}) {
    return (
        <div className={`flex min-h-screen flex-col ${GROUND} ${JAKARTA_FONT_CLASS}`}>
            <header className="sticky top-0 z-10 border-b border-[#F1F5F9] bg-[#F8FAFC]/95 backdrop-blur dark:border-[#243350] dark:bg-[#0B1220]/95">
                <div className="mx-auto flex w-full max-w-md items-center gap-4 px-5 py-4">
                    <h1 className={`text-xl font-bold tracking-tight ${INK}`}>AI Diagnosis</h1>
                </div>
            </header>

            <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-6">
                <MockedDataNotice detail="The confidence scores are written in a controller, not calculated." />

                <Suggestions suggestions={suggestions} onRefresh={onRefresh} />
                <Diagnosis diagnosis={diagnosis} />
            </main>
        </div>
    )
}

/**
 * The three categories, and which one the response named.
 *
 * `aria-pressed` on each button rather than a visual badge alone, so "this is the
 * one the response recommended" is available to a screen reader and not only to
 * somebody who can see the pill. The visible badge is still there — the design has
 * one — but it is not the only carrier of the state.
 */
function Suggestions({
    suggestions,
    onRefresh,
}: {
    suggestions: MockedResource<DiagnosisSuggestions>
    onRefresh: () => void
}) {
    return (
        <section
            aria-label="Possible problems"
            className="flex flex-col gap-3"
        >
            <div className="flex items-center justify-between">
                <h2 className={`text-sm font-semibold uppercase tracking-wide ${INK_SOFT}`}>
                    Possible problems
                </h2>
                <button
                    type="button"
                    onClick={onRefresh}
                    className={`rounded-lg px-3 py-1 text-sm font-medium ${ACTION} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F5B55] dark:focus-visible:outline-[#6FFBBE]`}
                >
                    Refresh
                </button>
            </div>

            {suggestions.status === 'loading' && <Loading label="Loading suggestions…" />}

            {suggestions.status === 'failed' && (
                <Alert tone="error">{suggestions.message}</Alert>
            )}

            {suggestions.status === 'ready' && (
                <ul className="flex flex-col gap-2">
                    {suggestions.data.suggestions.map((suggestion) => {
                        const recommended = suggestion.id === suggestions.data.recommended

                        return (
                            <li key={suggestion.id}>
                                <button
                                    type="button"
                                    aria-pressed={recommended}
                                    className={`flex w-full flex-col gap-1 rounded-xl px-4 py-3 text-left ${PILL_OFF} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F5B55] dark:focus-visible:outline-[#6FFBBE]`}
                                >
                                    <span className="flex items-center justify-between gap-2">
                                        <span className={`font-medium ${INK}`}>{suggestion.title}</span>
                                        {recommended && (
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ACCENT_TEXT}`}>
                                                Recommended
                                            </span>
                                        )}
                                    </span>
                                    <span className={`text-sm ${INK_SOFT}`}>{suggestion.description}</span>
                                    <Money money={suggestion.price_range} />
                                </button>
                            </li>
                        )
                    })}
                </ul>
            )}
        </section>
    )
}

/**
 * The diagnosis itself: the problem, what might be causing it, what to do, and
 * what it would cost.
 *
 * `severity` is rendered as a word in a coloured pill rather than as a colour
 * alone, so the level is legible without colour vision and in a high-contrast
 * theme — the same rule the design system's `Alert` follows.
 */
function Diagnosis({ diagnosis }: { diagnosis: MockedResource<DiagnosisResult> }) {
    if (diagnosis.status === 'loading') {
        return <Loading label="Loading diagnosis…" />
    }

    if (diagnosis.status === 'failed') {
        return <Alert tone="error">{diagnosis.message}</Alert>
    }

    const { problem, severity, possible_causes, recommended_solution, estimated_time, price_estimate, tools_needed } =
        diagnosis.data.diagnosis

    return (
        <article
            aria-label="Diagnosis"
            className={`flex flex-col gap-4 p-5 ${CARD}`}
        >
            <div className="flex flex-col gap-2">
                <h2 className={`text-lg font-semibold ${INK}`}>{problem}</h2>
                <span className={`self-start rounded-full px-3 py-1 text-xs font-semibold ${AMBER_TEXT}`}>
                    {SEVERITIES[severity] ?? severity}
                </span>
            </div>

            <List title="Possible causes" items={possible_causes} />
            <List title="Tools a technician may need" items={tools_needed} />

            <div className={`flex flex-col gap-1 border-t border-[#F1F5F9] pt-4 dark:border-[#243350]`}>
                <h3 className={`text-sm font-semibold ${INK_SOFT}`}>Suggested fix</h3>
                <p className={INK}>{recommended_solution}</p>
            </div>

            <div className="flex flex-col gap-1">
                <h3 className={`text-sm font-semibold ${INK_SOFT}`}>Time this usually takes</h3>
                <p className={INK}>{estimated_time}</p>
            </div>

            <div className="flex flex-col gap-1">
                <h3 className={`text-sm font-semibold ${INK_SOFT}`}>Estimated cost</h3>
                <Money money={price_estimate} />
            </div>
        </article>
    )
}

/**
 * A price range, with the symbol added here and nowhere else.
 *
 * A thin wrapper rather than the formatting itself: the payloads carry no symbol,
 * so the rule lives in `money.ts` and is shared with the dashboard, the matching
 * screen and the booking quote — four screens drawing prices, one place deciding
 * what a rupee looks like.
 */
function Money({ money }: { money: MoneyRange }) {
    return (
        <span className={`text-sm font-medium ${ACCENT_TEXT}`}>
            {formatMoneyRange(money)}
        </span>
    )
}

/**
 * A short list under a heading, as a real `<ul>`.
 *
 * The causes and tools are arrays because the back end sends arrays, and a
 * caller joining them into a string has to invent a separator — which is a
 * sentence in a component that can disagree with the data's own shape.
 */
function List({ title, items }: { title: string; items: string[] }) {
    return (
        <div className="flex flex-col gap-2">
            <h3 className={`text-sm font-semibold ${INK_SOFT}`}>{title}</h3>
            <ul className={`flex flex-col gap-1 ${INK}`}>
                {items.map((item) => (
                    <li key={item} className="flex gap-2">
                        <span aria-hidden="true">·</span>
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
        </div>
    )
}

/**
 * The waiting state.
 *
 * `role="status"` so it is announced politely when it appears, and a real
 * sentence rather than a bare spinner — the difference between a screen that says
 * it is working and one that looks broken.
 */
function Loading({ label }: { label: string }) {
    return (
        <p role="status" className={`text-sm ${INK_SOFT}`}>
            {label}
        </p>
    )
}

/**
 * The severities the mocked back end sends, as words.
 *
 * `medium` becomes "Medium severity" rather than a bare "medium" so the pill reads
 * as a level rather than as a value. An unrecognised severity passes through
 * unchanged: a blank pill would hide the fact that the back end sent something
 * this screen does not know about, which is the reportable outcome.
 */
const SEVERITIES: Record<string, string> = {
    low: 'Low severity',
    medium: 'Medium severity',
    high: 'High severity',
}

