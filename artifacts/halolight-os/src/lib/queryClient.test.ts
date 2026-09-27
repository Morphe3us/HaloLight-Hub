import test from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import { queryClient } from "./queryClient";

function client() {
  return new QueryClient({ defaultOptions: queryClient.getDefaultOptions() });
}

for (const status of [401, 403, 428]) {
  test(`${status} reaches the query error state on the first response`, async () => {
    const queries = client();
    const error = Object.assign(new Error("Access fixture"), { status });
    let attempts = 0;
    const failures: number[] = [];
    const unsubscribe = queries.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "failed") {
        failures.push(event.query.state.fetchFailureCount);
      }
    });
    try {
      await assert.rejects(queries.fetchQuery({
        queryKey: ["protected", status],
        retryDelay: 0,
        queryFn: async () => { attempts++; throw error; },
      }), (received) => received === error);
      assert.equal(attempts, 1);
      assert.deepEqual(failures, [], "must not enter the retry/backoff state");
      assert.equal(queries.getQueryState(["protected", status])?.status, "error");
    } finally {
      unsubscribe();
      queries.clear();
    }
  });
}

test("transient HTTP and transport failures retain exactly one retry", async () => {
  const queries = client();
  try {
    for (const status of [408, 429, 500, 503, undefined]) {
      let attempts = 0;
      const error = Object.assign(new Error("Transient fixture"), { status });
      await assert.rejects(queries.fetchQuery({
        queryKey: ["transient", status], retryDelay: 0,
        queryFn: async () => { attempts++; throw error; },
      }), (received) => received === error);
      assert.equal(attempts, 2);
    }
  } finally {
    queries.clear();
  }
});

test("a transient failure can recover on its retry", async () => {
  const queries = client();
  let attempts = 0;
  try {
    const result = await queries.fetchQuery({
      queryKey: ["recover"], retryDelay: 0,
      queryFn: async () => {
        if (++attempts === 1) throw new Error("Temporary network failure");
        return "recovered";
      },
    });
    assert.equal(result, "recovered");
    assert.equal(attempts, 2);
  } finally {
    queries.clear();
  }
});

test("revoked cached access reports an error immediately and manual retry can recover", async () => {
  const queries = client();
  const queryKey = ["/api/users/me"];
  queries.setQueryData(queryKey, { isActive: true });
  let attempts = 0;
  const error = Object.assign(new Error("Revoked access"), { status: 403 });
  try {
    await assert.rejects(queries.fetchQuery({
      queryKey, staleTime: 0, retryDelay: 0,
      queryFn: async () => { attempts++; throw error; },
    }), (received) => received === error);
    assert.equal(attempts, 1);
    assert.equal(queries.getQueryState(queryKey)?.status, "error");
    assert.equal(queries.getQueryState(queryKey)?.error, error);
    await queries.fetchQuery({
      queryKey, staleTime: 0,
      queryFn: async () => { attempts++; return { isActive: true }; },
    });
    assert.equal(attempts, 2);
    assert.equal(queries.getQueryState(queryKey)?.status, "success");
  } finally {
    queries.clear();
  }
});

test("query cache freshness and per-query retry overrides are unchanged", async () => {
  const queries = client();
  const defaults = queries.getDefaultOptions().queries!;
  assert.equal(defaults.staleTime, 5 * 60_000);
  assert.equal(defaults.gcTime, 30 * 60_000);
  assert.equal(defaults.refetchOnWindowFocus, false);
  let attempts = 0;
  try {
    await assert.rejects(queries.fetchQuery({
      queryKey: ["explicit-no-retry"], retry: false,
      queryFn: async () => { attempts++; throw new Error("Offline"); },
    }));
    assert.equal(attempts, 1);
  } finally {
    queries.clear();
  }
});
