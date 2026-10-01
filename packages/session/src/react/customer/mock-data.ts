/**
 * The mocked content behind the customer's three product screens.
 *
 * ## Why this is a module and not a prop
 *
 * Every value below describes something this repository does not have: a person
 * named Aarav, a locality, three technicians, their ratings, their review counts,
 * their base fees, a price estimate produced by an estimator that does not exist,
 * and a payment split that no payment system computes. It is one module rather
 * than three inline literals so that the moment any of it becomes real, the
 * change is visible in one place and the screens stop passing it in.
 *
 * ## The honesty record
 *
 * {@link UNSUPPORTED_CUSTOMER_CLAIMS} names every promise on these three screens
 * that no code here can keep, and a test asserts the list is complete — so a new
 * claim cannot reach a screen without somebody deciding to write it down. That is
 * the same arrangement as the customer's sign-in screen and the worker's, and it
 * exists because **a claim that cannot be substantiated is worse than no claim.**
 *
 * The two I would cut first are named here, because the others are at least
 * recognisably product copy:
 *
 * - **"₹149 Base Fee" / "₹450 Total Payable"** — a price somebody agrees to pay,
 *   broken into a service fee, an estimated labour charge and "Platform Charges".
 * - **"Every service is insured up to ₹10,000 for damages."** — an insurance
 *   product. A promise of cover is one a person may rely on when something goes
 *   wrong, and nothing here underwrites anything.
 */

/** The kinds of work the customer's dashboard offers, as the design lists them. */
export const MOCK_CATEGORIES = [
    { id: 'plumbing', label: 'Plumbing', priceFrom: 'From ₹149', tone: 'sky' },
    { id: 'electrical', label: 'Electrical', priceFrom: 'From ₹129', tone: 'amber' },
    { id: 'carpentry', label: 'Carpentry', priceFrom: 'From ₹199', tone: 'orange' },
] as const

/** The two technicians the dashboard's carousel shows, as the design draws them. */
export const MOCK_FEATURED_WORKERS = [
    { id: 'ramesh', name: 'Ramesh Kumar', trade: 'Plumber', rating: '4.8', jobs: '120 jobs' },
    { id: 'suresh', name: 'Suresh Yadav', trade: 'Electrician', rating: '4.9', jobs: '98 jobs' },
] as const

/** The booking the dashboard's tracking card is following. */
export const MOCK_ACTIVE_JOB = {
    worker: 'Ramesh Kumar',
    issue: 'Fixing kitchen sink leak',
    eta: 'ETA 18 mins',
    /**
     * The four stages the design's tracker draws, in order.
     *
     * `reached` is the index the card is drawn at: 0 is Booked, 1 is On the way,
     * 2 is In Progress, 3 is Completed. The design draws step 2 active, so that
     * is the mocked position.
     *
     * There is no job, no status column and no event that could move this — the
     * four states are a design's illustration of a lifecycle this repository does
     * not model. So the tracker is drawn at a fixed position and the position is
     * a number in a mock rather than a derived value, which is the whole of what
     * makes it a mock.
     */
    stages: ['Booked', 'On the way', 'In Progress', 'Completed'] as const,
    reached: 1,
    /**
     * The call link beside the technician, as the design draws it.
     *
     * A telephone number is not modelled anywhere — no worker table carries one
     * and no route exposes it — so this is a button that goes nowhere. It is
     * recorded rather than omitted, and see `ActiveJobCard` for why it is a
     * button that refuses instead of an anchor to a dead `tel:`.
     */
    callLabel: 'Call technician',
} as const

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

