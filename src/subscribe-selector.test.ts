import { describe, expect, it, vi } from "vitest";
import { Store } from "./index";

describe("Store", () => {
  describe("subscribeSelector", () => {
    it("does not immediately notify selector listeners", () => {
      // Given
      const store = new Store({ count: 0 });
      const listener = vi.fn();

      // When
      store.subscribeSelector((state) => state.count, listener);

      // Then
      expect(listener).not.toHaveBeenCalled();
    });

    it("propagates selector errors during registration without registering a listener", () => {
      // Given
      const store = new Store({ count: 0 });
      const listener = vi.fn();
      const registrationError = new Error("selector registration failed");
      const selector = () => {
        throw registrationError;
      };

      // When
      expect(() => store.subscribeSelector(selector, listener)).toThrow(
        registrationError
      );
      expect(() => store.setState({ count: 1 })).not.toThrow();

      // Then
      expect(listener).not.toHaveBeenCalled();
    });

    it("passes next and previous selections to selector listeners", () => {
      // Given
      const store = new Store({ count: 0 });
      const listener = vi.fn();
      store.subscribeSelector((state) => state.count, listener);

      // When
      store.setState({ count: 1 });

      // Then
      expect(listener).toHaveBeenCalledExactlyOnceWith(1, 0);
    });

    it("skips selector notifications when Object.is considers selections equal", () => {
      // Given
      const store = new Store({ value: Number.NaN, revision: 0 });
      const listener = vi.fn();
      store.subscribeSelector((state) => state.value, listener);

      // When
      store.setState({ value: Number.NaN, revision: 1 });

      // Then
      expect(listener).not.toHaveBeenCalled();
    });

    it("passes previous then next selections to custom equality", () => {
      // Given
      const store = new Store({ count: 1 });
      const listener = vi.fn();
      store.subscribeSelector(
        (state) => state.count,
        listener,
        (previousCount, nextCount) => previousCount === 1 && nextCount === 2
      );

      // When
      store.setState({ count: 2 });

      // Then
      expect(listener).not.toHaveBeenCalled();
    });

    it("unsubscribes selector listeners", () => {
      // Given
      const store = new Store({ count: 0 });
      const listener = vi.fn();
      const unsubscribe = store.subscribeSelector(
        (state) => state.count,
        listener
      );
      unsubscribe();

      // When
      store.setState({ count: 1 });

      // Then
      expect(listener).not.toHaveBeenCalled();
    });

    it("safely handles selector subscription mutations during notification", () => {
      // Given
      const store = new Store({ count: 0 });
      const secondListener = vi.fn();
      const thirdListener = vi.fn();
      let unsubscribeSecond: () => void = () => undefined;

      store.subscribeSelector((state) => state.count, () => {
        unsubscribeSecond();
        store.subscribeSelector((nextState) => nextState.count, thirdListener);
      });
      unsubscribeSecond = store.subscribeSelector(
        (state) => state.count,
        secondListener
      );

      // When
      store.setState({ count: 1 });

      // Then
      expect(secondListener).toHaveBeenCalledTimes(1);
      expect(thirdListener).not.toHaveBeenCalled();
    });
  });
});
