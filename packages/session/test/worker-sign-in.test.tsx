import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
    MOCKED_FEATURES,
    UNSUPPORTED_WORKER_CLAIMS,
    WorkerSignIn,
} from '../src/react/worker-sign-in'

/**
 * The worker's designed sign-in screen, checked for what it must and must not
 * claim.
 *
 * This screen is a much heavier set of promises than the customer's was: an
 * income figure, an insurance product, a commission holiday, a KYC flow, a
 * support desk and a helpline number. So the tests here are almost entirely
 * about **honesty** — that the one real flow is the real one, that the three
 * mocked ones say so, and that every promise this code cannot keep is named in
 * one list rather than written into the markup where nobody would find it again.
 *
 * `renderToStaticMarkup` cannot click, so the interactive behaviour is not tested
 * here. The static contract is: what is in the document, what has a label, and
 * what is announced.
 */

const noop = async () => {}

function render(overrides: Partial<Parameters<typeof WorkerSignIn>[0]> = {}): string {
    return renderToStaticMarkup(
        <WorkerSignIn
            onSignIn={noop}
            failure={null}
            pending={false}
            notice={null}
            title="Partner Sign In"
            {...overrides}
        />,
    )
}

describe("the worker's sign-in screen", () => {
    it('identifies the portal and the kind of account it is for', () => {
        const html = render()

        expect(html).toContain('Partner Sign In')
        expect(html).toContain('Verified Technician Portal')
        expect(html).toContain('Welcome Back')
        expect(html).toContain('Mistri / Partner')
    })

    it('leads with the one-time password, as the design does', () => {
        const html = render()

        expect(html).toContain('Send Partner Login OTP')
        expect(html).toMatch(/<label[^>]*>Registered Mobile Number<\/label>/)
        expect(html).toContain('type="tel"')
        // Case-insensitive, as everywhere in this repository: a browser's DOM
        // lowercases it, `renderToStaticMarkup` emits React's casing verbatim.
        expect(html).toMatch(/autocomplete="tel-national"/i)
    })

    it('offers the two credentials the design tabs between', () => {
        const html = render()

        expect(html).toContain('Instant Mobile OTP')
        expect(html).toContain('Partner ID / PIN')
        // A tablist, not two buttons: the selected-tab relationship is how a
        // screen reader announces which credential is being asked for.
        expect(html).toContain('role="tablist"')
        expect(html).toContain('aria-selected="true"')
    })

    it('keeps the privacy notice', () => {
        const html = render()

        expect(html).toContain('aria-labelledby="privacy-notice-heading"')
        expect(html).toContain('What happens when you sign in')
    })

    it('asks for the typeface from a variable', () => {
        // The customer and administrator applications never load it.
        expect(render()).toContain('var(--font-jakarta')
    })

    it('relates the email link to the form it opens', () => {
        const html = render()

        expect(html).toContain('aria-expanded="false"')
        expect(html).toContain('aria-controls="worker-sign-in-email"')
        // And the form is genuinely absent, rather than present and collapsed.
        expect(html).not.toMatch(/autocomplete="current-password"[^>]*name="password"/i)
    })
})

describe('the sealed door', () => {
    it('offers no way into the customer application', () => {
        // The design has a "Mode Switcher Banner" ("Switch to Customer") and a
        // "Footer Cross-Navigation" ("Go to Customer App"). Both are links out of
        // the one door this repository is arranged to keep shut: the worker is a
        // separate application on a separate address, and its door refuses a
        // customer account. This screen is the worker's, and nothing here needs to
        // know the other exists.
        const html = render()

        expect(html).not.toContain('Switch to Customer')
        expect(html).not.toContain('Go to Customer App')
        expect(html).not.toMatch(/localhost:300\d/)
    })

    it('renders no outbound link at all but the way back', () => {
        const hrefs = [...render().matchAll(/href="([^"]*)"/g)].map((m) => m[1])

        expect(hrefs).toEqual(['/'])
    })
})

describe('the claims on this screen', () => {
    it('names every promise this repository cannot keep', () => {
        /*
         * The list is the record, and this is the assertion that makes it
         * honest: a claim added to the screen without being added here fails.
         *
         * "12,000+ Active Mistris" is a count of accounts that do not exist, and
         * "₹38,500 Avg. Monthly" is an income figure for a marketplace with no
         * jobs and no payments. ₹5,00,000 of cover describes an insurance product.
         * A zero-commission month describes a pricing policy. Aadhaar KYC
         * describes a verification flow. The helpline is a real telephone number
         * that would ring nobody.
         */
        expect([...UNSUPPORTED_WORKER_CLAIMS]).toEqual([
            '12,000+ Active Mistris',
            '₹38,500 Avg. Monthly',
            'Daily Instant Payouts',
            '₹5,00,000 Accidental Cover',
            '0% Commission in Month 1',
            'Complete Aadhaar KYC & Onboarding',
            'Call Helpline: 1800-FIX-MATE',
            '24/7 Desk',
            'Partner Verified',
        ])
    })

    it('renders the two figures that are split across elements in the design', () => {
        // "12,000+ Active Mistris" and "₹38,500 Avg. Monthly" are drawn as a big
        // number over a small label, so they are two elements rather than one
        // string — which is exactly the kind of thing that makes a claim easy to
        // leave behind when it is cut.
        const html = render()

        expect(html).toContain('12,000+')
        expect(html).toContain('Active Mistris')
        expect(html).toContain('₹38,500')
        expect(html).toContain('Avg. Monthly')
    })

    it('draws no tick beside "Partner Verified"', () => {
        /*
         * The design pairs the words with a tick, which is the whole claim: a
         * check that has already happened. There is no verification system for
         * any account type in this repository, so a tick would be asserting a
         * result. The words are recorded as unsupported; the tick is not drawn.
         */
        const html = render()

        expect(html).toContain('Partner Verified')
        expect(html).not.toContain('Verified ✓')
        expect(html).not.toMatch(/Partner Verified[^<]*<[^>]*>[^<]*[✓✔]/i)
    })
})

describe('the support hub', () => {
    it('draws both utility rows', () => {
        const html = render()

        expect(html).toContain('Partner Support Hub')
        expect(html).toContain('New Mistri joining FixMate?')
        // Escaped: `renderToStaticMarkup` emits `&amp;` for a bare ampersand,
        // which is the browser's DOM doing it correctly rather than a wrong
        // string in the component.
        expect(html).toContain('Complete Aadhaar KYC &amp; Onboarding')
        expect(html).toContain('Lost your registered SIM?')
        expect(html).toContain('Call Helpline: 1800-FIX-MATE')
    })

    it('makes them buttons, because a link to nothing is a 404 with no explanation', () => {
        // There is no KYC route, no SIM-replacement route and no telephony. A
        // button can say so; an anchor can only 404.
        const html = render()

        expect(html).not.toMatch(/<a[^>]*>[^<]*Aadhaar/i)
        expect(html).not.toMatch(/<a[^>]*>[^<]*Helpline/i)
    })

    it('names the mock in one list', () => {
        expect(MOCKED_FEATURES.support).toBe(
            'The support desk and helpline are not connected to anything yet.',
        )
        // Three mocks, three entries: someone reading the file learns what is
        // real without auditing handlers.
        expect(Object.keys(MOCKED_FEATURES)).toEqual(['otp', 'partnerId', 'support'])
    })
})
