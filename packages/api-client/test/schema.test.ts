import { describe, expect, it } from 'vitest'
import { array, boolean, literal, nullable, number, object, string, SchemaError } from '../src/schema'

/**
 * The response validator, tested directly. Everything above it — the fetch
 * wrapper, the operations — depends on this being able to say precisely where a
 * response stopped matching, because that message is the only clue a front-end
 * developer gets when the back end changed something.
 */

describe('a response that matches', () => {
    it('returns the value', () => {
        expect(object({ id: number() }).parse({ id: 7 })).toEqual({ id: 7 })
    })

    it('ignores fields the shape does not mention', () => {
        // Laravel adds fields over time. A front end that breaks because a new
        // one appeared would make adding one to the back end impossible.
        expect(object({ id: number() }).parse({ id: 7, extra: 'ignored' })).toEqual({ id: 7 })
    })
})

describe('a response that does not match', () => {
    it('names the field that failed', () => {
        const shape = object({
            data: object({
                user: object({ id: number(), name: string() }),
            }),
        })

        expect(() => shape.parse({ data: { user: { id: 'seven', name: 'Ahsan' } } })).toThrow(SchemaError)
        expect(() => shape.parse({ data: { user: { id: 'seven', name: 'Ahsan' } } })).toThrow(
            'data.user.id: expected a number, received a string',
        )
    })

    it('names the index of a bad array entry', () => {
        const shape = object({ abilities: array(string()) })

        expect(() => shape.parse({ abilities: ['users:*', 7] })).toThrow('abilities.1: expected a string')
    })

    it('reports a missing field rather than returning undefined', () => {
        expect(() => object({ token: string() }).parse({})).toThrow('token: expected a string, received nothing')
    })

    it('rejects a null where a value is required', () => {
        expect(() => string().parse(null)).toThrow('expected a string, received null')
    })

    it('rejects an array where an object is required', () => {
        expect(() => object({}).parse([])).toThrow('expected an object, received an array')
    })
})

describe('the combinators', () => {
    it('accepts null only where declared nullable', () => {
        expect(nullable(string()).parse(null)).toBeNull()
        expect(() => string().parse(null)).toThrow()
    })

    it('compares literals', () => {
        expect(literal('active').parse('active')).toBe('active')
        expect(() => literal('active').parse('suspended')).toThrow('expected "active", received a string')
    })

    it('rejects NaN as a number', () => {
        expect(() => number().parse(Number.NaN)).toThrow('expected a number')
    })

    it('distinguishes false from absent for booleans', () => {
        expect(boolean().parse(false)).toBe(false)
        expect(() => boolean().parse(undefined)).toThrow('expected a boolean, received nothing')
    })
})