/** The technician the booking-details screen is about. */
export const MOCK_BOOKING = {
    worker: 'Ramesh Kumar',
    trade: 'Expert Plumber',
    rating: '4.8',
    service: 'Pipe Leakage Repair',
    /**
     * Three days, as the design draws them, with the first one selected.
     *
     * The design's first pill is "TODAY / 14 Oct" and the other two are "TUE /
     * 15 Oct" and "WED / 16 Oct" — which is a design that has drifted, because
     * "today" and the 14th cannot both be right on the same card. It is drawn as
     * drawn, and the contradiction is recorded below rather than silently fixed,
     * because deciding which one is true is a product question and not a
     * rendering one.
     */
    dates: [
        { weekday: 'TODAY', day: '14 Oct', selected: true },
        { weekday: 'TUE', day: '15 Oct', selected: false },
        { weekday: 'WED', day: '16 Oct', selected: false },
    ],
    /**
     * Three slots, the second selected.
     *
     * These are `<button>`s, not links, and pressing one changes nothing: there
     * is no booking, no appointment table and no way to reserve a slot. The
     * selected state is drawn from the mock. See `SlotPicker` in
     * booking-details.tsx.
     */
    times: [
        { label: '09:00 AM', selected: false },
        { label: '11:30 AM', selected: true },
        { label: '02:00 PM', selected: false },
    ],
    /** The estimate, itemised. None of it is computed by anything. */
    estimate: {
        heading: 'AI Estimated Price',
        /** The design's badge on the price card. */
        badge: 'SECURE',
        lines: [
            { label: 'Base Service Fee', amount: '₹149' },
            { label: 'Estimated Labor (45 min)', amount: '₹250' },
            { label: 'Platform Charges', amount: '₹51' },
        ],
        total: '₹450',
        totalLabel: 'Total Payable',
        footnote: 'Actual price may vary slightly based on material used.',
    },
    /**
     * Three ways to pay, the first selected.
     *
     * There is no payment integration in this repository — no gateway, no
     * checkout, no order — so these are radio inputs that select nothing and a
     * Confirm Booking button that books nothing. That is a larger gap than the
     * rest of the mock and it is the first thing to build.
     */
    paymentMethods: [
        {
            id: 'upi',
            title: 'UPI / QR / Wallets',
            note: 'Google Pay, PhonePe, Paytm',
            selected: true,
        },
        {
            id: 'card',
            title: 'Credit / Debit Cards',
            note: 'Visa, Mastercard, RuPay',
            selected: false,
        },
        {
            id: 'cash',
            title: 'Cash After Service',
            note: 'Pay directly to the worker',
            selected: false,
        },
    ],
    /** The sticky footer's two halves, as the design draws them. */
    footer: { totalLabel: 'Total', confirmLabel: 'Confirm Booking' },
} as const

/** The search the matching screen is answering. */
export const MOCK_SEARCH = {
    query: 'Plumber',
    /** The design's echo of the query, with typographic quotes. */
    searchingFor: 'Searching for “Plumber”',
    /** How many the design says were found. */
    found: '24 Found',
    /** Where the matching is said to be running. */
    area: 'Sector 48, Gurugram',
    /** The sentence describing what was matched, as the design phrases it. */
    recommendation:
        'Based on your “Leaky Pipe Under Sink” request, we matched 3 master technicians with rapid dispatch toolsets.',
    avgArrival: '22 mins',
    estimatedCost: '₹350 – ₹500',
    /**
     * The four chips the design draws, the first one selected.
     *
     * Rendered as drawn and inert: there is no ranking, no distance, no price to
     * sort by and no rating to sort on. See `FilterChips` in matching-results.tsx
     * for why that is a recorded gap rather than a silent one.
     */
    filters: [
        { label: 'AI Best Match', selected: true },
        { label: 'Near Me', selected: false },
        { label: 'Price: Low to High', selected: false },
        { label: 'Top Rated', selected: false },
    ],
} as const

/** The three technicians the matching screen lists. */
export const MOCK_MATCHES = [
    {
        id: 'ramesh',
        name: 'Ramesh Kumar',
        summary: 'Master Plumber • 12 yrs exp',
        baseFee: '₹149',
        rating: '4.8',
        reviews: '(120)',
        distance: '1.2 km',
        availability: 'Available Now',
        action: 'Book Now',
        bestMatch: true,
    },
    {
        id: 'suresh',
        name: 'Suresh Yadav',
        summary: 'Plumbing & General Fix • 8 yrs exp',
        baseFee: '₹129',
        rating: '4.6',
        reviews: '(84)',
        distance: '2.8 km',
        availability: 'Available: Today, 4:00 PM',
        action: 'View Profile',
        bestMatch: false,
    },
    {
        id: 'mahesh',
        name: 'Mahesh Chandra',
        summary: 'Master Pipe & Sanitary • 15 yrs exp',
        baseFee: '₹179',
        rating: '4.9',
        reviews: '(240)',
        distance: '1.8 km',
        availability: 'In 20 mins',
        action: 'Book Now',
        bestMatch: false,
    },
] as const

/**
 * Everything on the customer's three screens that this repository cannot keep.
 *
 * Kept beside the screens rather than inside them so the record survives the
 * screens being rewritten. A test asserts this list matches what is rendered, so
 * removing a claim from a screen without removing it here fails rather than
 * passing quietly.
 */
export const UNSUPPORTED_CUSTOMER_CLAIMS = [
    // --- identity ---
    'Hi, Aarav',
    'Koramangala, Bengaluru',
    // --- the trades on offer: a claim that FixMate does this work at all ---
    'Plumbing',
    'Electrical',
    'Carpentry',
    'Plumber',
    'Electrician',
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
    'Expert Plumber',
    'Pipe Leakage Repair',
    'Ramesh Kumar',
    'Suresh Yadav',
    'Mahesh Chandra',
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
    // --- ratings and job counts ---
    '4.8',
    '4.9',
    '4.6',
    '(120)',
    '(84)',
    '(240)',
    '120 jobs',
    '98 jobs',
    // --- the job tracker, which is a lifecycle this repository does not model ---
    'ETA 18 mins',
    'Fixing kitchen sink leak',
    'Booked',
    'On the way',
    'In Progress',
    'Completed',
    'Call technician',
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