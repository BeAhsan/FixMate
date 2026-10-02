/**
 * The one piece of mocked content left behind the customer's screens, and the
 * record of everything the screens still claim that this repository cannot keep.
 *
 * ## What moved out of here, and where it went
 *
 * This module used to hold five exported literals: the service categories, the
 * featured technicians, the search the matching screen was answering, the three
 * technicians it listed, and the whole booking. **All five now come from Laravel
 * controllers** — `GET /users/discovery`, `GET /users/matching` and
 * `GET /users/bookings/{booking}/quote` — because the user's instruction was that
 * every screen be endpoint-driven, and a screen that reads a local module while
 * its siblings read endpoints is a screen whose data will never be validated
 * against anything.
 *
 * They did not drift while they were here, which is worth recording as the reason
 * it happened anyway. Two screens showing the same technician at two different
 * ratings is exactly the sort of defect a shared module *cannot* prevent once the
 * two screens have their own endpoints, and a shared fixture class in
 * `app/Http/Controllers/Customer/CustomerFixture.php` is what does prevent it
 * now. The costs went up and the risk went down.
 *
 * ## Why the trust badges stayed
 *
 * `MOCK_TRUST_BADGES` is the remainder, and it stayed for a reason rather than by
 * accident. "Verified Mistris", "Transparent Pricing" and "Job Tracking" are three
 * sentences about the business; there is no resource behind them, nothing changes
 * when they are wrong, and an endpoint returning three strings would be a network
 * round trip whose only effect is to make the marketing copy look load-bearing.
 *
 * An endpoint is for something that varies or something the server owns. These
 * vary never and are owned by nobody.
 *
 * ## The honesty record, and the half of it that cannot be walked
 *
 * {@link UNSUPPORTED_CUSTOMER_CLAIMS} names every promise these screens make that
 * no code here can keep, and two tests guard it in both directions: a claim on a
 * screen that is not in the list fails, and an entry in the list that is no longer
 * on a screen fails.
 *
 * **The list can no longer be derived from this module, and that is the point.**
 * Most of these strings are written in a PHP controller now. A record that walked
 * this file would have been trivially complete and completely blind, which is
 * worse than no record — so the strings are written down *here*, by hand, and the
 * tests render the screens and check that every one of them is really on a screen.
 *
 * That inverts the maintenance cost in the right direction: adding a claim to a
 * screen now fails a test until somebody records it, rather than the record going
 * stale in silence. Each of the three endpoint-backed screens says so on arrival
 * as well — `MockedDataNotice` — so a screenshot carries the disclosure too.
 *
 * The claims I would cut first, because the others are at least recognisably
 * product copy:
 *
 * - **"₹450 Total Payable"** — a price somebody agrees to pay, broken into a
 *   service fee, an estimated labour charge and "Platform Charges". Nothing
 *   computed any of the three.
 * - **"Every service is insured up to ₹10,000 for damages."** — an insurance
 *   product. A promise of cover is one a person may rely on when something goes
 *   wrong, and nothing here underwrites anything.
 * - **"AI matching active in Sector 48, Gurugram"** — a live status line naming a
 *   place and implying a matching run is happening now. There is no matcher, no
 *   location on any model and no scheduled work in this repository.
 */

/**
 * The three badges the dashboard's trust banner shows.
 *
 * "Verified Mistris" is a claim about a background-check process that does not
 * exist. "Transparent Pricing" is a claim about price disclosure the price card
 * then itemises. "Job Tracking" is a claim about the tracker above it. All three
 * are in {@link UNSUPPORTED_CUSTOMER_CLAIMS}.
 */
export const MOCK_TRUST_BADGES = [
    { id: 'verified', label: 'Verified Mistris' },
    { id: 'pricing', label: 'Transparent Pricing' },
    { id: 'tracking', label: 'Job Tracking' },
] as const

/**
 * Everything on the customer's screens that this repository cannot keep.
 *
 * Kept beside the screens rather than inside them so the record survives the
 * screens being rewritten — and it has survived two rewrites now, the tracking
 * card's claims moving to a controller and the rest following.
 *
 * **Every entry is asserted to be on a screen.** That is what makes this a record
 * rather than a diary: a claim struck from the markup has to be struck from here
 * in the same commit, so the list never tells the next reader that a price is
 * still on screen when it is not.
 *
 * Most entries are now strings a Laravel controller writes. They are written down
 * here anyway, which looks like duplication and is not: the controller is where
 * the claim is made, and this is where somebody has to acknowledge making it.
 */
