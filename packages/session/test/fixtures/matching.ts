import type { Matching } from '@fixmate/api-client'

/**
 * One matching payload, shaped exactly as `MatchingController` answers.
 *
 * Faithful in the two ways that matter most, and both of them are things a tidier
 * fixture would have "fixed":
 *
 * - **The order is the roster's order, which is not a ranking.** Mahesh Chandra is
 *   rated highest at 4.9 and is listed last; Suresh Yadav is nearest-neither and
 *   cheapest and is in the middle. A fixture that sorted by anything would let a
 *   screen claim the endpoint ranked its results, and
 *   `MockedCustomerEndpointsTest` asserts in the other direction on the server.
 * - **`found_count` is 24 while three technicians are sent.** The design draws
 *   "24 Found" over three cards, and making the two agree would have quietly
 *   rewritten the frame. The screen therefore cannot use `found_count` to know how
 *   many cards to draw, and the test asserts it does not.
 *
 * ## Both branches of the card's action are present
 *
 * Ramesh is `available_now`, Suresh and Mahesh are not — so the screen draws
 * "Book Now" once and "View Profile" twice. A fixture where everybody was
 * available would render a screen that looks finished and has never drawn its
 * second button.
 *
 * Exactly one is badged `best_match`, which is a position the fixture puts there
 * rather than the output of a comparison. Zero badges or two would make the badge
 * mean nothing, and a screen that drew it on the first card by default would be
 * indistinguishable from one that honours the flag.
 */
export const MATCHING: Matching = {
    query: 'Plumber',
    area: 'Sector 48, Gurugram',
    found_count: 24,
    summary:
        'Based on your “Leaky Pipe Under Sink” request, we matched 3 master technicians with rapid dispatch toolsets.',
    average_arrival_minutes: 22,
    estimated_cost: { min: 350, max: 500, currency: 'INR' },
    filters: [
        { id: 'ai-best-match', label: 'AI Best Match' },
        { id: 'near-me', label: 'Near Me' },
        { id: 'price-low-high', label: 'Price: Low to High' },
        { id: 'top-rated', label: 'Top Rated' },
    ],
    technicians: [
        {
            id: 'WK-301',
            name: 'Ramesh Kumar',
            trade: 'Master Plumber',
            years_experience: 12,
            base_fee: 149,
            currency: 'INR',
            rating: 4.8,
            review_count: 120,
            distance_km: 1.2,
            availability: { label: 'Available Now', available_now: true },
            best_match: true,
        },
        {
            id: 'WK-302',
            name: 'Suresh Yadav',
            trade: 'Plumbing & General Fix',
            years_experience: 8,
            base_fee: 129,
            currency: 'INR',
            rating: 4.6,
            review_count: 84,
            distance_km: 2.8,
            availability: { label: 'Available: Today, 4:00 PM', available_now: false },
            best_match: false,
        },
        {
            id: 'WK-303',
            name: 'Mahesh Chandra',
            trade: 'Master Pipe & Sanitary',
            years_experience: 15,
            base_fee: 179,
            currency: 'INR',
            rating: 4.9,
            review_count: 240,
            distance_km: 1.8,
            availability: { label: 'In 20 mins', available_now: false },
            best_match: false,
        },
    ],
}