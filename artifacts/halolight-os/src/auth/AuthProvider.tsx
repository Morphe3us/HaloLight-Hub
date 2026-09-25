import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  createSessionGuard,
  safeRedirect,
  sessionIdentity,
} from "@/lib/authSession";
import { consumeAuthCallback } from "./authCallback";
import {
  createPasswordSetupStore,
  updatePasswordWithToken,
} from "./passwordSetup";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
let client: SupabaseClient | undefined;
let verificationClient: SupabaseClient | undefined;
function getClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Authentication is not configured");
  return (client ??= createClient(url, key, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
    },
  }));
}

function getVerificationClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Authentication is not configured");
  return (verificationClient ??= createClient(url, key, {
    auth: {
      storageKey: "halolight-auth-verification",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }));
}

export type AuthUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  avatarUrl: string | null;
};
type Snapshot = {
  status: "loading" | "signed-in" | "signed-out" | "error";
  user: AuthUser | null;
  sessionKey: string | null;
  requiresPassword: boolean;
  callbackComplete?: boolean;
  errorKind?: "link" | "session";
};
type AuthContextValue = Snapshot & {
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  setPassword: (password: string) => Promise<void>;
  redirectTo: string;
};
const empty: Snapshot = {
  status: "loading",
  user: null,
  sessionKey: null,
  requiresPassword: false,
};
const AuthContext = createContext<AuthContextValue | null>(null);
const text = (value: unknown) => (typeof value === "string" ? value : null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const initialUrl = useRef(new URL(window.location.href));
  const redirectTo = useRef(
    safeRedirect(
      initialUrl.current.searchParams.get("next"),
      window.location.origin,
      base,
    ),
  );
  const guard = useRef(createSessionGuard());
  const blocked = useRef(false);
  const identityRef = useRef<string | null>(null);
  const liveSession = useRef<Session | null>(null);
  const setupStore = useMemo(
    () =>
      createPasswordSetupStore(
        () => localStorage,
        import.meta.env.VITE_SUPABASE_URL ?? "",
      ),
    [],
  );
  const callbackAttempt = useRef<ReturnType<typeof consumeAuthCallback> | null>(
    null,
  );
  const current = useRef(snapshot);
  const publish = (next: Snapshot) => {
    current.current = next;
    setSnapshot(next);
  };
  const accept = (session: Session | null) => {
    const identity = sessionIdentity(session);
    const setup = setupStore.read(identity);
    const requiresPassword =
      setup === "required" ||
      (setup === null &&
        identity === identityRef.current &&
        current.current.requiresPassword);
    const sessionKey = guard.current.update(identity);
    identityRef.current = identity;
    liveSession.current = session;
    const metadata = session?.user.user_metadata ?? {};
    publish({
      status: session ? "signed-in" : "signed-out",
      sessionKey,
      callbackComplete: current.current.callbackComplete,
      requiresPassword: !!session && requiresPassword,
      user: session
        ? {
            id: session.user.id,
            email: session.user.email ?? null,
            firstName: text(metadata.first_name),
            lastName: text(metadata.last_name),
            fullName: text(metadata.full_name) ?? text(metadata.name),
            avatarUrl: text(metadata.avatar_url),
          }
        : null,
    });
  };

  useEffect(() => {
    let alive = true;
    let booting = true;
    let latest: { session: Session | null; recovery: boolean } | undefined;
    let unsubscribe = () => {};
    const url = initialUrl.current;
    const callback = ["callback", "invite", "recovery"].some(
      (path) => url.pathname === `${base}/auth/${path}`,
    );
    if (callback) window.history.replaceState(null, "", url.pathname);
    const fail = () => {
      blocked.current = true;
      guard.current.reset();
      publish({
        ...empty,
        status: "error",
        errorKind: callback ? "link" : "session",
      });
    };
    const syncSetup = (event: StorageEvent) => {
      if (
        !alive ||
        booting ||
        blocked.current ||
        !setupStore.matches(event.key)
      )
        return;
      try {
        accept(liveSession.current);
      } catch {
        fail();
      }
    };
    window.addEventListener("storage", syncSetup);
    void (async () => {
      try {
        const supabase = getClient();
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
          if (!alive || blocked.current) return;
          try {
            const identity = sessionIdentity(session);
            if (
              event === "PASSWORD_RECOVERY" &&
              identity &&
              setupStore.read(identity) === null
            )
              setupStore.require(identity);
          } catch {
            fail();
            return;
          }
          if (booting) {
            if (event !== "INITIAL_SESSION")
              latest = { session, recovery: event === "PASSWORD_RECOVERY" };
            return;
          }
          try {
            accept(session);
          } catch {
            fail();
          }
        });
        unsubscribe = () => data.subscription.unsubscribe();
        let session: Session | null;
        if (callback) {
          callbackAttempt.current ??= (async () => {
            const passwordCallback = url.pathname !== `${base}/auth/callback`;
            const result = await consumeAuthCallback(
              passwordCallback ? getVerificationClient().auth : supabase.auth,
              url,
              () => window.history.replaceState(null, "", url.pathname),
            );
            if (result.requiresPassword) {
              const identity = sessionIdentity(result.session);
              if (!identity) throw new Error("Invalid authentication session");
              // Publish the durable requirement before the SDK persists/broadcasts this session.
              setupStore.require(identity);
              const published = await supabase.auth.setSession({
                access_token: result.session.access_token,
                refresh_token: result.session.refresh_token,
              });
              if (
                published.error ||
                sessionIdentity(published.data.session) !== identity
              )
                throw new Error("Authentication session changed");
              return { ...result, session: published.data.session! };
            }
            return result;
          })();
          const result = await callbackAttempt.current;
          session = result.session;
          if (
            latest &&
            sessionIdentity(latest.session) !== sessionIdentity(session)
          )
            throw new Error("Authentication session changed");
        } else {
          const result = await supabase.auth.getSession();
          if (result.error) throw result.error;
          session = latest ? latest.session : result.data.session;
        }
        if (!alive) return;
        if (blocked.current) return;
        accept(session);
        if (callback) publish({ ...current.current, callbackComplete: true });
        booting = false;
      } catch {
        if (alive) {
          booting = false;
          fail();
        }
      }
    })();
    return () => {
      alive = false;
      guard.current.reset();
      unsubscribe();
      window.removeEventListener("storage", syncSetup);
    };
  }, []);

  const getToken = useMemo(() => {
    const expected = snapshot.sessionKey;
    return async () => {
      if (!expected && current.current.status === "signed-out") return null;
      return guard.current.token(expected, async () => {
        const result = await getClient().auth.getSession();
        if (result.error) throw result.error;
        return result.data.session;
      });
    };
  }, [snapshot.sessionKey]);

  const value: AuthContextValue = {
    ...snapshot,
    getToken,
    redirectTo: redirectTo.current,
    async signOut() {
      blocked.current = true;
      guard.current.reset();
      publish({ ...empty, status: "signed-out" });
      try {
        const { error } = await getClient().auth.signOut({ scope: "local" });
        if (error) throw error;
        window.location.assign(`${base}/sign-in`);
      } catch {
        publish({ ...empty, status: "error", errorKind: "session" });
      }
    },
    async signIn(email, password) {
      const { error } = await getClient().auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    },
    async signInWithGoogle() {
      const { error } = await getClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${base}/auth/callback?next=${encodeURIComponent(redirectTo.current)}`,
        },
      });
      if (error) throw error;
    },
    async requestPasswordReset(email) {
      const { error } = await getClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${base}/auth/recovery`,
      });
      if (error) throw error;
    },
    async setPassword(password) {
      const expected = current.current.sessionKey;
      const identity = identityRef.current;
      const userId = current.current.user?.id;
      if (!current.current.requiresPassword) throw new Error("Invalid link");
      const token = await getToken();
      if (
        !token ||
        !identity ||
        !userId ||
        expected !== current.current.sessionKey
      )
        throw new Error("Authentication session changed");
      await updatePasswordWithToken(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        token,
        userId,
        password,
      );
      setupStore.complete(identity);
      if (expected !== current.current.sessionKey)
        throw new Error("Authentication session changed");
      accept(liveSession.current);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is required");
  return value;
}
