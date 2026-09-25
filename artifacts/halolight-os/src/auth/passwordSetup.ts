type SetupState = "required" | "complete";
type SetupStorage = Pick<Storage, "getItem" | "setItem">;

export function createPasswordSetupStore(
  storage: () => SetupStorage,
  project: string,
) {
  const prefix = `halolight:password-setup:${project.replace(/\/+$/, "")}:`;
  const key = (identity: string) => `${prefix}${encodeURIComponent(identity)}`;
  return {
    matches(changedKey: string | null) {
      return changedKey === null || changedKey.startsWith(prefix);
    },
    read(identity: string | null): SetupState | null {
      if (!identity) return null;
      const value = storage().getItem(key(identity));
      if (value === null || value === "required" || value === "complete")
        return value;
      throw new Error("Invalid password setup state");
    },
    require(identity: string) {
      storage().setItem(key(identity), "required");
    },
    complete(identity: string) {
      storage().setItem(key(identity), "complete");
    },
  };
}

export async function updatePasswordWithToken(
  url: string,
  publishableKey: string,
  token: string,
  userId: string,
  password: string,
  request: typeof fetch = fetch,
) {
  try {
    const response = await request(`${url.replace(/\/+$/, "")}/auth/v1/user`, {
      method: "PUT",
      credentials: "omit",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        apikey: publishableKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) throw new Error();
    const user: unknown = await response.json();
    if (
      !user ||
      typeof user !== "object" ||
      !("id" in user) ||
      user.id !== userId
    )
      throw new Error();
    // Password-only updates do not need to rewrite the shared SDK session/user cache.
  } catch {
    throw new Error("Password update failed");
  }
}
