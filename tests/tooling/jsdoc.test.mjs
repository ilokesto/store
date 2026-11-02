import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import { checkJsdoc } from '../../scripts/check-jsdoc.mjs';

const repository = path.resolve(import.meta.dirname, '../..');
const sourceRoot = path.join(repository, 'tests/fixtures/jsdoc-virtual/src');
const options = {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  types: [],
};
const baseHost = ts.createCompilerHost(options);
const libraries = new Map();

test('declaration build: exported runtime API docs -> retains machine-consumed JSDoc tags', async () => {
  const files = (await readdir(path.join(repository, 'dist')))
    .filter(file => file.endsWith('.d.ts'));

  const declarations = await Promise.all(files.map(file =>
    readFile(path.join(repository, 'dist', file), 'utf8')));

  assert.ok(declarations.length > 0);
  for (const source of declarations) {
    assert.match(source, /@description\b/);
    assert.match(source, /@example\b/);
  }
});

// A virtual external framework keeps provenance tests independent of runtime dependencies.
const externalFramework = `
declare namespace React {
  type ReactNode = JSX.Element | string | number | null;
  type Ref<T> = ((instance: T | null) => void) | { current: T | null } | null;
  type EffectCallback = () => void | (() => void);
  type DependencyList = readonly unknown[];
}
declare namespace JSX {
  interface Element { readonly element: unique symbol }
  interface IntrinsicElements { div: { children?: React.ReactNode; ref?: React.Ref<HTMLDivElement> } }
}
declare module 'react' {
  export type ReactNode = React.ReactNode;
  export interface HTMLAttributes<T> { id?: string; title?: string }
  export function forwardRef<T, P>(render: (props: P, ref: React.Ref<T>) => React.ReactNode):
    (props: P & { ref?: React.Ref<T> }) => React.ReactNode;
  export function useEffect(effect: React.EffectCallback, deps?: React.DependencyList): void;
  export function useLayoutEffect(effect: React.EffectCallback, deps?: React.DependencyList): void;
}
declare module 'react/jsx-runtime' {
  export { JSX };
}
`;

