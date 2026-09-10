import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { ClerkProvider, ClerkLoading, ClerkFailed, SignIn, SignUp, Show, useClerk, useAuth } from '@clerk/react';
import { setAuthTokenGetter, useGetCurrentUser } from "@workspace/api-client-react";
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, useRouter, matchRoute, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ConsentGate } from "./components/ConsentGate";
import { apiErrorStatus } from "./lib/apiErrorMessage";
import { ThemeProvider } from "./components/theme-provider";
import { useTranslation } from "react-i18next";

import { AppShell } from "./components/layout/AppShell";
import { LanguageSync } from "./components/LanguageSync";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

const Landing = lazy(() => import("./pages/Landing"));
const protectedPages = [
  { path: "/dashboard", load: () => import("./pages/Dashboard"), admin: false },
  { path: "/academy", load: () => import("./pages/Academy"), admin: false },
  { path: "/academy/:courseId/:lessonId", load: () => import("./pages/AcademyLesson"), admin: false },
  { path: "/academy/:courseId", load: () => import("./pages/AcademyCourse"), admin: false },
  { path: "/events", load: () => import("./pages/Events"), admin: false },
  { path: "/crm/leads/:id", load: () => import("./pages/LeadDetail"), admin: false },
  { path: "/crm/leads", load: () => import("./pages/Leads"), admin: false },
  { path: "/quotes/:id", load: () => import("./pages/QuoteDetail"), admin: false },
  { path: "/quotes", load: () => import("./pages/Quotes"), admin: false },
  { path: "/contracts/:id", load: () => import("./pages/ContractDetail"), admin: false },
  { path: "/contracts", load: () => import("./pages/Contracts"), admin: false },
  { path: "/invoices/:id", load: () => import("./pages/InvoiceDetail"), admin: false },
  { path: "/invoices", load: () => import("./pages/Invoices"), admin: false },
  { path: "/support/tickets/:id", load: () => import("./pages/TicketDetail"), admin: false },
  { path: "/support", load: () => import("./pages/Support"), admin: false },
  { path: "/kb/admin", load: () => import("./pages/KBAdmin"), admin: true },
  { path: "/kb/articles/:id", load: () => import("./pages/KBArticle"), admin: false },
  { path: "/kb", load: () => import("./pages/KnowledgeBase"), admin: false },
  { path: "/ai", load: () => import("./pages/AIAssistant"), admin: false },
  { path: "/community/posts/:id", load: () => import("./pages/PostDetail"), admin: false },
  { path: "/community/:id", load: () => import("./pages/CommunityChannel"), admin: false },
  { path: "/community", load: () => import("./pages/Community"), admin: false },
  { path: "/notifications", load: () => import("./pages/Notifications"), admin: false },
  { path: "/onboarding", load: () => import("./pages/Onboarding"), admin: false },
  { path: "/settings", load: () => import("./pages/Settings"), admin: false },
  { path: "/admin/analytics", load: () => import("./pages/AdminAnalytics"), admin: true },
  { path: "/admin/revenue", load: () => import("./pages/AdminRevenue"), admin: true },
  { path: "/admin/clients/:id", load: () => import("./pages/Client360"), admin: true },
  { path: "/admin/clients", load: () => import("./pages/AdminClients"), admin: true },
  { path: "/admin/equipment", load: () => import("./pages/AdminEquipment"), admin: true },
  { path: "/admin/automation", load: () => import("./pages/AdminAutomation"), admin: true },
  { path: "/admin/academy", load: () => import("./pages/AdminAcademy"), admin: true },
  { path: "/admin/resources", load: () => import("./pages/AdminResources"), admin: true },
  { path: "/admin/search", load: () => import("./pages/AdminSearch"), admin: true },
  { path: "/admin/translations", load: () => import("./pages/AdminTranslations"), admin: true },
  { path: "/admin/uploads", load: () => import("./pages/AdminUploads"), admin: true },
  { path: "/admin/ai-knowledge", load: () => import("./pages/AdminAIKnowledge"), admin: true },
  { path: "/admin/backup", load: () => import("./pages/AdminBackup"), admin: true },
  { path: "/admin/exports", load: () => import("./pages/AdminExports"), admin: true },
  { path: "/admin/contract-templates", load: () => import("./pages/AdminContractTemplates"), admin: true },
  { path: "/admin", load: () => import("./pages/Admin"), admin: true },
  { path: "/equipment/:id", load: () => import("./pages/EquipmentDetail"), admin: false },
  { path: "/equipment", load: () => import("./pages/Equipment"), admin: false },
  { path: "/consumables", load: () => import("./pages/Consumables"), admin: false },
].map((route) => ({ ...route, component: lazy(route.load) }));
const NotFound = lazy(() => import("@/pages/not-found"));

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
// Development Clerk instances cannot use the FAPI proxy, even in a production build.
const clerkProxyUrl = clerkPubKey?.startsWith("pk_live_")
  ? import.meta.env.VITE_CLERK_PROXY_URL || undefined
  : undefined;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const allowPublicSignups =
  import.meta.env.DEV || import.meta.env.VITE_ALLOW_PUBLIC_SIGNUPS === "true";

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

