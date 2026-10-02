import type { Discovery } from '@fixmate/api-client'

/**
 * One discovery payload, shaped exactly as `DiscoveryController` answers.
 *
 * A literal copy of the controller's own, not an idealised version: the two
 * featured technicians are the roster's first and third, the prices are the three
 * the controller writes, and the omissions are the omissions it makes. So a change
 * to the controller this screen could not cope with shows up here as a type error
 * rather than as a rendering surprise.
 *
 * ## Why `completed_jobs` repeats `review_count`
 *
 * Both are 120 and 240 here, and the field is named `completed_jobs` rather than
 * `review_count` on purpose. They are two different claims about a person — how
 * many jobs he finished, and how many people rated him — and the fixture happens
 * to make them the same number. If the endpoint had reused one name for the two,
 * a later fixture could say somebody has done 240 jobs and been rated by 240
 * people with nothing looking wrong, and a screen would have no way to tell which
 * figure it was drawing.
 *
 * ## Two featured, not three
 *
 * The controller returns the roster's first and third. The carousel has to
 * scroll, and a carousel with two wide cards is the only shape that scrolls on a
 * 360px screen; three is a list wearing a costume. That is a design decision
 * recorded in the controller, and this fixture keeps it.
 */
export const DISCOVERY: Discovery = {
    categories: [
        { id: 'plumbing', label: 'Plumbing', price_from: 149, currency: 'INR' },
        { id: 'electrical', label: 'Electrical', price_from: 129, currency: 'INR' },
        { id: 'carpentry', label: 'Carpentry', price_from: 199, currency: 'INR' },
    ],
    featured_technicians: [
        { id: 'WK-301', name: 'Ramesh Kumar', trade: 'Master Plumber', rating: 4.8, completed_jobs: 120 },
        { id: 'WK-303', name: 'Mahesh Chandra', trade: 'Master Pipe & Sanitary', rating: 4.9, completed_jobs: 240 },
    ],
}