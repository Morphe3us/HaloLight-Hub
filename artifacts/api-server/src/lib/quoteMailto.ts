type QuoteMailtoInput = {
  id: string;
  quoteNumber: string;
  title: string;
  clientName: string;
  clientEmail: string | null;
  total: string;
  currency?: string | null;
  validUntil?: Date | null;
};

type SupportedMailLanguage =
  | "en"
  | "fr"
  | "de"
  | "es"
  | "it"
  | "nl"
  | "pl"
  | "pt";

const TEMPLATES: Record<
  SupportedMailLanguage,
  {
    locale: string;
    subjectPrefix: string;
    greeting: (name: string) => string;
    intro: (number: string, title: string) => string;
    total: string;
    validUntil: string;
    quoteLink: string;
    closing: string;
  }
> = {
  en: {
    locale: "en-US",
    subjectPrefix: "Quote",
    greeting: (name) => `Hello ${name},`,
    intro: (number, title) => `Here is your quote ${number} for ${title}.`,
    total: "Total",
    validUntil: "Valid until",
    quoteLink: "Quote link",
    closing: "Best regards,",
  },
  fr: {
    locale: "fr-FR",
    subjectPrefix: "Devis",
    greeting: (name) => `Bonjour ${name},`,
    intro: (number, title) => `Voici votre devis ${number} pour ${title}.`,
    total: "Total",
    validUntil: "Valable jusqu'au",
    quoteLink: "Lien du devis",
    closing: "Cordialement,",
  },
  de: {
    locale: "de-DE",
    subjectPrefix: "Angebot",
    greeting: (name) => `Hallo ${name},`,
    intro: (number, title) => `Hier ist Ihr Angebot ${number} für ${title}.`,
    total: "Gesamt",
    validUntil: "Gültig bis",
    quoteLink: "Angebotslink",
    closing: "Mit freundlichen Grüßen,",
  },
  es: {
    locale: "es-ES",
    subjectPrefix: "Presupuesto",
    greeting: (name) => `Hola ${name},`,
    intro: (number, title) =>
      `Aquí tiene su presupuesto ${number} para ${title}.`,
    total: "Total",
    validUntil: "Válido hasta",
    quoteLink: "Enlace del presupuesto",
    closing: "Saludos cordiales,",
  },
  it: {
    locale: "it-IT",
    subjectPrefix: "Preventivo",
    greeting: (name) => `Ciao ${name},`,
    intro: (number, title) => `Ecco il preventivo ${number} per ${title}.`,
    total: "Totale",
    validUntil: "Valido fino al",
    quoteLink: "Link al preventivo",
    closing: "Cordiali saluti,",
  },
  nl: {
    locale: "nl-NL",
    subjectPrefix: "Offerte",
    greeting: (name) => `Hallo ${name},`,
    intro: (number, title) => `Hier is uw offerte ${number} voor ${title}.`,
    total: "Totaal",
    validUntil: "Geldig tot",
    quoteLink: "Offertelink",
    closing: "Met vriendelijke groet,",
  },
  pl: {
    locale: "pl-PL",
    subjectPrefix: "Oferta",
    greeting: (name) => `Dzień dobry ${name},`,
    intro: (number, title) => `Oto oferta ${number} dla ${title}.`,
    total: "Razem",
    validUntil: "Ważna do",
    quoteLink: "Link do oferty",
    closing: "Z poważaniem,",
  },
  pt: {
    locale: "pt-PT",
    subjectPrefix: "Orçamento",
    greeting: (name) => `Olá ${name},`,
    intro: (number, title) => `Aqui está o orçamento ${number} para ${title}.`,
    total: "Total",
    validUntil: "Válido até",
    quoteLink: "Link do orçamento",
    closing: "Cumprimentos,",
  },
};

function resolveTemplate(language?: string | null) {
  const key = (language ?? "en").slice(0, 2).toLowerCase();
  return TEMPLATES[key as SupportedMailLanguage] ?? TEMPLATES.en;
}

function formatQuoteAmount(
  total: string,
  currency: string | null | undefined,
  locale: string,
): string {
  const parsed = Number(total);
  if (!Number.isFinite(parsed)) {
    return `${total}${currency ? ` ${currency}` : ""}`;
  }

  if (currency) {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
      }).format(parsed);
    } catch {
      return `${total} ${currency}`;
    }
  }

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsed);
}

function formatQuoteDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function buildQuoteMailto(options: {
  quote: QuoteMailtoInput;
  appUrl?: string;
  companyName?: string | null;
  language?: string | null;
}) {
  const { quote, appUrl, companyName, language } = options;
  const template = resolveTemplate(language);
  const quoteUrl = appUrl
    ? `${appUrl.replace(/\/$/, "")}/quotes/${quote.id}`
    : "";
  const subject = `${template.subjectPrefix} ${quote.quoteNumber} - ${quote.title}`;
  const body = [
    template.greeting(quote.clientName),
    "",
    template.intro(quote.quoteNumber, quote.title),
    `${template.total}: ${formatQuoteAmount(
      quote.total,
      quote.currency,
      template.locale,
    )}`,
    quote.validUntil
      ? `${template.validUntil}: ${formatQuoteDate(
          quote.validUntil,
          template.locale,
        )}`
      : null,
    quoteUrl ? `${template.quoteLink}: ${quoteUrl}` : null,
    "",
    template.closing,
    companyName || "",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    subject,
    mailtoUrl: `mailto:${encodeURIComponent(
      quote.clientEmail ?? "",
    )}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  };
}
