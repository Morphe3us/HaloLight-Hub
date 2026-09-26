import { useState, type FormEvent } from "react";
import { Link, Redirect } from "wouter";
import { useTranslation } from "react-i18next";
import { LogIn, Loader2, Mail, KeyRound } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
type Mode = "sign-in" | "sign-up" | "reset" | "callback" | "password" | "error";

export function AuthPage({ mode }: { mode: Mode }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const tr = (key: string, fallback: string) =>
    t(`auth.${key}`, { defaultValue: fallback });
  const destination = auth.requiresPassword
    ? "/set-password"
    : auth.redirectTo.slice(base.length) || "/dashboard";
  if (
    auth.status === "signed-in" &&
    (mode === "sign-in" || mode === "sign-up" ||
      (mode === "callback" && auth.callbackComplete) ||
      (mode === "password" && !auth.requiresPassword))
  )
    return <Redirect to={destination} />;
  const invalid =
    mode === "error" ||
    mode === "callback" ||
    (mode === "password" && auth.status !== "signed-in");
  const sessionError = mode === "error" && auth.errorKind !== "link";
  const title = sessionError
    ? tr("error_title", "Authentication is unavailable")
    : invalid
      ? tr("invalid_link", "This link is invalid or has expired")
      : mode === "reset"
        ? tr("reset_title", "Reset your password")
        : mode === "password"
          ? tr("password_title", "Set your password")
          : mode === "sign-up"
            ? sent ? tr("check_email_title", "Check your email") : tr("sign_up_title", "Create your account")
            : tr("sign_in_title", "Welcome back");
  const run = async (action: () => Promise<void>) => {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await action();
    } catch {
      setError(
        tr(
          "action_failed",
          "Unable to continue. Check your details or try again.",
        ),
      );
    } finally {
      setPending(false);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === "password" && password !== confirm) {
      setError(tr("password_mismatch", "Passwords do not match."));
      return;
    }
    void run(async () => {
      if (mode === "reset") {
        await auth.requestPasswordReset(email);
        setSent(true);
      } else if (mode === "sign-up") {
        await auth.signUp(email, password);
        setPassword("");
        setSent(true);
      } else if (mode === "password") await auth.setPassword(password);
      else await auth.signIn(email, password);
    });
  };
  return (
    <main
      className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10"
      data-testid="page-auth"
    >
      <section className="w-full max-w-[440px] rounded-lg border border-border bg-card p-6 shadow-xl sm:p-8">
        <Link
          href="/"
          className="mb-7 flex justify-center"
          aria-label="HaloLight Hub"
        >
          <img
            src={`${base}/logo-hub-light-orig.png`}
            alt="HaloLight Hub"
            className="h-auto w-[132px] dark:brightness-0 dark:invert"
          />
        </Link>
        <h1 className="text-center text-2xl font-semibold">{title}</h1>
        {(mode === "sign-in" || mode === "sign-up") && !sent && (
          <p className="mt-2 text-center text-sm text-muted-foreground">
            {tr("purchase_email_hint", "Use the email address used for your HaloLight purchase.")}
          </p>
        )}
        {invalid ? (
          <div className="mt-6 space-y-4 text-center">
            <p role="alert" className="text-sm text-muted-foreground">
              {sessionError
                ? tr(
                    "error_help",
                    "Please try again or contact your account administrator.",
                  )
                : tr(
                    "link_help",
                    "Request a new invitation or password reset link.",
                  )}
            </p>
            <a className="block underline" href={`${base}/sign-in`}>
              {tr("back_sign_in", "Back to sign in")}
            </a>
            <a className="block underline" href={`${base}/forgot-password`}>
              {tr("forgot_password", "Forgot password?")}
            </a>
          </div>
        ) : sent ? (
          <div className="mt-6 space-y-4 text-center">
            <p role="status" className="text-sm">
              {mode === "sign-up" ? tr("check_email_message", "Check your inbox for a confirmation link. After confirming your email, your access will be reviewed.") : tr(
                "reset_sent",
                "If an account exists for this email, you will receive a password reset link.",
              )}
            </p>
            <Link className="text-sm underline" href="/sign-in">
              {tr("back_sign_in", "Back to sign in")}
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={submit} className="mt-6 space-y-4">
              {mode !== "password" && (
                <div className="space-y-2">
                  <Label htmlFor="auth-email">{tr("email", "Email")}</Label>
                  <Input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={pending}
                  />
                </div>
              )}
              {mode !== "reset" && (
                <div className="space-y-2">
                  <Label htmlFor="auth-password">
                    {tr("password", "Password")}
                  </Label>
                  <Input
                    id="auth-password"
                    type="password"
                    autoComplete={
                      mode === "password" || mode === "sign-up" ? "new-password" : "current-password"
                    }
                    minLength={mode === "password" || mode === "sign-up" ? 8 : undefined}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={pending}
                  />
                </div>
              )}
              {mode === "password" && (
                <div className="space-y-2">
                  <Label htmlFor="auth-confirm">
                    {tr("confirm_password", "Confirm password")}
                  </Label>
                  <Input
                    id="auth-confirm"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    disabled={pending}
                  />
                </div>
              )}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                disabled={pending}
                className="w-full gap-2 whitespace-normal"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : mode === "reset" ? (
                  <Mail className="h-4 w-4 shrink-0" />
                ) : mode === "password" ? (
                  <KeyRound className="h-4 w-4 shrink-0" />
                ) : (
                  <LogIn className="h-4 w-4 shrink-0" />
                )}
                {mode === "reset"
                  ? tr("send_reset", "Send reset link")
                  : mode === "password"
                    ? tr("save_password", "Save password")
                    : mode === "sign-up" ? tr("sign_up", "Create account") : tr("sign_in", "Sign in")}
              </Button>
            </form>
            {(mode === "sign-in" || mode === "sign-up") && (
              <div className="mt-4 space-y-4 text-center">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  className="min-h-11 w-full gap-3 whitespace-normal bg-background text-foreground hover:bg-muted [&_svg]:size-5"
                  onClick={() => void run(auth.signInWithGoogle)}
                >
                  <FcGoogle aria-hidden="true" focusable="false" />
                  <span>{tr("google", "Continue with Google")}</span>
                </Button>
                {mode === "sign-in" && <Link
                  className="block text-sm underline"
                  href="/forgot-password"
                >
                  {tr("forgot_password", "Forgot password?")}
                </Link>}
                <Link className="block text-sm underline" href={mode === "sign-up" ? "/sign-in" : "/sign-up"}>
                  {mode === "sign-up" ? tr("already_registered", "Already registered? Sign in") : tr("register_link", "Create an account")}
                </Link>
              </div>
            )}
            {mode === "reset" && (
              <Link
                className="mt-4 block text-center text-sm underline"
                href="/sign-in"
              >
                {tr("back_sign_in", "Back to sign in")}
              </Link>
            )}
            {mode === "password" && (
              <Button
                variant="ghost"
                className="mt-4 w-full"
                disabled={pending}
                onClick={() => void auth.signOut()}
              >
                {t("nav.sign_out")}
              </Button>
            )}
          </>
        )}
      </section>
    </main>
  );
}
