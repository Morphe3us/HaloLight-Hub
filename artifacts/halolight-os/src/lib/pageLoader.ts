export function retryablePageLoader<T>(load: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined;
  return () => {
    // Share code imports across intent and navigation, but never cache a failure.
    promise ??= Promise.resolve().then(load).catch((error: unknown) => {
      promise = undefined;
      throw error;
    });
    return promise;
  };
}
