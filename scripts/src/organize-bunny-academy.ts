import {
  courseModules,
  courses,
  db,
  lessons,
  pool,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

const LANGS = ["en", "fr", "de", "nl", "es", "it", "pt", "pl"] as const;
type Lang = (typeof LANGS)[number];
type LocaleText = Record<Lang, string>;

type VideoAsset = {
  embedUrl: string;
  thumbnailUrl: string;
  previewUrl: string;
  videoId: string;
};

type BunnyVideo = {
  guid: string;
  title: string;
  collectionId: string;
  length: number;
  status: number;
};

type LessonKey =
  | "business-intro"
  | "business-1-1"
  | "business-1-2"
  | "business-2-1"
  | "business-2-2"
  | "business-3-1"
  | "business-3-2"
  | "business-4-1"
  | "business-4-2"
  | "business-5-1"
  | "business-5-2"
  | "business-5-3"
  | "business-5-4"
  | "business-6-1"
  | "business-6-2"
  | "business-7-1"
  | "business-7-2"
  | "business-8-1"
  | "business-8-2"
  | "business-conclusion"
  | "design-intro"
  | "design-canva-basics"
  | "design-inspiration"
  | "design-professional-templates"
  | "design-template-10x15"
  | "design-template-strip"
  | "design-special-events"
  | "design-next-level";

type CourseKey = "business" | "design";
type ModuleKey =
  | "business-start"
  | "business-market-model"
  | "business-positioning"
  | "business-offer"
  | "business-pricing"
  | "business-acquisition"
  | "business-brand-trust"
  | "business-operations"
  | "business-scaling"
  | "business-next-steps"
  | "design-foundations"
  | "design-canva-templates"
  | "design-growth";

type LessonPlan = {
  course: CourseKey;
  module: ModuleKey;
  order: number;
};

type GroupedLesson = {
  key: LessonKey;
  titles: LocaleText;
  durationSeconds: number;
  videoAssets: Record<Lang, VideoAsset>;
};

const COLLECTION_ID_TO_LANG: Record<string, Lang> = {
  "a8f1d88d-d78b-40a3-8110-3b573a1603e2": "de",
  "3e3b7105-0fd0-4f48-a223-9b0842e4e3e5": "es",
  "dba3c601-c795-43a6-9ee7-f48365a0e4de": "pt",
  "c415e75f-4c65-4314-bec2-fa968e1397ff": "pl",
  "50ecaca6-0542-4c91-af26-d3006fa02b08": "it",
  "630999cb-1df6-43f2-8cff-dc49950be601": "en",
  "b7b1ee25-e810-4784-bf85-3a476114ad1a": "nl",
  "476e5f64-87b2-4dee-8a80-5ef6cc544378": "fr",
};

const LEGACY_SEED_COURSE_SLUGS = [
  "getting-started",
  "advanced-features",
  "business-growth",
] as const;

const COURSE_DEFS: Record<
  CourseKey,
  {
    slug: string;
    title: LocaleText;
    description: LocaleText;
    category: string;
    level: "beginner" | "intermediate" | "advanced";
    order: number;
    isFeatured: boolean;
  }
> = {
  business: {
    slug: "photobooth-business-mastery",
    title: {
      en: "Photobooth Business Mastery",
      fr: "Maîtrise business photobooth",
      de: "Fotobox-Business meistern",
      nl: "Photobooth-business beheersen",
      es: "Dominio del negocio de fotomatón",
      it: "Padroneggiare il business dei photobooth",
      pt: "Domínio do negócio de photobooth",
      pl: "Mistrzostwo biznesu fotobudek",
    },
    description: {
      en: "Build a profitable photobooth business with clear positioning, pricing, acquisition channels, operations, automation, and corporate growth.",
      fr: "Construisez une activité photobooth rentable avec un positionnement clair, une tarification solide, des canaux d'acquisition, des process, l'automatisation et le développement corporate.",
      de: "Bauen Sie ein profitables Fotobox-Geschäft mit klarer Positionierung, Preisen, Akquise, Abläufen, Automatisierung und Firmenkundengeschäft auf.",
      nl: "Bouw een winstgevende photobooth-activiteit met duidelijke positionering, prijsstrategie, acquisitiekanalen, processen, automatisering en zakelijke groei.",
      es: "Construye un negocio rentable de fotomatón con posicionamiento, precios, adquisición, procesos, automatización y crecimiento corporativo.",
      it: "Costruisci un business photobooth redditizio con posizionamento, prezzi, acquisizione clienti, processi, automazione e crescita corporate.",
      pt: "Construa um negócio de photobooth rentável com posicionamento, preços, aquisição, processos, automação e crescimento corporativo.",
      pl: "Zbuduj rentowny biznes fotobudek dzięki pozycjonowaniu, cenom, pozyskiwaniu klientów, procesom, automatyzacji i rozwojowi B2B.",
    },
    category: "business",
    level: "intermediate",
    order: 1,
    isFeatured: true,
  },
  design: {
    slug: "design-marketing-communication",
    title: {
      en: "Design & Marketing",
      fr: "Création & Communication",
      de: "Gestaltung & Kommunikation",
      nl: "Creatie & Communicatie",
      es: "Creación y Comunicación",
      it: "Creazione e Comunicazione",
      pt: "Criação e Comunicação",
      pl: "Kreacja i Komunikacja",
    },
    description: {
      en: "Create polished Canva visuals, build professional templates, prepare event-specific assets, and strengthen your creative communication.",
      fr: "Créez des visuels Canva propres, structurez des templates professionnels, préparez les événements spéciaux et renforcez votre communication créative.",
      de: "Erstellen Sie hochwertige Canva-Designs, professionelle Vorlagen, Event-Materialien und eine stärkere visuelle Kommunikation.",
      nl: "Maak sterke Canva-visuals, professionele sjablonen, assets voor speciale evenementen en betere creatieve communicatie.",
      es: "Crea diseños en Canva, plantillas profesionales, materiales para eventos especiales y una comunicación visual más sólida.",
      it: "Crea visual Canva curati, template professionali, materiali per eventi speciali e una comunicazione creativa più forte.",
      pt: "Crie visuais no Canva, templates profissionais, materiais para eventos especiais e uma comunicação criativa mais forte.",
      pl: "Twórz dopracowane projekty Canva, profesjonalne szablony, materiały na wydarzenia i mocniejszą komunikację wizualną.",
    },
    category: "creative",
    level: "beginner",
    order: 2,
    isFeatured: true,
  },
};

const MODULE_DEFS: Record<
  ModuleKey,
  { course: CourseKey; order: number; title: LocaleText }
> = {
  "business-start": {
    course: "business",
    order: 1,
    title: {
      en: "Start Here",
      fr: "Commencer ici",
      de: "Hier starten",
      nl: "Begin hier",
      es: "Empieza aquí",
      it: "Inizia qui",
      pt: "Comece aqui",
      pl: "Zacznij tutaj",
    },
  },
  "business-market-model": {
    course: "business",
    order: 2,
    title: {
      en: "Market & Business Model",
      fr: "Marché & modèle économique",
      de: "Markt & Geschäftsmodell",
      nl: "Markt & businessmodel",
      es: "Mercado y modelo de negocio",
      it: "Mercato e modello di business",
      pt: "Mercado e modelo de negócio",
      pl: "Rynek i model biznesowy",
    },
  },
  "business-positioning": {
    course: "business",
    order: 3,
    title: {
      en: "Positioning & Target Audience",
      fr: "Positionnement & audience cible",
      de: "Positionierung & Zielgruppe",
      nl: "Positionering & doelgroep",
      es: "Posicionamiento y público objetivo",
      it: "Posizionamento e pubblico target",
      pt: "Posicionamento e público-alvo",
      pl: "Pozycjonowanie i grupa docelowa",
    },
  },
  "business-offer": {
    course: "business",
    order: 4,
    title: {
      en: "Offer Structure & Upsells",
      fr: "Offres, options & upsells",
      de: "Angebotsstruktur & Upselling",
      nl: "Aanbodstructuur & upselling",
      es: "Ofertas y ventas adicionales",
      it: "Offerte e upsell",
      pt: "Ofertas e upsells",
      pl: "Oferta i upselling",
    },
  },
  "business-pricing": {
    course: "business",
    order: 5,
    title: {
      en: "Pricing Strategy",
      fr: "Stratégie tarifaire",
      de: "Preisstrategie",
      nl: "Prijsstrategie",
      es: "Estrategia de precios",
      it: "Strategia di prezzo",
      pt: "Estratégia de preços",
      pl: "Strategia cenowa",
    },
  },
  "business-acquisition": {
    course: "business",
    order: 6,
    title: {
      en: "Acquisition Channels",
      fr: "Canaux d'acquisition",
      de: "Akquisekanäle",
      nl: "Acquisitiekanalen",
      es: "Canales de adquisición",
      it: "Canali di acquisizione",
      pt: "Canais de aquisição",
      pl: "Kanały pozyskiwania klientów",
    },
  },
  "business-brand-trust": {
    course: "business",
    order: 7,
    title: {
      en: "Premium Brand & Trust",
      fr: "Image premium & confiance",
      de: "Premium-Marke & Vertrauen",
      nl: "Premium merk & vertrouwen",
      es: "Marca premium y confianza",
      it: "Brand premium e fiducia",
      pt: "Marca premium e confiança",
      pl: "Marka premium i zaufanie",
    },
  },
  "business-operations": {
    course: "business",
    order: 8,
    title: {
      en: "Event Operations",
      fr: "Organisation événementielle",
      de: "Event-Organisation",
      nl: "Eventorganisatie",
      es: "Operaciones de eventos",
      it: "Organizzazione eventi",
      pt: "Operações de eventos",
      pl: "Organizacja wydarzeń",
    },
  },
  "business-scaling": {
    course: "business",
    order: 9,
    title: {
      en: "Automation & Corporate Growth",
      fr: "Automatisation & développement corporate",
      de: "Automatisierung & Firmenkundengeschäft",
      nl: "Automatisering & zakelijke groei",
      es: "Automatización y crecimiento corporativo",
      it: "Automazione e crescita corporate",
      pt: "Automação e crescimento corporativo",
      pl: "Automatyzacja i rozwój B2B",
    },
  },
  "business-next-steps": {
    course: "business",
    order: 10,
    title: {
      en: "Next Steps",
      fr: "Prochaines étapes",
      de: "Nächste Schritte",
      nl: "Volgende stappen",
      es: "Próximos pasos",
      it: "Prossimi passi",
      pt: "Próximos passos",
      pl: "Następne kroki",
    },
  },
  "design-foundations": {
    course: "design",
    order: 1,
    title: {
      en: "Creative Foundations",
      fr: "Bases créatives",
      de: "Kreative Grundlagen",
      nl: "Creatieve basis",
      es: "Fundamentos creativos",
      it: "Fondamenti creativi",
      pt: "Fundamentos criativos",
      pl: "Podstawy kreatywne",
    },
  },
  "design-canva-templates": {
    course: "design",
    order: 2,
    title: {
      en: "Canva & Professional Templates",
      fr: "Canva & templates professionnels",
      de: "Canva & professionelle Vorlagen",
      nl: "Canva & professionele sjablonen",
      es: "Canva y plantillas profesionales",
      it: "Canva e template professionali",
      pt: "Canva e templates profissionais",
      pl: "Canva i profesjonalne szablony",
    },
  },
  "design-growth": {
    course: "design",
    order: 3,
    title: {
      en: "Special Events & Next Level",
      fr: "Événements spéciaux & niveau supérieur",
      de: "Besondere Events & nächster Schritt",
      nl: "Speciale evenementen & hoger niveau",
      es: "Eventos especiales y siguiente nivel",
      it: "Eventi speciali e livello successivo",
      pt: "Eventos especiais e próximo nível",
      pl: "Wydarzenia specjalne i wyższy poziom",
    },
  },
};

const LESSON_PLAN: Record<LessonKey, LessonPlan> = {
  "business-intro": { course: "business", module: "business-start", order: 1 },
  "business-1-1": { course: "business", module: "business-market-model", order: 1 },
  "business-1-2": { course: "business", module: "business-market-model", order: 2 },
  "business-2-1": { course: "business", module: "business-positioning", order: 1 },
  "business-2-2": { course: "business", module: "business-positioning", order: 2 },
  "business-3-1": { course: "business", module: "business-offer", order: 1 },
  "business-3-2": { course: "business", module: "business-offer", order: 2 },
  "business-4-1": { course: "business", module: "business-pricing", order: 1 },
  "business-4-2": { course: "business", module: "business-pricing", order: 2 },
  "business-5-1": { course: "business", module: "business-acquisition", order: 1 },
  "business-5-2": { course: "business", module: "business-acquisition", order: 2 },
  "business-5-3": { course: "business", module: "business-acquisition", order: 3 },
  "business-5-4": { course: "business", module: "business-acquisition", order: 4 },
  "business-6-1": { course: "business", module: "business-brand-trust", order: 1 },
  "business-6-2": { course: "business", module: "business-brand-trust", order: 2 },
  "business-7-1": { course: "business", module: "business-operations", order: 1 },
  "business-7-2": { course: "business", module: "business-operations", order: 2 },
  "business-8-1": { course: "business", module: "business-scaling", order: 1 },
  "business-8-2": { course: "business", module: "business-scaling", order: 2 },
  "business-conclusion": { course: "business", module: "business-next-steps", order: 1 },
  "design-intro": { course: "design", module: "design-foundations", order: 1 },
  "design-inspiration": { course: "design", module: "design-foundations", order: 2 },
  "design-canva-basics": { course: "design", module: "design-canva-templates", order: 1 },
  "design-professional-templates": { course: "design", module: "design-canva-templates", order: 2 },
  "design-template-10x15": { course: "design", module: "design-canva-templates", order: 3 },
  "design-template-strip": { course: "design", module: "design-canva-templates", order: 4 },
  "design-special-events": { course: "design", module: "design-growth", order: 1 },
  "design-next-level": { course: "design", module: "design-growth", order: 2 },
};

const LESSON_ORDER = Object.keys(LESSON_PLAN) as LessonKey[];

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured.`);
  return value;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripCoursePrefix(title: string): string {
  const parts = title.split("—").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3 && normalize(parts[1]).match(/^(video|wideo)\s+\d+\.\d+$/)) {
    return parts.slice(2).join(" — ");
  }
  if (parts.length >= 2) return parts.slice(1).join(" — ");
  return title.trim();
}

function classifyBusinessVideo(title: string): LessonKey | null {
  const normalized = normalize(title);
  const numbered = normalized.match(/\b(?:video|wideo)\s+(\d)\.(\d)\b/);
  if (numbered) {
    const key = `business-${numbered[1]}-${numbered[2]}` as LessonKey;
    return key in LESSON_PLAN ? key : null;
  }

  if (
    normalized.includes("introduction") ||
    normalized.includes("introduccion") ||
    normalized.includes("introduzione") ||
    normalized.includes("introducao") ||
    normalized.includes("einfuhrung") ||
    normalized.includes("introductie") ||
    normalized.includes("wprowadzenie")
  ) {
    return "business-intro";
  }

  return "business-conclusion";
}

function classifyDesignVideo(title: string): LessonKey | null {
  const normalized = normalize(title);
  if (normalized.includes("10x15") || normalized.includes("4x6")) return "design-template-10x15";
  if (
    normalized.includes("5x15") ||
    normalized.includes("photo strip") ||
    normalized.includes("fotostreifen") ||
    normalized.includes("fotostrip") ||
    normalized.includes("tira fotografica") ||
    normalized.includes("striscia fotografica") ||
    normalized.includes("paskow fotograficznych")
  ) {
    return "design-template-strip";
  }
  if (
    normalized.includes("special events") ||
    normalized.includes("evenements speciaux") ||
    normalized.includes("eventos especiales") ||
    normalized.includes("eventi speciali") ||
    normalized.includes("eventos especiais") ||
    normalized.includes("besondere veranstaltungen") ||
    normalized.includes("speciale evenementen") ||
    normalized.includes("wydarzen specjalnych")
  ) {
    return "design-special-events";
  }
  if (
    normalized.includes("next level") ||
    normalized.includes("encore plus loin") ||
    normalized.includes("nachste schritt") ||
    normalized.includes("hoger niveau") ||
    normalized.includes("siguiente nivel") ||
    normalized.includes("andare oltre") ||
    normalized.includes("proximo nivel") ||
    normalized.includes("wyzszy poziom")
  ) {
    return "design-next-level";
  }
  if (
    normalized.includes("professional template") ||
    normalized.includes("templates professionnels") ||
    normalized.includes("plantillas profesionales") ||
    normalized.includes("template professionali") ||
    normalized.includes("templates profissionais") ||
    normalized.includes("professionelle vorlagensammlung") ||
    normalized.includes("professionele sjablonencollectie") ||
    normalized.includes("profesjonalnych szablonow")
  ) {
    return "design-professional-templates";
  }
  if (
    normalized.includes("first canva designs") ||
    normalized.includes("premiers visuels") ||
    normalized.includes("premiers designs") ||
    normalized.includes("primeros disenos") ||
    normalized.includes("primi design") ||
    normalized.includes("primeiros designs") ||
    normalized.includes("ersten designs") ||
    normalized.includes("eerste ontwerpen") ||
    normalized.includes("pierwszych projektow")
  ) {
    return "design-canva-basics";
  }
  if (
    normalized.includes("inspiration") ||
    normalized.includes("inspiracion") ||
    normalized.includes("inspirazione") ||
    normalized.includes("inspiratie") ||
    normalized.includes("inspiracao") ||
    normalized.includes("ispirazione") ||
    normalized.includes("inspirationsquellen") ||
    normalized.includes("inspiracji")
  ) {
    return "design-inspiration";
  }
  if (
    normalized.includes("introduction") ||
    normalized.includes("introduccion") ||
    normalized.includes("introduzione") ||
    normalized.includes("introducao") ||
    normalized.includes("einfuhrung") ||
    normalized.includes("introductie") ||
    normalized.includes("wprowadzenie")
  ) {
    return "design-intro";
  }
  return null;
}

function classifyVideo(title: string): LessonKey | null {
  const normalized = normalize(title);
  if (normalized.startsWith("business")) return classifyBusinessVideo(title);
  return classifyDesignVideo(title);
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours <= 0) return `${minutes} min`;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function buildEmbedUrl(libraryId: string, videoId: string): string {
  return `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}`;
}

function buildThumbnailUrl(cdnHostname: string, videoId: string): string {
  return `https://${cdnHostname}/${videoId}/thumbnail.jpg`;
}