function PageFallback() {
  const { t } = useTranslation();
  return (
    <div role="status" className="py-16 text-center text-sm text-muted-foreground">
      {t("common.loading")}
    </div>
  );
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
}

function ClerkSession({ children }: { children: ReactNode }) {
  const { getToken, userId, sessionId } = useAuth();
  const clerk = useClerk();
  const [client] = useState(() => new QueryClient({
    defaultOptions: queryClient.getDefaultOptions(),
  }));
  const [tokenReady, setTokenReady] = useState(false);

  useEffect(() => {
    let active = true;
    const assertCurrentSession = () => {
      if (!active || (clerk.user?.id ?? null) !== userId ||
          (clerk.session?.id ?? null) !== sessionId) {
        throw new Error("Authentication session changed");
      }
    };
    setAuthTokenGetter(async () => {
      assertCurrentSession();
      const token = await getToken();
      assertCurrentSession();
      return token;
    });
    setTokenReady(true);
    return () => {
      active = false;
      setAuthTokenGetter(null);
      client.clear();
    };
  }, [clerk, client, getToken, userId, sessionId]);

  // Mount queries only after the bearer-token getter is installed. Each session
  // owns its cache so late mutations cannot repopulate the next account's data.
  return tokenReady
    ? <QueryClientProvider client={client}>{children}</QueryClientProvider>
    : <PageFallback />;
}

