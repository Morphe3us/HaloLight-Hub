import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ThemeProvider } from "./components/theme-provider";

import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import Onboarding from "./pages/Onboarding";
import Academy from "./pages/Academy";
import AcademyCourse from "./pages/AcademyCourse";
import AcademyLesson from "./pages/AcademyLesson";
import Events from "./pages/Events";
import Leads from "./pages/Leads";
import LeadDetail from "./pages/LeadDetail";
import Quotes from "./pages/Quotes";
import QuoteDetail from "./pages/QuoteDetail";
import Contracts from "./pages/Contracts";
import ContractDetail from "./pages/ContractDetail";
import Invoices from "./pages/Invoices";
import InvoiceDetail from "./pages/InvoiceDetail";
import Support from "./pages/Support";
import TicketDetail from "./pages/TicketDetail";
import KnowledgeBase from "./pages/KnowledgeBase";
import KBArticle from "./pages/KBArticle";
import KBAdmin from "./pages/KBAdmin";
import AIAssistant from "./pages/AIAssistant";
import Community from "./pages/Community";
import CommunityChannel from "./pages/CommunityChannel";
import PostDetail from "./pages/PostDetail";
import AdminAnalytics from "./pages/AdminAnalytics";
import AdminRevenue from "./pages/AdminRevenue";
import AdminClients from "./pages/AdminClients";
import Client360 from "./pages/Client360";
import AdminEquipment from "./pages/AdminEquipment";
import AdminAutomation from "./pages/AdminAutomation";
import Equipment from "./pages/Equipment";
import EquipmentDetail from "./pages/EquipmentDetail";
import Consumables from "./pages/Consumables";
import { AppShell } from "./components/layout/AppShell";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);
  return null;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo-hub.png`,
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
    cardBox: "bg-white rounded-[16px] w-[440px] max-w-full overflow-hidden shadow-xl border border-[hsl(37,24%,89%)]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-2xl font-semibold text-foreground",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "font-medium text-foreground",
    formFieldLabel: "text-sm font-medium text-foreground",
    footerActionLink: "font-semibold text-primary hover:text-primary/90",
    footerActionText: "text-muted-foreground",
    dividerText: "text-sm text-muted-foreground",
    identityPreviewEditButton: "text-primary hover:text-primary/90",
    formFieldSuccessText: "text-success",
    alertText: "text-destructive",
    logoBox: "flex items-center justify-center py-2",
    logoImage: "w-[132px] h-auto object-contain",
    socialButtonsBlockButton: "border-border hover:bg-muted",
    formButtonPrimary: "bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all",
    formFieldInput: "border-border focus:border-accent focus:ring-accent/20 rounded-[8px]",
    footerAction: "bg-muted/50 py-4",
    dividerLine: "bg-border",
    alert: "bg-destructive/8 border border-destructive/20",
    otpCodeFieldInput: "border-border focus:border-accent focus:ring-accent/20",
    formFieldRow: "gap-4",
    main: "gap-6",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4" data-testid="page-signin">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4" data-testid="page-signup">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
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
        <Landing />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component, path }: { component: any, path: string }) {
  return (
    <Route path={path}>
      {() => (
        <>
          <Show when="signed-in">
            <AppShell>
              <Component />
            </AppShell>
          </Show>
          <Show when="signed-out">
            <Redirect to="/" />
          </Show>
        </>
      )}
    </Route>
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
      signUpUrl={`${basePath}/sign-up`}
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
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <ProtectedRoute path="/dashboard" component={Dashboard} />
            <ProtectedRoute path="/academy" component={Academy} />
            <ProtectedRoute path="/academy/:courseId/:lessonId" component={AcademyLesson} />
            <ProtectedRoute path="/academy/:courseId" component={AcademyCourse} />
            <ProtectedRoute path="/events" component={Events} />
            <ProtectedRoute path="/crm/leads/:id" component={LeadDetail} />
            <ProtectedRoute path="/crm/leads" component={Leads} />
            <ProtectedRoute path="/quotes/:id" component={QuoteDetail} />
            <ProtectedRoute path="/quotes" component={Quotes} />
            <ProtectedRoute path="/contracts/:id" component={ContractDetail} />
            <ProtectedRoute path="/contracts" component={Contracts} />
            <ProtectedRoute path="/invoices/:id" component={InvoiceDetail} />
            <ProtectedRoute path="/invoices" component={Invoices} />
            <ProtectedRoute path="/support/tickets/:id" component={TicketDetail} />
            <ProtectedRoute path="/support" component={Support} />
            <ProtectedRoute path="/kb/admin" component={KBAdmin} />
            <ProtectedRoute path="/kb/articles/:id" component={KBArticle} />
            <ProtectedRoute path="/kb" component={KnowledgeBase} />
            <ProtectedRoute path="/ai" component={AIAssistant} />
            <ProtectedRoute path="/community/posts/:id" component={PostDetail} />
            <ProtectedRoute path="/community/:id" component={CommunityChannel} />
            <ProtectedRoute path="/community" component={Community} />
            <ProtectedRoute path="/notifications" component={Notifications} />
            <ProtectedRoute path="/onboarding" component={Onboarding} />
            <ProtectedRoute path="/settings" component={Settings} />
            <ProtectedRoute path="/admin/analytics" component={AdminAnalytics} />
            <ProtectedRoute path="/admin/revenue" component={AdminRevenue} />
            <ProtectedRoute path="/admin/clients/:id" component={Client360} />
            <ProtectedRoute path="/admin/clients" component={AdminClients} />
            <ProtectedRoute path="/admin/equipment" component={AdminEquipment} />
            <ProtectedRoute path="/admin/automation" component={AdminAutomation} />
            <ProtectedRoute path="/admin" component={Admin} />
            <ProtectedRoute path="/equipment/:id" component={EquipmentDetail} />
            <ProtectedRoute path="/equipment" component={Equipment} />
            <ProtectedRoute path="/consumables" component={Consumables} />
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
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
