import type { Session } from '../types'

/**
 * Report real user interaction to the session, so its idle deadline means
 * something.
 *
 * The session can expire on a timer but it cannot *notice* a person, and the gap
 * between those two is the whole reason this file exists. Renewal used to be the
 * only clock in the session, and a timer fires whether or not anybody is there —
 * so an open tab on a machine nobody was sitting at kept minting access tokens
 * indefinitely. A person who closes their laptop expecting to be signed out was
 * not.
 *
 * **These are discrete events, deliberately.** `mousemove` and `scroll` are the
 * obvious things to listen for and both are wrong: a mouse nudged by a passing
 * sleeve, a trackpad still gliding after the last flick, a page scrolling itself
 * on a timer. Any of them would hold a session open on a machine with nobody in
 * front of it, which is precisely the case the rule is meant to catch. What is
 * listed here all require a person to have done something deliberate.
 *
 * `visibilitychange` is the tempting addition and is left out on purpose. A tab
 * being hidden is not activity, and treating it as such would mean switching away
 * from a page resets its deadline — so the tab you left open longest is the one
 * that stays signed in.
 *
 * The returned function detaches every listener. It is returned rather than left
 * to a ref so a caller cannot attach these twice and leak the first set, which in
 * React strict mode happens on purpose.
 */
export function reportUserActivity(
    session: Pick<Session, 'noteActivity'>,
    target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
): () => void {
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

    const onActivity = () => session.noteActivity()

    for (const event of events) {
        // Not passive: none of these call preventDefault, but declaring it says so
        // up front rather than leaving a future edit to discover that a listener
        // added here now blocks scrolling.
        target.addEventListener(event, onActivity, { passive: true })
    }

    return () => {
        for (const event of events) {
            target.removeEventListener(event, onActivity)
        }
    }
}