function inspect(source, additionalFiles = {}) {
  const files = new Map(Object.entries({ '../external.d.ts': externalFramework, 'api.tsx': source, ...additionalFiles })
    .map(([name, contents]) => [path.join(sourceRoot, name), contents]));
  const host = {
    ...baseHost,
    fileExists: file => files.has(file) || baseHost.fileExists(file),
    readFile: file => files.get(file) ?? baseHost.readFile(file),
    directoryExists: directory => directory.startsWith(sourceRoot) || baseHost.directoryExists(directory),
    getSourceFile(file, languageVersion, onError) {
      if (files.has(file)) {
        return ts.createSourceFile(file, files.get(file), languageVersion, true);
      }
      if (!libraries.has(file)) {
        libraries.set(file, baseHost.getSourceFile(file, languageVersion, onError));
      }
      return libraries.get(file);
    },
  };
  const program = ts.createProgram([...files.keys()], options, host);
  const errors = ts.getPreEmitDiagnostics(program);
  assert.equal(errors.length, 0, errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'));
  return checkJsdoc(program, { sourceRoot });
}

const optionsSource = `
interface RequestOptions {
  retry?: { limit: number; strategy?: { fast: boolean } };
  onComplete?: () => void;
  items?: Array<{ id: string }>;
  target?: HTMLElement;
}
/**
 * @description Builds a request with bounded retry behavior.
 * @param {RequestOptions} [options] - Request settings.
 * -- Retry settings apply to temporary failures.
 * @param {{ limit: number; strategy?: { fast: boolean } }} [options.retry] - Retry policy.
 * @param {number} [options.retry.limit] - Retry limit.
 * @param {{ fast: boolean }} [options.retry.strategy] - Retry strategy.
 * @param {boolean} [options.retry.strategy.fast] - Whether immediate retries are allowed.
 * @param {() => void} [options.onComplete] - Completion callback.
 * @param {Array<{ id: string }>} [options.items] - Request items.
 * @param {HTMLElement} [options.target] - Request target.
 * @returns {{ state: { active: boolean } }} Current lifecycle state.
 * - state \`{ active: boolean }\` - Lifecycle flags.
 * : state.active \`boolean\` - Whether work is active.
 * @example
 * const request = createRequest({ retry: { limit: 2 } });
 */
export function createRequest(options: RequestOptions = {}) {
  return { state: { active: Boolean(options.target) } };
}
`;

test('checkJsdoc: owned nested objects and optional ancestors -> accepts complete docs without expanding external surfaces', () => {
  const diagnostics = inspect(optionsSource);

  assert.deepEqual(diagnostics, []);
});

for (const [scenario, before, after, code] of [
  ['a missing nested field', ' * @param {number} [options.retry.limit] - Retry limit.\n', '', 'PARAM_MISSING'],
  ['a renamed public parameter', 'createRequest(options: RequestOptions = {})', 'createRequest(settings: RequestOptions = {})', 'PARAM_MISSING'],
  ['an optional ancestor without brackets', '[options.retry.limit]', 'options.retry.limit', 'PARAM_OPTIONAL'],
  ['an invented field', '[options.retry.limit]', '[options.retry.maximum]', 'PARAM_UNKNOWN'],
  ['a missing parameter type', '{number} [options.retry.limit]', '[options.retry.limit]', 'PARAM_TYPE'],
  ['a missing description tag', '@description', '@summary', 'DESCRIPTION'],
  ['a missing example tag', '@example', '@usage', 'EXAMPLE'],
  ['a single-dash parameter sublist', '-- Retry settings', '- Retry settings', 'PARAM_SUBLIST'],
  ['a missing return type', '@returns {{ state: { active: boolean } }}', '@returns', 'RETURN_TYPE'],
  ['a missing nested return member', ' * : state.active `boolean` - Whether work is active.\n', '', 'RETURN_MEMBER_MISSING'],
  ['a wrong nested return marker', ': state.active', '- state.active', 'RETURN_MEMBER_FORMAT'],
  ['an invented return member', ': state.active', ': state.finished', 'RETURN_MEMBER_UNKNOWN'],
]) {
  test(`checkJsdoc: ${scenario} -> rejects the changed contract`, () => {
    let source = optionsSource.replace(before, after);
    if (scenario === 'a renamed public parameter') {
      source = source.replace('Boolean(options.target)', 'Boolean(settings.target)');
    }

    const diagnostics = inspect(source);

    assert.ok(diagnostics.some(diagnostic => diagnostic.code === code), JSON.stringify(diagnostics));
  });
}

test('checkJsdoc: newly added nested signature field -> requires documentation without a manifest update', () => {
  const source = optionsSource.replace('limit: number; strategy?', 'limit: number; delay?: number; strategy?');

  const diagnostics = inspect(source);

  assert.ok(diagnostics.some(diagnostic => diagnostic.code === 'PARAM_MISSING' && diagnostic.message.includes('options.retry.delay')));
});

const componentsSource = `
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
interface SharedProps { active?: boolean }
interface ViewProps extends HTMLAttributes<HTMLDivElement>, SharedProps {
  settings: { label: string };
  children?: ReactNode;
}
function createProxy<T>(base: T): T { return base; }
function BaseView(props: ViewProps) { return <div>{props.settings.label}</div>; }
/**
 * @description Renders a named view with optional activity state.
 * @param {ViewProps} props - Public view properties.
 * @param {boolean} [props.active] - Whether the view is active.
 * @param {{ label: string }} props.settings - Display settings.
 * @param {string} props.settings.label - Display label.
 * @param {ReactNode} [props.children] - Nested content.
 * @returns {ReactNode} The view element.
 * @example
 * <ProxyView settings={{ label: 'Summary' }} />
 */
export const ProxyView = createProxy(BaseView);
/**
 * @description Forwards its element reference while rendering a named view.
 * @param {ViewProps} props - Public view properties.
 * @param {boolean} [props.active] - Whether the view is active.
 * @param {{ label: string }} props.settings - Display settings.
 * @param {string} props.settings.label - Display label.
 * @param {ReactNode} [props.children] - Nested content.
 * @param {React.Ref<HTMLDivElement>} [props.ref] - Forwarded element reference.
 * @returns {ReactNode} The view element.
 * @example
 * <ForwardView settings={{ label: 'Summary' }} />
 */
export const ForwardView = forwardRef<HTMLDivElement, ViewProps>((props, forwardedRef) =>
  <div ref={forwardedRef}>{props.settings.label}</div>);
`;

test('checkJsdoc: proxy and forwardRef values -> uses public props and owned inherited fields', () => {
  const diagnostics = inspect(componentsSource);

  assert.deepEqual(diagnostics, []);
});

test('checkJsdoc: a hidden forwardRef callback argument in docs -> rejects it as a public parameter', () => {
  const source = componentsSource.replace('[props.ref]', '[forwardedRef]');

  const diagnostics = inspect(source);

  assert.ok(diagnostics.some(diagnostic => diagnostic.code === 'PARAM_UNKNOWN' && diagnostic.message.includes('forwardedRef')));
});

test('checkJsdoc: callable aliases of external functions -> checks aliased public signature', () => {
  const source = `
import { useEffect, useLayoutEffect } from 'react';
/**
 * @description Selects an effect suitable for the current rendering environment.
 * @param {React.EffectCallback} effect - Effect setup callback.
 * @param {React.DependencyList} [deps] - Effect dependencies.
 * @example
 * useSafeEffect(() => subscribe(), []);
 */
export const useSafeEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
`;

  const diagnostics = inspect(source);

  assert.deepEqual(diagnostics, []);
  assert.ok(inspect(source.replace(' * @param {React.DependencyList} [deps] - Effect dependencies.\n', ''))
    .some(diagnostic => diagnostic.code === 'PARAM_MISSING' && diagnostic.message.includes('deps')));
});

const classSource = `
/**
 * @description Tracks a mutable numeric counter.
 * @example
 * const counter = new Counter(1);
 */
export class Counter {
  /**
   * @description Creates a counter with an initial value.
   * @param {number} [initial] - Initial counter value.
   * @example
   * const counter = new Counter();
   */
  constructor(private initial = 0) {}
  private internal() { return 0; }
  protected inheritedHelper() { return 0; }
  #hidden() { return 0; }
  /**
   * @description Adds a value and returns the new counter.
   * @param {number} amount - Increment size.
   * @returns {number} Updated counter.
   * @example
   * new Counter().add(2);
   */
  add(amount: number) { return this.initial += amount; }
  /**
   * @description Resets the counter to its initial state.
   * @example
   * new Counter().reset();
   */
  reset = (): void => { this.initial = 0; };
  /**
   * @description Reports whether a value can be counted.
   * @param {number} candidate - Value to inspect.
   * @returns {boolean} Whether the value is finite.
   * @example
   * Counter.accepts(1);
   */
  static accepts(candidate: number) { return Number.isFinite(candidate); }
}
`;

test('checkJsdoc: a public class with own methods and a constructor -> covers public members and skips private helpers', () => {
  const diagnostics = inspect(classSource);

  assert.deepEqual(diagnostics, []);
});

test('checkJsdoc: a new own class method -> discovers missing docs', () => {
  const source = classSource.replace('private internal()', 'public internal()');

  const diagnostics = inspect(source);

  assert.ok(diagnostics.some(diagnostic => diagnostic.code === 'JSDOC_MISSING' && diagnostic.message.includes('Counter.internal')));
});

test('checkJsdoc: public accessors -> checks getter returns and setter parameters', () => {
  const source = classSource.replace(
    '  private internal() { return 0; }',
    `  /**
   * @description Reads the current counter value.
   * @returns {number} Current count.
   * @example
   * const count = new Counter().value;
   */
  get value() { return this.initial; }
  /**
   * @description Replaces the current counter value.
   * @param {number} value - New counter value.
   * @example
   * const counter = new Counter(); counter.value = 3;
   */
  set value(value: number) { this.initial = value; }`,
  );

  assert.deepEqual(inspect(source), []);
  assert.ok(inspect(source.replace('   * @returns {number} Current count.\n', ''))
    .some(diagnostic => diagnostic.code === 'RETURN_MISSING'));
  assert.ok(inspect(source.replace('   * @param {number} value - New counter value.\n', ''))
    .some(diagnostic => diagnostic.code === 'PARAM_MISSING'));
});

const overloadSource = `
/**
 * @description Formats a scalar value with an optional prefix.
 * @param {number | string} value - Value to format.
 * @param {string} [prefix] - Optional text prefix.
 * @returns {string} Formatted text.
 * @example
 * format(1, 'Count: ');
 */
export function format(value: number): string;
export function format(value: string, prefix?: string): string;
export function format(value: number | string, prefix = ''): string { return prefix + value; }
`;

test('checkJsdoc: overloaded functions -> checks all public signatures using one shared block', () => {
  const diagnostics = inspect(overloadSource);

  assert.deepEqual(diagnostics, []);
});

test('checkJsdoc: a new parameter on a public overload -> detects signature drift', () => {
  const source = overloadSource
    .replace('value: string, prefix?: string', 'value: string, prefix?: string, suffix?: string')
    .replace("value: number | string, prefix = ''", "value: number | string, prefix = '', suffix = ''");

  const diagnostics = inspect(source);

  assert.ok(diagnostics.some(diagnostic => diagnostic.code === 'PARAM_MISSING' && diagnostic.message.includes('suffix')));
});

const tupleSource = `
/**
 * @description Returns the current label and a reset action.
 * @returns {[label: string, actions: { reset: () => void }]} Current label controls.
 * - label \`string\` - Current label.
 * - actions \`{ reset: () => void }\` - Available actions.
 * : 1.reset \`() => void\` - Restores the initial label.
 * @example
 * const [label, actions] = readLabel();
 */
export function readLabel(): [label: string, actions: { reset: () => void }] {
  return ['Ready', { reset() {} }];
}
`;

test('checkJsdoc: labeled tuple returns -> requires each slot and nested owned member', () => {
  const diagnostics = inspect(tupleSource);

  assert.deepEqual(diagnostics, []);
  assert.ok(inspect(tupleSource.replace(' * - label `string` - Current label.\n', ''))
    .some(diagnostic => diagnostic.code === 'RETURN_MEMBER_MISSING'));
});

test('checkJsdoc: a new export in a non-barrel source file -> discovers it while skipping type-only symbols and constants', () => {
  const diagnostics = inspect(`
export type Callback = () => void;
export interface Callable { (): void }
export const VERSION = '1.3.0';
const privateHelper = () => 1;
`, { 'new-api.ts': 'export const undocumented = () => 1;' });

  assert.deepEqual(diagnostics.map(diagnostic => diagnostic.code), ['JSDOC_MISSING']);
  assert.ok(diagnostics[0].file.endsWith('new-api.ts'));
});

test('checkJsdoc: re-exported and locally aliased implementations -> checks the implementation once', () => {
  const source = optionsSource.replace('export function createRequest', 'function createRequest')
    + '\nexport { createRequest as request };';

  const diagnostics = inspect(source, { 'index.ts': "export { request } from './api';" });

  assert.deepEqual(diagnostics, []);
  assert.equal(inspect(source.replace('@description', '@summary'), { 'index.ts': "export { request } from './api';" })
    .filter(diagnostic => diagnostic.code === 'DESCRIPTION').length, 1);
});

test('checkJsdoc: cyclic owned fields and generic values -> checks finite fields without infinite expansion', () => {
  const source = `
interface Options<T> { value: T; next?: Options<T> }
/**
 * @description Reads a value from a linked configuration.
 * @param {Options<T>} options - Linked configuration.
 * @param {T} options.value - Stored value.
 * @param {Options<T>} [options.next] - Next configuration.
 * @returns {T} Stored value.
 * @example
 * readValue({ value: 1 });
 */
export function readValue<T>(options: Options<T>): T { return options.value; }
`;

  const diagnostics = inspect(source);

  assert.deepEqual(diagnostics, []);
});

test('checkJsdoc: destructured ordinary and component parameters -> accepts meaningful roots and canonical props', () => {
  const source = `
interface Options { count: number }
/**
 * @description Reads a configured count.
 * @param {Options} options - Count configuration.
 * @param {number} options.count - Configured count.
 * @returns {number} Current count.
 * @example
 * readCount({ count: 2 });
 */
export function readCount({ count }: Options) { return count; }
/**
 * @description Renders a configured count.
 * @param {Options} props - Counter properties.
 * @param {number} props.count - Rendered count.
 * @returns {React.ReactNode} Counter element.
 * @example
 * <Counter count={2} />
 */
export function Counter({ count }: Options) { return <div>{count}</div>; }
`;

  const diagnostics = inspect(source);

  assert.deepEqual(diagnostics, []);
});

test('checkJsdoc: callable return controls -> validates owned properties without expanding native functions', () => {
  const source = `
interface Controlled {
  (): void;
  cancel(): void;
  flush(): number | undefined;
}
/**
 * @description Creates a callback with explicit cancellation and flushing.
 * @example
 * const callback = createControlled(); callback.cancel();
 * @returns {Controlled} A controlled callback containing:
 * - cancel \`() => void\` - Cancels pending work.
 * - flush \`() => number | undefined\` - Flushes pending work.
 */
export function createControlled(): Controlled {
  return Object.assign(() => {}, { cancel() {}, flush() { return 1; } });
}`;

  assert.deepEqual(inspect(source), []);
  assert.ok(inspect(source.replace(' * - cancel \`() => void\` - Cancels pending work.\n', ''))
    .some(diagnostic => diagnostic.code === 'RETURN_MEMBER_MISSING'));
  assert.ok(inspect(source.replace(' * - cancel \`() => void\`', ' * - reset \`() => void\`'))
    .some(diagnostic => diagnostic.code === 'RETURN_MEMBER_UNKNOWN'));
});

test('checkJsdoc CLI: a selected worktree and current directory -> checks that source root and returns failing status', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'utilinent-jsdoc-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, types: [] },
    include: ['src'],
  }));
  await writeFile(path.join(root, 'src/api.ts'), 'export const missingDocs = () => 1;');
  const script = path.join(repository, 'scripts/check-jsdoc.mjs');

  const selected = spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
  const current = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  const project = spawnSync(process.execPath, [script, '--project', path.join(root, 'tsconfig.json')], { encoding: 'utf8' });

  for (const result of [selected, current, project]) {
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /\[JSDOC_MISSING\]/);
    assert.match(result.stderr, /missingDocs/);
  }
});
