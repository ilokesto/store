import { expect, it } from "vitest";
import { createStore, derived } from "../../src/index";

it("derived: callback writes an independent store -> ordinary middleware delivery stays synchronous", () => {
  const input = createStore(0);
  const view = derived(input, value => value);
  const other = createStore(0);
  const order: string[] = [];
  other.pushMiddleware((action, next) => {
    order.push("before");
    next(action);
    order.push("after");
  });
  const stopOther = other.subscribe(() => order.push("notify"));
  const stopView = view.subscribe(() => other.set(1));
  try {
    input.set(1);

    expect(order).toEqual(["before", "notify", "after"]);
  } finally {
    stopView();
    stopOther();
    view.dispose();
  }
});