function ClerkSessionBoundary({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { isLoaded, userId, sessionId } = useAuth();
  if (!isLoaded) {
    return (
      <>
        <ClerkLoading><PageFallback /></ClerkLoading>
        <ClerkFailed>
          <div role="alert" className="py-16 text-center text-sm">
            <p>{t("common.error")}</p>
            <button className="mt-4 underline" onClick={() => window.location.reload()}>{t("common.retry")}</button>
          </div>
        </ClerkFailed>
      </>
    );
  }
  return <ClerkSession key={JSON.stringify([userId, sessionId])}>{children}</ClerkSession>;
}

function RequestedRoutePreloader() {
  const { isSignedIn } = useAuth();
  const [location] = useLocation();
  const { parser } = useRouter();
  const page = protectedPages.find(({ path }) => matchRoute(parser, path, location)[0]);

  useEffect(() => {
    if (!isSignedIn || !page) return;
    // Load code while /users/me validates access; never mount the page or its queries.
    // A failed speculative import must not prevent lazy rendering from retrying.
    void page.load().catch(() => {});
  }, [isSignedIn, page]);

  return null;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo-hub-light-orig.png`,
  },
  variables: {
    colorPrimary: "hsl(0 0% 7%)",
    colorForeground: "hsl(0 0% 7%)",
    colorMutedForeground: "hsl(0 0% 44%)",
    colorDanger: "hsl(0 48% 57%)",
    colorBackground: "hsl(36 22% 97%)",
    colorInput: "hsl(37 24% 89%)",
    colorInputForeground: "hsl(0 0% 7%)",
    colorNeutral: "hsl(37 24% 89%)",
    fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-white dark:bg-card rounded-[16px] w-[440px] max-w-full overflow-hidden shadow-xl border border-[hsl(37,24%,89%)] dark:border-card-border",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle:
      "text-2xl font-semibold text-[hsl(0,0%,7%)] dark:text-card-foreground",
    headerSubtitle: "text-[hsl(0,0%,44%)] dark:text-muted-foreground",
    socialButtonsBlockButtonText:
      "font-medium text-[hsl(0,0%,7%)] dark:text-card-foreground",
    socialButtonsBlockButton:
      "border-[hsl(37,24%,89%)] bg-white text-[hsl(0,0%,7%)] hover:bg-[hsl(36,22%,97%)] dark:border-border dark:bg-background dark:text-card-foreground dark:hover:bg-muted",
    formFieldLabel:
      "text-sm font-medium text-[hsl(0,0%,7%)] dark:text-card-foreground",
    formFieldInput:
      "rounded-[8px] border-[hsl(37,24%,82%)] bg-white text-[hsl(0,0%,7%)] placeholder:text-[hsl(0,0%,44%)] focus:border-accent focus:ring-accent/20 dark:border-border dark:bg-background dark:text-card-foreground dark:placeholder:text-muted-foreground",
    formFieldInputShowPasswordButton:
      "text-[hsl(0,0%,44%)] dark:text-muted-foreground",
    footerActionLink:
      "font-semibold text-[hsl(0,0%,7%)] hover:text-[hsl(0,0%,18%)] dark:text-card-foreground dark:hover:text-accent",
    footerActionText: "text-[hsl(0,0%,44%)] dark:text-muted-foreground",
    dividerText: "text-sm text-[hsl(0,0%,44%)] dark:text-muted-foreground",
    identityPreviewEditButton:
      "text-[hsl(0,0%,7%)] hover:text-[hsl(0,0%,18%)] dark:text-card-foreground dark:hover:text-accent",
    formFieldSuccessText: "text-success",
    alertText: "text-destructive",
    logoBox: "flex items-center justify-center py-2",
    logoImage:
      "w-[132px] h-auto object-contain dark:brightness-0 dark:invert",
    formButtonPrimary:
      "bg-[hsl(0,0%,7%)] hover:bg-[hsl(0,0%,18%)] text-white shadow-sm transition-all dark:bg-card-foreground dark:text-background dark:hover:bg-accent",
    footerAction: "bg-[hsl(36,22%,97%)] py-4 dark:bg-background/65",
    dividerLine: "bg-[hsl(37,24%,82%)] dark:bg-border",
    alert: "bg-destructive/8 border border-destructive/20",
    otpCodeFieldInput:
      "border-[hsl(37,24%,82%)] bg-white text-[hsl(0,0%,7%)] focus:border-accent focus:ring-accent/20 dark:border-border dark:bg-background dark:text-card-foreground",
    formFieldRow: "gap-4",
    main: "gap-6",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4" data-testid="page-signin">
      <SignIn
        fallback={<PageFallback />}
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={allowPublicSignups ? `${basePath}/sign-up` : undefined}
      />
    </div>
  );
}

function SignUpPage() {
  if (!allowPublicSignups) {
    return <Redirect to="/sign-in" />;
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4" data-testid="page-signup">
      <SignUp fallback={<PageFallback />} routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Suspense fallback={<PageFallback />}>
          <Landing />
        </Suspense>
      </Show>
    </>
  );
}

function PageRoute({ component: Component, path }: { component: any, path: string }) {
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

  if (isLoading) {
    return <PageFallback />;
  }

  if (user?.role !== "admin") {
    return <Redirect to="/dashboard" />;
  }

  return (
    <Suspense fallback={<PageFallback />}>
      <Component />
    </Suspense>
  );
}

function AdminPageRoute({ component: Component, path }: { component: any, path: string }) {
  return (
    <Route path={path}>
      {() => <AdminRouteContent component={Component} />}
    </Route>
  );
}

function LocalUserGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const { signOut } = useClerk();
  const { data: user, isPending, isError, error, refetch } = useGetCurrentUser();
  if (isPending) return <PageFallback />;
  if (isError || !user?.isActive || user.clerkId !== userId) {
    const status = apiErrorStatus(error);
    const accessNotValidated = isError
      ? status === 401 || status === 403
      : !!user && (!user.isActive || user.clerkId !== userId);
    return (
      <div role="alert" className="py-16 text-center text-sm">
        <p>{t(accessNotValidated ? "common.access_not_validated" : "common.error")}</p>
        <div className="mt-4 flex justify-center gap-4">
          <button className="underline" onClick={() => void refetch()}>{t("common.retry")}</button>
          <button className="underline" onClick={() => void signOut({ redirectUrl: `${basePath}/sign-in` })}>{t("nav.sign_out")}</button>
        </div>
      </div>
    );
  }
  return children;
}

function ProtectedRoutes() {
  return (
    <>
      <Show when="signed-in">
        <LocalUserGate>
        <ConsentGate>
        <AppShell>
          <Switch>
            {protectedPages.map(({ path, component, admin }) =>
              admin
                ? <AdminPageRoute key={path} path={path} component={component} />
                : <PageRoute key={path} path={path} component={component} />
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
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={allowPublicSignups ? `${basePath}/sign-up` : undefined}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to access your account",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Get started today",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <ClerkSessionBoundary>
        <RequestedRoutePreloader />
        <LanguageSync />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route>{() => <ProtectedRoutes />}</Route>
          </Switch>
          <Toaster />
        </TooltipProvider>
      </ClerkSessionBoundary>
    </ClerkProvider>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="halolight-theme">
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
    </ThemeProvider>
  );
}

export default App;
