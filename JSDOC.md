# Runtime JSDoc contract

Run `pnpm lint:jsdoc`. The pinned TypeScript compiler checks every runtime
export in `src`, not just package barrels. `pnpm test:tooling` runs the checker
and its fixture tests, so `pnpm test` and Verify CI enforce the same contract.
The CLI defaults to the current working directory. For another worktree, run
`node scripts/check-jsdoc.mjs /path/to/worktree` (or `pnpm lint:jsdoc /path/to/worktree`).
Alternatively, use `node scripts/check-jsdoc.mjs --project /path/to/tsconfig.json`;
its owned source root is the `src` directory beside that configuration.
Compiler errors fail the command rather than silently losing semantic coverage.

## Covered declarations

Document exported functions, callable constants (including `createProxy`,
`forwardRef` and imported-function aliases), classes, explicit public constructors,
and own public methods, accessors or callable properties. Local export aliases and re-exports
resolve to the implementation; they do not need duplicate comments.
New exports are discovered automatically. Type-only declarations, noncallable
constants, private/protected members, inherited methods, private helpers and
anonymous callbacks are not standalone documentation targets.

A function with overloads uses one shared block on its implementation or an
overload declaration. That block covers all public overload parameter names,
owned fields and return members, not the broader implementation signature.
If a parameter is optional in a public overload, its shared tag uses brackets.
Class documentation explains the class; explicit constructors and own methods
have their own blocks. React classes without an explicit constructor document
their public `props` on the class.

## Required tags

- `@description` contains an English explanation of behavior.
- `@example` contains realistic usage, preferably a fenced `ts` or `tsx` example.
- `@param {Type} name - Description` names each actual public parameter.
  Optional/defaulted parameters use `[name]`, including nested fields beneath
  an optional parent. Rest parameters keep their declared name.
- `@returns {Type} Description` describes every value return, including `null`
  and `undefined`. A `void` or `never` signature does not require this tag.

Callable components describe one public `props` object rather than the hidden
second argument of a `forwardRef` render callback. Destructured ordinary
parameters need a meaningful root name in their positional order, such as
`options`; named parameters must match the signature exactly.
Document the root object and each project-owned field:

```ts
/**
 * @description Creates a request with a bounded retry policy.
 * @param {RequestOptions} [options] - Configuration for the request.
 * -- Retry settings apply only to transient failures.
 * @param {{ limit: number }} [options.retry] - Retry policy.
 * @param {number} [options.retry.limit] - Maximum retries.
 * @returns {{ state: { active: boolean } }} Current request state.
 * - state `{ active: boolean }` - Current lifecycle flags.
 * : state.active `boolean` - Whether the request is running.
 * @example
 * ```ts
 * const request = createRequest({ retry: { limit: 2 } });
 * ```
 */
```

Parameter description sublists start with `--`, not `-`. Returned object members
use `- member \`Type\` - Description`. Nested explanations use
`: parent.member \`Type\` - Description`. Tuple slots use numeric indexes
(`- 0 \`string\` - ...`) or declared tuple labels. Every finite owned object member
and tuple slot must be described; invented members are rejected.

Incorrect examples:

```text
@param options - Missing type annotation.
@param {Options} options - Wrong if the signature defaults options to {}.
@param {number} options.limit - Wrong if options is optional.
@param {Ref} forwardedRef - Hidden render argument, not a component prop.
@returns {Result} Current state.
- nonexistent `boolean` - Not a member of Result.
```

## Finite semantic boundary

The checker follows property declaration provenance. It includes fields declared
in this project's source, inherited project-owned fields, nested plain objects,
and finite mapped fields derived from owned types. It does not expand inherited
React/DOM/library properties, callback signatures, arrays, class instances, refs,
unconstrained type parameters or open index signatures. Cycles stop after each
type has been visited on that path. A generic owned options interface still has
its known fields checked; a field of unknown generic type stops there.

Inherited external props may be documented explicitly if their paths and
optionality are real, but are not mandatory. Type annotations must be present;
their explanatory spelling need not be textually identical to TypeScript's
printer output. Human review checks type equivalence, useful English, accurate
behavior and realistic examples. The automated language check only rejects empty
prose and clearly non-English scripts; it is not natural-language understanding.

Callable return values with project-owned controls (such as `cancel` and `flush`)
document those controls without expanding native function properties.

No source allowlist or missing-documentation exemption is supported.
