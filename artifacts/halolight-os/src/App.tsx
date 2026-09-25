import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { AuthPage } from "./pages/Auth";
import {
  setAuthTokenGetter,
  useGetCurrentUser,
} from "@workspace/api-client-react";
import {
  Switch,
  Route,
  useLocation,
  useRouter,
  matchRoute,
  Router as WouterRouter,
  Redirect,
} from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { protectedPages } from "./lib/pageRoutes";
import { ConsentGate } from "./components/ConsentGate";
import { apiErrorStatus } from "./lib/apiErrorMessage";
import { ThemeProvider } from "./components/theme-provider";
import { useTranslation } from "react-i18next";
import { AppShell } from "./components/layout/AppShell";
import { LanguageSync } from "./components/LanguageSync";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

const Landing = lazy(() => import("./pages/Landing"));
const NotFound = lazy(() => import("@/pages/not-found"));
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function PageFallback() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="py-16 text-center text-sm text-muted-foreground"
    >
      {t("common.loading")}
    </div>
  );
}

function AuthSession({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  const [client] = useState(
    () => new QueryClient({ defaultOptions: queryClient.getDefaultOptions() }),
  );
  const [tokenReady, setTokenReady] = useState(false);
  useEffect(() => {
    let active = true;
    setAuthTokenGetter(async () => {
      if (!active) throw new Error("Authentication session changed");
      const token = await getToken();
      if (!active) throw new Error("Authentication session changed");
      return token;
    });
    setTokenReady(true);
    return () => {
      active = false;
      setAuthTokenGetter(null);
      void client.cancelQueries();
      client.clear();
    };
  }, [client, getToken]);
  // Late mutations retain only the discarded session's client.
  return tokenReady ? (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  ) : (
    <PageFallback />
  );
}

function AuthSessionBoundary({ children }: { children: ReactNode }) {
  const { status, sessionKey } = useAuth();
  if (status === "loading") return <PageFallback />;
  if (status === "error") return <AuthPage mode="error" />;
  return <AuthSession key={sessionKey ?? "signed-out"}>{children}</AuthSession>;
}

function RequestedRoutePreloader() {
  const { status, requiresPassword } = useAuth();
  const [location] = useLocation();
  const { parser } = useRouter();
  const page = protectedPages.find(
    ({ path }) => matchRoute(parser, path, location)[0],
  );
  useEffect(() => {
    if (status !== "signed-in" || requiresPassword || !page) return;
    void page.load().catch(() => {});
  }, [status, requiresPassword, page]);
  return null;
}

function HomeRedirect() {
  const { status } = useAuth();
  return status === "signed-in" ? (
    <Redirect to="/dashboard" />
  ) : (
    <Suspense fallback={<PageFallback />}>
      <Landing />
    </Suspense>
  );
}

function PageRoute({
  component: Component,
  path,
}: {
  component: any;
  path: string;
}) {
  return (
    <Route path={path}>
      {() => (
        <Suspense fallback={<PageFallback />}>
          <Component />
        </Suspense>
      )}
    </Route>
  );
}

function AdminRouteContent({ component: Component }: { component: any }) {
  const { data: user, isLoading } = useGetCurrentUser();
  if (isLoading) return <PageFallback />;
  if (user?.role !== "admin") return <Redirect to="/dashboard" />;
  return (
    <Suspense fallback={<PageFallback />}>
      <Component />
    </Suspense>
  );
}

function AdminPageRoute({
  component: Component,
  path,
}: {
  component: any;
  path: string;
}) {
  return (
    <Route path={path}>
      {() => <AdminRouteContent component={Component} />}
    </Route>
  );
}

function LocalUserGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user: authUser, signOut } = useAuth();
  const {
    data: user,
    isPending,
    isError,
    error,
    refetch,
  } = useGetCurrentUser();
  if (isPending) return <PageFallback />;
  if (
    isError ||
    !user?.isActive ||
    !authUser?.id ||
    !user.authId ||
    user.authId !== authUser.id
  ) {
    const status = apiErrorStatus(error);
    const accessNotValidated = isError
      ? status === 401 || status === 403
      : !!user;
    return (
      <div role="alert" className="py-16 text-center text-sm">
        <p>
          {t(
            accessNotValidated ? "common.access_not_validated" : "common.error",
          )}
        </p>
        <div className="mt-4 flex justify-center gap-4">
          <button className="underline" onClick={() => void refetch()}>
            {t("common.retry")}
          </button>
          <button className="underline" onClick={() => void signOut()}>
            {t("nav.sign_out")}
          </button>
        </div>
      </div>
    );
  }
  return children;
}

function ProtectedRoutes() {
  const { status, requiresPassword } = useAuth();
  if (status !== "signed-in") return <Redirect to="/sign-in" />;
  if (requiresPassword) return <Redirect to="/set-password" />;
  return (
    <LocalUserGate>
      <LanguageSync />
      <ConsentGate>
        <AppShell>
          <Switch>
            {protectedPages.map(({ path, component, admin }) =>
              admin ? (
                <AdminPageRoute key={path} path={path} component={component} />
              ) : (
                <PageRoute key={path} path={path} component={component} />
              ),
            )}
            <Route>
              {() => (
                <Suspense fallback={<PageFallback />}>
                  <NotFound />
                </Suspense>
              )}
            </Route>
          </Switch>
        </AppShell>
      </ConsentGate>
    </LocalUserGate>
  );
}

function AuthRoutes() {
  return (
    <AuthSessionBoundary>
      <RequestedRoutePreloader />
      <TooltipProvider>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?">{() => <AuthPage mode="sign-in" />}</Route>
          <Route path="/sign-up/*?">{() => <Redirect to="/sign-in" />}</Route>
          <Route path="/forgot-password">
            {() => <AuthPage mode="reset" />}
          </Route>
          <Route path="/auth/callback">
            {() => <AuthPage mode="callback" />}
          </Route>
          <Route path="/auth/invite">
            {() => <AuthPage mode="callback" />}
          </Route>
          <Route path="/auth/recovery">
            {() => <AuthPage mode="callback" />}
          </Route>
          <Route path="/set-password">
            {() => <AuthPage mode="password" />}
          </Route>
          <Route>{() => <ProtectedRoutes />}</Route>
        </Switch>
        <Toaster />
      </TooltipProvider>
    </AuthSessionBoundary>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="halolight-theme">
      <WouterRouter base={basePath}>
        <AuthProvider>
          <AuthRoutes />
        </AuthProvider>
      </WouterRouter>
    </ThemeProvider>
  );
}