function buildPreviewUrl(cdnHostname: string, videoId: string): string {
  return `https://${cdnHostname}/${videoId}/preview.webp`;
}

async function bunnyGet<T>(path: string): Promise<T> {
  const apiKey = env("BUNNY_STREAM_API_KEY");
  const res = await fetch(`https://video.bunnycdn.com${path}`, {
    headers: { AccessKey: apiKey, accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`BunnyStream ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function fetchBunnyVideos(): Promise<Array<{ lang: Lang; video: BunnyVideo }>> {
  const libraryId = env("BUNNY_STREAM_LIBRARY_ID");
  const collections = await bunnyGet<{ items?: Array<{ guid: string; name: string; videoCount?: number }> }>(
    `/library/${libraryId}/collections?page=1&itemsPerPage=200&includeThumbnails=false`,
  );
  const videos: Array<{ lang: Lang; video: BunnyVideo }> = [];

  for (const collection of collections.items ?? []) {
    const lang = COLLECTION_ID_TO_LANG[collection.guid];
    if (!lang) continue;

    let page = 1;
    while (true) {
      const data = await bunnyGet<{ items?: BunnyVideo[]; totalItems?: number }>(
        `/library/${libraryId}/videos?collection=${encodeURIComponent(collection.guid)}&page=${page}&itemsPerPage=100&orderBy=title`,
      );
      const pageItems = (data.items ?? []).filter(
        (video) => video.collectionId === collection.guid,
      );
      for (const video of pageItems) videos.push({ lang, video });
      if ((data.items ?? []).length < 100) break;
      if (videos.filter((entry) => entry.lang === lang).length >= Number(data.totalItems ?? 0)) break;
      page += 1;
    }
  }

  return videos;
}

function groupVideos(entries: Array<{ lang: Lang; video: BunnyVideo }>): GroupedLesson[] {
  const libraryId = env("BUNNY_STREAM_LIBRARY_ID");
  const cdnHostname = env("BUNNY_STREAM_CDN_HOSTNAME");
  const grouped = new Map<LessonKey, Partial<GroupedLesson>>();
  const errors: string[] = [];
  const countsByLang = new Map<Lang, number>();

  for (const lang of LANGS) countsByLang.set(lang, 0);

  for (const entry of entries) {
    countsByLang.set(entry.lang, (countsByLang.get(entry.lang) ?? 0) + 1);
    const key = classifyVideo(entry.video.title);
    if (!key) {
      errors.push(`Unknown video title for ${entry.lang}: ${entry.video.title}`);
      continue;
    }
    if (entry.video.status !== 4) {
      errors.push(`Video is not ready for ${entry.lang}: ${entry.video.title}`);
      continue;
    }

    const current = grouped.get(key) ?? {
      key,
      titles: {} as LocaleText,
      durationSeconds: 0,
      videoAssets: {} as Record<Lang, VideoAsset>,
    };
    if (current.videoAssets?.[entry.lang]) {
      errors.push(`Duplicate ${entry.lang} video for lesson ${key}: ${entry.video.title}`);
      continue;
    }

    current.titles![entry.lang] = stripCoursePrefix(entry.video.title);
    current.durationSeconds = Math.max(
      current.durationSeconds ?? 0,
      Number(entry.video.length ?? 0),
    );
    current.videoAssets![entry.lang] = {
      embedUrl: buildEmbedUrl(libraryId, entry.video.guid),
      thumbnailUrl: buildThumbnailUrl(cdnHostname, entry.video.guid),
      previewUrl: buildPreviewUrl(cdnHostname, entry.video.guid),
      videoId: entry.video.guid,
    };
    grouped.set(key, current);
  }

  for (const lang of LANGS) {
    const count = countsByLang.get(lang) ?? 0;
    if (count !== 28) errors.push(`Expected 28 ${lang} videos, found ${count}.`);
  }

  for (const key of LESSON_ORDER) {
    const item = grouped.get(key);
    if (!item) {
      errors.push(`Missing lesson group: ${key}`);
      continue;
    }
    for (const lang of LANGS) {
      if (!item.titles?.[lang]) errors.push(`Missing ${lang} title for lesson ${key}`);
      if (!item.videoAssets?.[lang]) errors.push(`Missing ${lang} video asset for lesson ${key}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Bunny Academy organization failed validation:\n${errors.join("\n")}`);
  }

  return LESSON_ORDER.map((key) => grouped.get(key) as GroupedLesson);
}

async function upsertCourse(
  courseKey: CourseKey,
  totalDurationSeconds: number,
  thumbnailUrl: string,
): Promise<typeof courses.$inferSelect> {
  const def = COURSE_DEFS[courseKey];
  const existing = await db
    .select()
    .from(courses)
    .where(eq(courses.slug, def.slug));
  const values = {
    title: def.title,
    description: def.description,
    category: def.category,
    level: def.level,
    thumbnailUrl,
    order: def.order,
    isPublished: true,
    totalDurationSeconds,
    instructorName: "HaloLight Team",
    isFeatured: def.isFeatured,
    estimatedDuration: formatDuration(totalDurationSeconds),
    updatedAt: new Date(),
  };

  if (existing[0]) {
    const [updated] = await db
      .update(courses)
      .set(values)
      .where(eq(courses.id, existing[0].id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(courses)
    .values({ slug: def.slug, ...values })
    .returning();
  return created!;
}

async function upsertModule(
  courseId: string,
  moduleKey: ModuleKey,
): Promise<typeof courseModules.$inferSelect> {
  const def = MODULE_DEFS[moduleKey];
  const existing = await db
    .select()
    .from(courseModules)
    .where(and(eq(courseModules.courseId, courseId), eq(courseModules.order, def.order)));

  if (existing[0]) {
    const [updated] = await db
      .update(courseModules)
      .set({ title: def.title })
      .where(eq(courseModules.id, existing[0].id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(courseModules)
    .values({ courseId, title: def.title, order: def.order })
    .returning();
  return created!;
}

async function upsertLesson(
  moduleId: string,
  lesson: GroupedLesson,
  order: number,
): Promise<typeof lessons.$inferSelect> {
  const existing = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.moduleId, moduleId), eq(lessons.order, order)));

  const thumbnailUrl =
    lesson.videoAssets.fr?.thumbnailUrl ??
    lesson.videoAssets.en.thumbnailUrl;
  const videoUrl =
    lesson.videoAssets.fr?.embedUrl ??
    lesson.videoAssets.en.embedUrl;

  const values = {
    title: lesson.titles,
    description: null,
    videoUrl,
    videoUrls: null,
    thumbnailUrl,
    videoAssets: lesson.videoAssets,
    durationSeconds: lesson.durationSeconds,
    isPublished: true,
    notes: `Imported from BunnyStream (${lesson.key})`,
  };

  if (existing[0]) {
    const [updated] = await db
      .update(lessons)
      .set(values)
      .where(eq(lessons.id, existing[0].id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(lessons)
    .values({ moduleId, order, ...values })
    .returning();
  return created!;
}

async function organizeAcademy(dryRun: boolean): Promise<void> {
  const groupedLessons = groupVideos(await fetchBunnyVideos());
  const totalByCourse = new Map<CourseKey, number>();
  const thumbnailByCourse = new Map<CourseKey, string>();

  for (const lesson of groupedLessons) {
    const plan = LESSON_PLAN[lesson.key];
    totalByCourse.set(
      plan.course,
      (totalByCourse.get(plan.course) ?? 0) + lesson.durationSeconds,
    );
    if (!thumbnailByCourse.has(plan.course)) {
      thumbnailByCourse.set(
        plan.course,
        lesson.videoAssets.fr?.thumbnailUrl ?? lesson.videoAssets.en.thumbnailUrl,
      );
    }
  }

  const summary = {
    courses: Object.values(COURSE_DEFS).map((course) => course.slug),
    modules: Object.keys(MODULE_DEFS).length,
    lessons: groupedLessons.length,
    localizedAssets: groupedLessons.length * LANGS.length,
    durations: Object.fromEntries(
      Array.from(totalByCourse.entries()).map(([course, seconds]) => [
        course,
        formatDuration(seconds),
      ]),
    ),
  };
  console.log(JSON.stringify(summary, null, 2));

  if (dryRun) {
    console.log("Dry run complete. No database changes applied.");
    return;
  }

  await db
    .update(courses)
    .set({ isPublished: false, updatedAt: new Date() })
    .where(inArray(courses.slug, [...LEGACY_SEED_COURSE_SLUGS]));

  const courseRows = new Map<CourseKey, typeof courses.$inferSelect>();
  for (const courseKey of Object.keys(COURSE_DEFS) as CourseKey[]) {
    courseRows.set(
      courseKey,
      await upsertCourse(
        courseKey,
        totalByCourse.get(courseKey) ?? 0,
        thumbnailByCourse.get(courseKey) ?? "",
      ),
    );
  }

  const moduleRows = new Map<ModuleKey, typeof courseModules.$inferSelect>();
  for (const moduleKey of Object.keys(MODULE_DEFS) as ModuleKey[]) {
    const moduleDef = MODULE_DEFS[moduleKey];
    const course = courseRows.get(moduleDef.course);
    if (!course) throw new Error(`Missing course for module ${moduleKey}`);
    moduleRows.set(moduleKey, await upsertModule(course.id, moduleKey));
  }

  for (const lesson of groupedLessons) {
    const plan = LESSON_PLAN[lesson.key];
    const module = moduleRows.get(plan.module);
    if (!module) throw new Error(`Missing module for lesson ${lesson.key}`);
    await upsertLesson(module.id, lesson, plan.order);
  }

  console.log("Academy Bunny organization complete.");
}

const dryRun = process.argv.includes("--dry-run");

organizeAcademy(dryRun)
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