export const UNSUPPORTED_CUSTOMER_CLAIMS = [
    // --- identity ---
    'Hi, Aarav',
    'Koramangala, Bengaluru',
    // --- the trades on offer: a claim that FixMate does this work at all ---
    'Plumbing',
    'Electrical',
    'Carpentry',
    // The query `GET /users/matching` was asked. A bare noun standing for a
    // search somebody made — and the walk below is what caught it coming back,
    // because the heading and the "Searching for…" line both print it while the
    // category labels no longer do.
    'Plumber',
    // --- the search and its results ---
    'Searching for “Plumber”',
    'AI matching active in Sector 48, Gurugram',
    'Sector 48, Gurugram',
    '24 Found',
    'Based on your “Leaky Pipe Under Sink” request, we matched 3 master technicians with rapid dispatch toolsets.',
    'AI Best Match',
    'AI BEST MATCH',
    'Near Me',
    'Price: Low to High',
    'Top Rated',
    '22 mins',
    '₹350 – ₹500',
    '1.2 km',
    '2.8 km',
    '1.8 km',
    'Available Now',
    'Available: Today, 4:00 PM',
    'In 20 mins',
    'Master Plumber • 12 yrs exp',
    'Plumbing & General Fix • 8 yrs exp',
    'Master Pipe & Sanitary • 15 yrs exp',
    // The same three trades on their own, because the discovery carousel and the
    // booking card print the trade without the years. Recorded twice on purpose:
    // the composed form is what the matching card says and the bare form is what
    // the other two say, and a reader auditing a screenshot needs to find both.
    'Master Plumber',
    'Plumbing & General Fix',
    'Master Pipe & Sanitary',
    'Expert Plumber',
    'Pipe Leakage Repair',
    'Ramesh Kumar',
    'Suresh Yadav',
    'Mahesh Chandra',
    // The technician on the booking rather than among the browseable three. He is
    // `WK-118` and no endpoint offers him for booking, which is why his absence
    // from `/matching` is a decision rather than an omission.
    'Imran Qureshi',
    // --- the bookings list ---
    // The second technician, on the one completed visit. `Sunita Deshmukh` is a
    // person who did work, described in words this repository cannot support —
    // there is no record of the visit, so the name and the date are invented.
    'Sunita Deshmukh',
    // The two status labels. A claim of the third kind from the honesty record's
    // own taxonomy: a **live status line**. "In progress" says a visit is
    // happening right now, and nothing here is happening.
    'In progress',
    'Completed',
    // The two scheduled dates. Computed from `now()` when the request is made and
    // therefore true of no particular visit at any particular time — a claim about
    // when somebody is expecting somebody else.
    '14 Nov 2026, 9:12 AM',
    '11 Nov 2026, 4:40 PM',
    // --- prices ---
    'From ₹149',
    'From ₹129',
    'From ₹199',
    '₹149',
    '₹129',
    '₹179',
    '₹250',
    '₹51',
    '₹450',
    'AI Price Estimator',
    'AI Estimated Price',
    'Base Service Fee',
    'Estimated Labor (45 min)',
    'Platform Charges',
    'Actual price may vary slightly based on material used.',
    // --- ratings and counts ---
    '4.8',
    '4.9',
    '4.6',
    '(120)',
    '(84)',
    '(240)',
    '120 jobs',
    '240 jobs',
    // --- promises about the business, not about the screen ---
    'Verified Mistris',
    'Transparent Pricing',
    'Job Tracking',
    'SECURE',
    // The three payment methods. There is no gateway, no checkout and no order in
    // this repository, so each of these is the platform saying it can take money
    // in a form it cannot take.
    'UPI / QR / Wallets',
    'Credit / Debit Cards',
    'Cash After Service',
    'Google Pay, PhonePe, Paytm',
    'Visa, Mastercard, RuPay',
    'Pay directly to the worker',
    'FixMate 30-Day Work Warranty',
    'Every service is insured up to ₹10,000 for damages.',
] as const