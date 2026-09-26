/**
 * A very small runtime schema, used to check every response against a shape the
 * front end declares in advance.
 *
 * This exists instead of a validation library because the requirement is narrow:
 * confirm that a back-end response is the shape the code below this package was
 * written against, and say clearly where it stopped matching. A dependency would
 * bring a larger API surface, its own version to keep in step across four
 * applications, and nothing this package would use.
 */

export interface Schema<T> {
    readonly label: string;

    /**
     * Return the value as T, or throw a SchemaError naming the path that failed.
     */
    parse(value: unknown, path?: string): T;
}

export class SchemaError extends Error {
    constructor(
        message: string,
        readonly path: string,
    ) {
        super(path === '' ? message : `${path}: ${message}`);

        this.name = 'SchemaError';
    }
}

const at = (path: string, key: string | number): string =>
    path === '' ? String(key) : `${path}.${key}`;

const describe = (value: unknown): string => {
    if (value === null) {
        return 'null';
    }

    if (value === undefined) {
        return 'nothing';
    }

    if (Array.isArray(value)) {
        return 'an array';
    }

    return `a ${typeof value}`;
};

function schema<T>(label: string, check: (value: unknown, path: string) => T): Schema<T> {
    return {
        label,
        parse(value: unknown, path = ''): T {
            return check(value, path);
        },
    };
}

export function string(): Schema<string> {
    return schema('a string', (value, path) => {
        if (typeof value !== 'string') {
            throw new SchemaError(`expected a string, received ${describe(value)}`, path);
        }

        return value;
    });
}

export function number(): Schema<number> {
    return schema('a number', (value, path) => {
        if (typeof value !== 'number' || Number.isNaN(value)) {
            throw new SchemaError(`expected a number, received ${describe(value)}`, path);
        }

        return value;
    });
}

export function boolean(): Schema<boolean> {
    return schema('a boolean', (value, path) => {
        if (typeof value !== 'boolean') {
            throw new SchemaError(`expected a boolean, received ${describe(value)}`, path);
        }

        return value;
    });
}

export function literal<const T extends string | number | boolean>(expected: T): Schema<T> {
    return schema(`the value ${JSON.stringify(expected)}`, (value, path) => {
        if (value !== expected) {
            throw new SchemaError(`expected ${JSON.stringify(expected)}, received ${describe(value)}`, path);
        }

        return expected;
    });
}

export function array<T>(item: Schema<T>): Schema<T[]> {
    return schema(`an array of ${item.label}`, (value, path) => {
        if (!Array.isArray(value)) {
            throw new SchemaError(`expected an array, received ${describe(value)}`, path);
        }

        return value.map((entry, index) => item.parse(entry, at(path, index)));
    });
}

export function nullable<T>(inner: Schema<T>): Schema<T | null> {
    return schema(`${inner.label} or null`, (value, path) => (value === null ? null : inner.parse(value, path)));
}

/** The TypeScript type a schema validates to. */
export type Infer<S> = S extends Schema<infer T> ? T : never;

export function object<S extends Record<string, Schema<unknown>>>(shape: S): Schema<{ [K in keyof S]: Infer<S[K]> }> {
    return schema('an object', (value, path) => {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            throw new SchemaError(`expected an object, received ${describe(value)}`, path);
        }

        const record = value as Record<string, unknown>;
        const result: Record<string, unknown> = {};

        for (const [key, field] of Object.entries(shape)) {
            result[key] = field.parse(record[key], at(path, key));
        }

        return result as { [K in keyof S]: Infer<S[K]> };
    });
}
