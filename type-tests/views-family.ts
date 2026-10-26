import { expectTypeOf } from "vitest";
import { createStore, createStoreFamily, focus } from "../src/index";
import type { DisposableReadableStore, ReadableStore, StoreFamily, WritableFocus } from "../src/index";

const parent = createStore({ user: { name: "Ada" }, count: 1 });
const name = focus(parent, state => {
  expectTypeOf(state).toEqualTypeOf<Readonly<{ user: { name: string }; count: number }>>();
  return state.user.name;
}, (state, name) => {
  expectTypeOf(state).toEqualTypeOf<{ user: { name: string }; count: number }>();
  expectTypeOf(name).toEqualTypeOf<string>();
  return { ...state, user: { ...state.user, name } };
});
expectTypeOf(name).toEqualTypeOf<WritableFocus<string>>();
name.set("Grace");
name.setState(previous => previous.toUpperCase());
name.update(previous => previous + "!");

const readable: ReadableStore<{ user: { name: string }; count: number }> = parent;
const count = focus(readable, state => state.count);
expectTypeOf(count).toEqualTypeOf<DisposableReadableStore<number>>();
expectTypeOf<"set" extends keyof typeof count ? true : false>().toEqualTypeOf<false>();
expectTypeOf<"update" extends keyof typeof count ? true : false>().toEqualTypeOf<false>();
expectTypeOf<"setState" extends keyof typeof count ? true : false>().toEqualTypeOf<false>();

const optional = createStore<{ name?: string }>({});
const optionalName = focus(optional, state => state.name,
  (state, name) => ({ ...state, name }));
expectTypeOf(optionalName).toEqualTypeOf<WritableFocus<string | undefined>>();
optionalName.set(undefined);

const callable = focus(createStore({ callback: (): number => 1 }), state => state.callback,
  (state, callback) => ({ ...state, callback }));
expectTypeOf(callable).toEqualTypeOf<WritableFocus<() => number>>();
callable.set(() => 2);
callable.update(previous => () => previous() + 1);

const nullable = createStore<{ id: number } | null>(null);
const id = focus(nullable, state => state?.id,
  (_state, id) => id === undefined ? null : { id });
expectTypeOf(id).toEqualTypeOf<WritableFocus<number | undefined>>();

const family = createStoreFamily((key: { id: number }) => createStore({ id: key.id }), {
  onCreate(instance, key) {
    expectTypeOf(instance).toEqualTypeOf<ReturnType<typeof createStore<{ id: number }>>>();
    expectTypeOf(key).toEqualTypeOf<{ id: number }>();
  },
  onRemove(instance, key) {
    expectTypeOf(instance.getState()).toEqualTypeOf<Readonly<{ id: number }>>();
    expectTypeOf(key.id).toEqualTypeOf<number>();
  },
});
expectTypeOf(family).toEqualTypeOf<
  StoreFamily<{ id: number }, ReturnType<typeof createStore<{ id: number }>>>
>();
expectTypeOf(family.get({ id: 1 }).getState()).toEqualTypeOf<Readonly<{ id: number }>>();
expectTypeOf(family.remove({ id: 1 })).toEqualTypeOf<boolean>();
expectTypeOf(family.has({ id: 1 })).toEqualTypeOf<boolean>();
expectTypeOf(family.size).toEqualTypeOf<number>();

const views = createStoreFamily((key: string) => focus(parent, state => state.user.name + key));
expectTypeOf(views.get("one")).toEqualTypeOf<DisposableReadableStore<string>>();
