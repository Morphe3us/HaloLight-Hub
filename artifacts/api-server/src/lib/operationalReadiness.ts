type Environment = Readonly<Record<string, string | undefined>>;
type ConfigurationStatus = "disabled" | "misconfigured" | "configured_unverified";

function present(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function validHttpsUrl(value: string | undefined, originOnly = false): boolean {
  if (!present(value)) return false;
  try {
    const url = new URL(value!);
    return url.protocol === "https:" && !url.username && !url.password &&
      (!originOnly || (url.pathname === "/" && !url.search && !url.hash));
  } catch { return false; }
}

function configurationStatus(enabled: boolean, valid: boolean): ConfigurationStatus {
  return !enabled ? "disabled" : valid ? "configured_unverified" : "misconfigured";
}

// Configuration projection only: never instantiate/reset the process-lifetime AI provider.
export function operationalReadiness(env: Environment) {
  const forced = env.AI_PROVIDER?.trim().toLowerCase();
  const openai = present(env.OPENAI_API_KEY);
  const claude = present(env.ANTHROPIC_API_KEY);
  const providerSelectionValid = !forced || ["openai", "claude", "mock"].includes(forced);
  const selected = forced || (openai ? "openai" : claude ? "claude" : env.NODE_ENV === "production" ? "" : "mock");
  const demoMode = selected === "mock";
  const realProviderSelected = selected === "openai" || selected === "claude";
  const selectedCredentialPresent = selected === "openai" ? openai : selected === "claude" ? claude : false;
  const aiStatus: ConfigurationStatus | "demo" = !providerSelectionValid ? "misconfigured"
    : demoMode ? "demo"
    : realProviderSelected ? configurationStatus(true, selectedCredentialPresent) : "disabled";

  const enabled = env.SUPPORT_MAIL_ENABLED === "true";
  const supportedProvider = env.SUPPORT_MAIL_PROVIDER === "resend";
  const credentialPresent = present(env.RESEND_API_KEY);
  // Match buildTicketMail's sender/origin validation, without rendering or sending mail.
  const senderValid = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(env.SUPPORT_MAIL_FROM ?? "");
  const hubOriginValid = validHttpsUrl(env.HUB_PUBLIC_URL, true);
  const legalEnabled = env.LEGAL_CONSENT_ENABLED === "true";
  const versionsPresent = present(env.LEGAL_TERMS_VERSION) && present(env.LEGAL_PRIVACY_VERSION);
  const urlsValid = validHttpsUrl(env.LEGAL_TERMS_URL) && validHttpsUrl(env.LEGAL_PRIVACY_URL);

  return {
    configurationOnly: true as const,
    externalChecksPerformed: false as const,
    ai: { status: aiStatus, providerSelectionValid, selectedCredentialPresent, demoMode, realProviderSelected },
    mail: {
      status: configurationStatus(enabled, supportedProvider && credentialPresent && senderValid && hubOriginValid),
      enabled, supportedProvider, credentialPresent, senderValid, hubOriginValid,
    },
    legal: { status: configurationStatus(legalEnabled, versionsPresent && urlsValid), enabled: legalEnabled, versionsPresent, urlsValid },
  };
}
