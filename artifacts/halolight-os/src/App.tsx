import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { ClerkProvider, ClerkLoading, ClerkFailed, SignIn, SignUp, Show, useClerk, useAuth } from '@clerk/react';
import { setAuthTokenGetter, useGetCurrentUser } from "@workspace/api-client-react";
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ThemeProvider } from "./components/theme-provider";
import { useTranslation } from "react-i18next";

import { AppShell } from "./components/layout/AppShell";
import { LanguageSync } from "./components/LanguageSync";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

const Landing = lazy(() => import("./pages/Landing"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Settings = lazy(() => import("./pages/Settings"));
const Admin = lazy(() => import("./pages/Admin"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Academy = lazy(() => import("./pages/Academy"));
const AcademyCourse = lazy(() => import("./pages/AcademyCourse"));
const AcademyLesson = lazy(() => import("./pages/AcademyLesson"));
const Events = lazy(() => import("./pages/Events"));
const Leads = lazy(() => import("./pages/Leads"));
const LeadDetail = lazy(() => import("./pages/LeadDetail"));
const Quotes = lazy(() => import("./pages/Quotes"));
const QuoteDetail = lazy(() => import("./pages/QuoteDetail"));
const Contracts = lazy(() => import("./pages/Contracts"));
const ContractDetail = lazy(() => import("./pages/ContractDetail"));
const Invoices = lazy(() => import("./pages/Invoices"));
const InvoiceDetail = lazy(() => import("./pages/InvoiceDetail"));
const Support = lazy(() => import("./pages/Support"));
const TicketDetail = lazy(() => import("./pages/TicketDetail"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));
const KBArticle = lazy(() => import("./pages/KBArticle"));
const KBAdmin = lazy(() => import("./pages/KBAdmin"));
const AIAssistant = lazy(() => import("./pages/AIAssistant"));
const Community = lazy(() => import("./pages/Community"));
const CommunityChannel = lazy(() => import("./pages/CommunityChannel"));
const PostDetail = lazy(() => import("./pages/PostDetail"));
const AdminAnalytics = lazy(() => import("./pages/AdminAnalytics"));
const AdminRevenue = lazy(() => import("./pages/AdminRevenue"));
const AdminClients = lazy(() => import("./pages/AdminClients"));
const Client360 = lazy(() => import("./pages/Client360"));
const AdminEquipment = lazy(() => import("./pages/AdminEquipment"));
const AdminAutomation = lazy(() => import("./pages/AdminAutomation"));
const AdminAcademy = lazy(() => import("./pages/AdminAcademy"));
const AdminResources = lazy(() => import("./pages/AdminResources"));
const AdminSearch = lazy(() => import("./pages/AdminSearch"));
const AdminTranslations = lazy(() => import("./pages/AdminTranslations"));
const AdminUploads = lazy(() => import("./pages/AdminUploads"));
const AdminAIKnowledge = lazy(() => import("./pages/AdminAIKnowledge"));
const AdminBackup = lazy(() => import("./pages/AdminBackup"));
const AdminExports = lazy(() => import("./pages/AdminExports"));
const AdminContractTemplates = lazy(() => import("./pages/AdminContractTemplates"));
const Equipment = lazy(() => import("./pages/Equipment"));
const EquipmentDetail = lazy(() => import("./pages/EquipmentDetail"));
const Consumables = lazy(() => import("./pages/Consumables"));
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

function SignedInRoutePrefetcher() {
  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) return;
    const primary = window.setTimeout(() => {
      void import("./pages/Dashboard");
      void import("./pages/Academy");
      void import("./pages/Events");
      void import("./pages/Quotes");
    }, 250);
    const secondary = window.setTimeout(() => {
      void import("./pages/Contracts");
      void import("./pages/Invoices");
      void import("./pages/Support");
      void import("./pages/Equipment");
      void import("./pages/Consumables");
      void import("./pages/Settings");
    }, 1_500);

    return () => {
      window.clearTimeout(primary);
      window.clearTimeout(secondary);
    };
  }, [isSignedIn]);

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
  const { data: user, isPending, isError, refetch } = useGetCurrentUser();
  if (isPending) return <PageFallback />;
  if (isError || !user?.isActive || user.clerkId !== userId) {
    return (
      <div role="alert" className="py-16 text-center text-sm">
        <p>{t("common.error")}</p>
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
        <AppShell>
          <Switch>
            <PageRoute path="/dashboard" component={Dashboard} />
            <PageRoute path="/academy" component={Academy} />
            <PageRoute path="/academy/:courseId/:lessonId" component={AcademyLesson} />
            <PageRoute path="/academy/:courseId" component={AcademyCourse} />
            <PageRoute path="/events" component={Events} />
            <PageRoute path="/crm/leads/:id" component={LeadDetail} />
            <PageRoute path="/crm/leads" component={Leads} />
            <PageRoute path="/quotes/:id" component={QuoteDetail} />
            <PageRoute path="/quotes" component={Quotes} />
            <PageRoute path="/contracts/:id" component={ContractDetail} />
            <PageRoute path="/contracts" component={Contracts} />
            <PageRoute path="/invoices/:id" component={InvoiceDetail} />
            <PageRoute path="/invoices" component={Invoices} />
            <PageRoute path="/support/tickets/:id" component={TicketDetail} />
            <PageRoute path="/support" component={Support} />
            <AdminPageRoute path="/kb/admin" component={KBAdmin} />
            <PageRoute path="/kb/articles/:id" component={KBArticle} />
            <PageRoute path="/kb" component={KnowledgeBase} />
            <PageRoute path="/ai" component={AIAssistant} />
            <PageRoute path="/community/posts/:id" component={PostDetail} />
            <PageRoute path="/community/:id" component={CommunityChannel} />
            <PageRoute path="/community" component={Community} />
            <PageRoute path="/notifications" component={Notifications} />
            <PageRoute path="/onboarding" component={Onboarding} />
            <PageRoute path="/settings" component={Settings} />
            <AdminPageRoute path="/admin/analytics" component={AdminAnalytics} />
            <AdminPageRoute path="/admin/revenue" component={AdminRevenue} />
            <AdminPageRoute path="/admin/clients/:id" component={Client360} />
            <AdminPageRoute path="/admin/clients" component={AdminClients} />
            <AdminPageRoute path="/admin/equipment" component={AdminEquipment} />
            <AdminPageRoute path="/admin/automation" component={AdminAutomation} />
            <AdminPageRoute path="/admin/academy" component={AdminAcademy} />
            <AdminPageRoute path="/admin/resources" component={AdminResources} />
            <AdminPageRoute path="/admin/search" component={AdminSearch} />
            <AdminPageRoute path="/admin/translations" component={AdminTranslations} />
            <AdminPageRoute path="/admin/uploads" component={AdminUploads} />
            <AdminPageRoute path="/admin/ai-knowledge" component={AdminAIKnowledge} />
            <AdminPageRoute path="/admin/backup" component={AdminBackup} />
            <AdminPageRoute path="/admin/exports" component={AdminExports} />
            <AdminPageRoute path="/admin/contract-templates" component={AdminContractTemplates} />
            <AdminPageRoute path="/admin" component={Admin} />
            <PageRoute path="/equipment/:id" component={EquipmentDetail} />
            <PageRoute path="/equipment" component={Equipment} />
            <PageRoute path="/consumables" component={Consumables} />
            <Route>
              {() => (
                <Suspense fallback={<PageFallback />}>
                  <NotFound />
                </Suspense>
              )}
            </Route>
          </Switch>
        </AppShell>
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
        <SignedInRoutePrefetcher />
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
