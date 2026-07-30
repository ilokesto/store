import { Store } from "../src/index";

class ExistingStore extends Store<{ readonly count: number }> {
  override subscribe(listener: () => void): () => void {
    return super.subscribe(listener);
  }
}
