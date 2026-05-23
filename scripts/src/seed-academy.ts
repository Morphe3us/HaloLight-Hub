import {
  db,
  courses,
  courseModules,
  lessons,
  lessonResources,
  quizQuestions,
  events,
} from "@workspace/db";
import { eq } from "drizzle-orm";

export async function seedAcademy() {
  console.log("\n📚 Seeding Academy demo data...");

  // ─── Course 1: Getting Started with HaloLight ────────────────────────────
  const [existing1] = await db
    .select()
    .from(courses)
    .where(eq(courses.slug, "getting-started"));

  if (!existing1) {
    const [c1] = await db
      .insert(courses)
      .values({
        slug: "getting-started",
        title: {
          en: "Getting Started with HaloLight",
          fr: "Débuter avec HaloLight",
          es: "Comenzando con HaloLight",
          de: "Erste Schritte mit HaloLight",
          it: "Iniziare con HaloLight",
          pl: "Rozpoczęcie pracy z HaloLight",
          pt: "Começando com HaloLight",
          nl: "Aan de slag met HaloLight",
        },
        description: {
          en: "Master the fundamentals of HaloLight photobooth equipment. Learn setup, configuration, and your first event operation.",
          fr: "Maîtrisez les fondamentaux de l'équipement HaloLight. Apprenez la configuration et l'opération de votre premier événement.",
          es: "Domina los fundamentos del equipo de fotomatón HaloLight. Aprende configuración y operación de tu primer evento.",
          de: "Meistern Sie die Grundlagen der HaloLight-Fotobox-Ausrüstung. Lernen Sie Einrichtung, Konfiguration und Ihren ersten Event-Betrieb.",
          it: "Padroneggia i fondamentali dell'attrezzatura HaloLight. Impara configurazione e operazione del tuo primo evento.",
          pl: "Opanuj podstawy sprzętu do fotobudki HaloLight. Naucz się konfiguracji i prowadzenia pierwszego wydarzenia.",
          pt: "Domine os fundamentos do equipamento de fotocabine HaloLight. Aprenda configuração e operação do seu primeiro evento.",
          nl: "Beheers de basisprincipes van HaloLight fotoboothapparatuur. Leer installatie, configuratie en uw eerste evenementoperatie.",
        },
        category: "foundation",
        level: "beginner",
        thumbnailUrl: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=800&q=80",
        order: 1,
        totalDurationSeconds: 4260,
      })
      .returning();

    console.log("  ✓ Created course: Getting Started with HaloLight");

    // Module 1: Unboxing & Setup
    const [m1] = await db
      .insert(courseModules)
      .values({
        courseId: c1.id,
        title: {
          en: "Unboxing & Initial Setup",
          fr: "Déballage et configuration initiale",
          es: "Desempaque y configuración inicial",
          de: "Auspacken & Ersteinrichtung",
          it: "Unboxing e configurazione iniziale",
          pl: "Rozpakowywanie i pierwsza konfiguracja",
          pt: "Desembalagem e configuração inicial",
          nl: "Uitpakken en initiële installatie",
        },
        order: 1,
      })
      .returning();

    const [l1_1] = await db
      .insert(lessons)
      .values({
        moduleId: m1.id,
        title: {
          en: "What's in the Box",
          fr: "Contenu de la boîte",
          es: "¿Qué hay en la caja?",
          de: "Was ist in der Box",
          it: "Cosa c'è nella scatola",
          pl: "Co jest w pudełku",
          pt: "O que está na caixa",
          nl: "Wat zit er in de doos",
        },
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSeconds: 480,
        order: 1,
      })
      .returning();

    await db.insert(quizQuestions).values([
      {
        lessonId: l1_1.id,
        question: {
          en: "What is the first thing you should check when unboxing your HaloLight unit?",
          fr: "Quelle est la première chose à vérifier lors du déballage de votre unité HaloLight?",
          es: "¿Qué es lo primero que debes verificar al desempacar tu unidad HaloLight?",
          de: "Was sollten Sie beim Auspacken Ihrer HaloLight-Einheit zuerst überprüfen?",
          it: "Qual è la prima cosa da controllare quando si disimballaggio l'unità HaloLight?",
          pl: "Co należy najpierw sprawdzić podczas rozpakowywania jednostki HaloLight?",
          pt: "O que é a primeira coisa a verificar ao desembalar sua unidade HaloLight?",
          nl: "Wat is het eerste dat u moet controleren bij het uitpakken van uw HaloLight-eenheid?",
        },
        options: [
          {
            en: "The power cable",
            fr: "Le câble d'alimentation",
            es: "El cable de alimentación",
            de: "Das Stromkabel",
            it: "Il cavo di alimentazione",
            pl: "Kabel zasilający",
            pt: "O cabo de alimentação",
            nl: "Het netsnoer",
          },
          {
            en: "Check for any visible damage",
            fr: "Vérifier les dommages visibles",
            es: "Verificar daños visibles",
            de: "Auf sichtbare Schäden prüfen",
            it: "Controllare eventuali danni visibili",
            pl: "Sprawdzić widoczne uszkodzenia",
            pt: "Verificar danos visíveis",
            nl: "Controleer op zichtbare schade",
          },
          {
            en: "The software license",
            fr: "La licence logicielle",
            es: "La licencia de software",
            de: "Die Softwarelizenz",
            it: "La licenza software",
            pl: "Licencja oprogramowania",
            pt: "A licença de software",
            nl: "De softwarelicentie",
          },
          {
            en: "The user manual",
            fr: "Le manuel utilisateur",
            es: "El manual de usuario",
            de: "Die Bedienungsanleitung",
            it: "Il manuale utente",
            pl: "Instrukcja obsługi",
            pt: "O manual do usuário",
            nl: "De gebruikershandleiding",
          },
        ],
        correctOption: 1,
        order: 1,
      },
    ]);

    await db.insert(lessonResources).values([
      {
        lessonId: l1_1.id,
        title: { en: "Setup Checklist PDF", fr: "Checklist d'installation PDF", es: "Lista de verificación PDF", de: "Installations-Checkliste PDF", it: "Lista di controllo PDF", pl: "Lista kontrolna PDF", pt: "Lista de verificação PDF", nl: "Installatie checklist PDF" },
        type: "pdf",
        url: "https://example.com/resources/setup-checklist.pdf",
      },
    ]);

    const [l1_2] = await db
      .insert(lessons)
      .values({
        moduleId: m1.id,
        title: {
          en: "Hardware Assembly",
          fr: "Assemblage du matériel",
          es: "Ensamblaje del hardware",
          de: "Hardware-Montage",
          it: "Assemblaggio hardware",
          pl: "Montaż sprzętu",
          pt: "Montagem de hardware",
          nl: "Hardware assemblage",
        },
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSeconds: 720,
        order: 2,
      })
      .returning();

    await db.insert(lessonResources).values([
      {
        lessonId: l1_2.id,
        title: { en: "Hardware Assembly Guide", fr: "Guide d'assemblage", es: "Guía de ensamblaje", de: "Montageanleitung", it: "Guida al montaggio", pl: "Przewodnik montażu", pt: "Guia de montagem", nl: "Montagehandleiding" },
        type: "pdf",
        url: "https://example.com/resources/assembly-guide.pdf",
      },
    ]);

    // Module 2: Software & Configuration
    const [m2] = await db
      .insert(courseModules)
      .values({
        courseId: c1.id,
        title: {
          en: "Software & Configuration",
          fr: "Logiciel et configuration",
          es: "Software y configuración",
          de: "Software & Konfiguration",
          it: "Software e configurazione",
          pl: "Oprogramowanie i konfiguracja",
          pt: "Software e configuração",
          nl: "Software en configuratie",
        },
        order: 2,
      })
      .returning();

    const [l2_1] = await db
      .insert(lessons)
      .values({
        moduleId: m2.id,
        title: {
          en: "Installing HaloLight Software",
          fr: "Installation du logiciel HaloLight",
          es: "Instalación del software HaloLight",
          de: "HaloLight-Software installieren",
          it: "Installazione del software HaloLight",
          pl: "Instalowanie oprogramowania HaloLight",
          pt: "Instalando o software HaloLight",
          nl: "HaloLight-software installeren",
        },
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSeconds: 600,
        order: 1,
      })
      .returning();

    await db.insert(quizQuestions).values([
      {
        lessonId: l2_1.id,
        question: {
          en: "What is the minimum RAM requirement for HaloLight software?",
          fr: "Quelle est la configuration RAM minimale pour le logiciel HaloLight?",
          es: "¿Cuál es el requisito mínimo de RAM para el software HaloLight?",
          de: "Was ist die Mindest-RAM-Anforderung für HaloLight-Software?",
          it: "Qual è il requisito minimo di RAM per il software HaloLight?",
          pl: "Jakie jest minimalne wymaganie RAM dla oprogramowania HaloLight?",
          pt: "Qual é o requisito mínimo de RAM para o software HaloLight?",
          nl: "Wat is de minimale RAM-vereiste voor HaloLight-software?",
        },
        options: [
          { en: "4 GB", fr: "4 Go", es: "4 GB", de: "4 GB", it: "4 GB", pl: "4 GB", pt: "4 GB", nl: "4 GB" },
          { en: "8 GB", fr: "8 Go", es: "8 GB", de: "8 GB", it: "8 GB", pl: "8 GB", pt: "8 GB", nl: "8 GB" },
          { en: "16 GB", fr: "16 Go", es: "16 GB", de: "16 GB", it: "16 GB", pl: "16 GB", pt: "16 GB", nl: "16 GB" },
          { en: "32 GB", fr: "32 Go", es: "32 GB", de: "32 GB", it: "32 GB", pl: "32 GB", pt: "32 GB", nl: "32 GB" },
        ],
        correctOption: 1,
        order: 1,
      },
    ]);

    const [l2_2] = await db
      .insert(lessons)
      .values({
        moduleId: m2.id,
        title: {
          en: "First Boot & Activation",
          fr: "Premier démarrage et activation",
          es: "Primer arranque y activación",
          de: "Erster Start & Aktivierung",
          it: "Primo avvio e attivazione",
          pl: "Pierwsze uruchomienie i aktywacja",
          pt: "Primeiro boot e ativação",
          nl: "Eerste opstart en activering",
        },
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSeconds: 540,
        order: 2,
      })
      .returning();

    const [l2_3] = await db
      .insert(lessons)
      .values({
        moduleId: m2.id,
        title: {
          en: "Connecting to the Cloud Dashboard",
          fr: "Connexion au tableau de bord cloud",
          es: "Conexión al panel de control en la nube",
          de: "Verbindung zum Cloud-Dashboard",
          it: "Connessione al dashboard cloud",
          pl: "Połączenie z panelem chmurowym",
          pt: "Conectando ao painel de controle em nuvem",
          nl: "Verbinding met het cloud-dashboard",
        },
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSeconds: 420,
        order: 3,
      })
      .returning();

    // Module 3: First Event
    const [m3] = await db
      .insert(courseModules)
      .values({
        courseId: c1.id,
        title: {
          en: "Running Your First Event",
          fr: "Votre premier événement",
          es: "Tu primer evento",
          de: "Ihr erstes Event",
          it: "Il tuo primo evento",
          pl: "Twoje pierwsze wydarzenie",
          pt: "Seu primeiro evento",
          nl: "Uw eerste evenement",
        },
        order: 3,
      })
      .returning();

    await db.insert(lessons).values([
      {
        moduleId: m3.id,
        title: {
          en: "Pre-Event Checklist",
          fr: "Checklist pré-événement",
          es: "Lista de verificación pre-evento",
          de: "Vor-Event-Checkliste",
          it: "Checklist pre-evento",
          pl: "Lista kontrolna przed wydarzeniem",
          pt: "Lista de verificação pré-evento",
          nl: "Pre-evenement checklist",
        },
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSeconds: 360,
        order: 1,
      },
      {
        moduleId: m3.id,
        title: {
          en: "Live Session Management",
          fr: "Gestion des sessions en direct",
          es: "Gestión de sesiones en vivo",
          de: "Live-Session-Management",
          it: "Gestione delle sessioni live",
          pl: "Zarządzanie sesjami na żywo",
          pt: "Gerenciamento de sessões ao vivo",
          nl: "Live sessiebeheer",
        },
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSeconds: 600,
        order: 2,
      },
      {
        moduleId: m3.id,
        title: {
          en: "Post-Event Wrap-Up & Delivery",
          fr: "Bilan et livraison post-événement",
          es: "Resumen y entrega post-evento",
          de: "Nachbereitung & Lieferung",
          it: "Riepilogo e consegna post-evento",
          pl: "Podsumowanie i dostawa po wydarzeniu",
          pt: "Resumo pós-evento e entrega",
          nl: "Post-evenement afronding en levering",
        },
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSeconds: 540,
        order: 3,
      },
    ]);

    console.log("  ✓ Course 1 modules and lessons created");
  } else {
    console.log("  - Skipped existing course: getting-started");
  }

  // ─── Course 2: Advanced Features & Customization ──────────────────────
  const [existing2] = await db
    .select()
    .from(courses)
    .where(eq(courses.slug, "advanced-features"));

  if (!existing2) {
    const [c2] = await db
      .insert(courses)
      .values({
        slug: "advanced-features",
        title: {
          en: "Advanced Features & Customization",
          fr: "Fonctionnalités avancées et personnalisation",
          es: "Funciones avanzadas y personalización",
          de: "Erweiterte Funktionen & Anpassung",
          it: "Funzionalità avanzate e personalizzazione",
          pl: "Zaawansowane funkcje i personalizacja",
          pt: "Recursos avançados e personalização",
          nl: "Geavanceerde functies en aanpassing",
        },
        description: {
          en: "Unlock the full potential of your HaloLight system. Custom overlays, branded templates, AI filters, and premium guest experiences.",
          fr: "Déverrouillez le plein potentiel de votre système HaloLight. Superpositions personnalisées, modèles de marque, filtres IA et expériences premium.",
          es: "Desbloquea el potencial completo de tu sistema HaloLight. Superposiciones personalizadas, plantillas de marca, filtros de IA y experiencias premium.",
          de: "Schöpfen Sie das volle Potenzial Ihres HaloLight-Systems aus. Benutzerdefinierte Overlays, Markenvorlagen, KI-Filter und Premium-Gasterlebnisse.",
          it: "Sblocca il pieno potenziale del tuo sistema HaloLight. Overlay personalizzati, template brandizzati, filtri AI ed esperienze premium.",
          pl: "Odblokuj pełny potencjał systemu HaloLight. Niestandardowe nakładki, szablony marki, filtry AI i premium doświadczenia gości.",
          pt: "Desbloqueie o potencial total do seu sistema HaloLight. Sobreposições personalizadas, modelos de marca, filtros de IA e experiências premium.",
          nl: "Ontgrendel het volledige potentieel van uw HaloLight-systeem. Aangepaste overlays, merksjablonen, AI-filters en premium gastgebruik.",
        },
        category: "advanced",
        level: "intermediate",
        thumbnailUrl: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80",
        order: 2,
        totalDurationSeconds: 5400,
      })
      .returning();

    console.log("  ✓ Created course: Advanced Features & Customization");

    const [ma1] = await db
      .insert(courseModules)
      .values({
        courseId: c2.id,
        title: {
          en: "Custom Overlays & Branding",
          fr: "Superpositions et image de marque",
          es: "Superposiciones y marca",
          de: "Benutzerdefinierte Overlays & Branding",
          it: "Overlay personalizzati e branding",
          pl: "Niestandardowe nakładki i branding",
          pt: "Sobreposições personalizadas e branding",
          nl: "Aangepaste overlays en branding",
        },
        order: 1,
      })
      .returning();

    await db.insert(lessons).values([
      {
        moduleId: ma1.id,
        title: {
          en: "Designing Custom Frames",
          fr: "Conception de cadres personnalisés",
          es: "Diseño de marcos personalizados",
          de: "Benutzerdefinierte Rahmen entwerfen",
          it: "Progettare cornici personalizzate",
          pl: "Projektowanie niestandardowych ramek",
          pt: "Projetando molduras personalizadas",
          nl: "Aangepaste frames ontwerpen",
        },
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSeconds: 840,
        order: 1,
      },
      {
        moduleId: ma1.id,
        title: {
          en: "Brand Kit Integration",
          fr: "Intégration du kit de marque",
          es: "Integración del kit de marca",
          de: "Brand-Kit-Integration",
          it: "Integrazione del brand kit",
          pl: "Integracja zestawu marki",
          pt: "Integração do kit de marca",
          nl: "Merkkitintegratie",
        },
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSeconds: 720,
        order: 2,
      },
      {
        moduleId: ma1.id,
        title: {
          en: "AI Filters & Effects",
          fr: "Filtres et effets IA",
          es: "Filtros y efectos de IA",
          de: "KI-Filter & Effekte",
          it: "Filtri ed effetti AI",
          pl: "Filtry i efekty AI",
          pt: "Filtros e efeitos de IA",
          nl: "AI-filters en effecten",
        },
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSeconds: 960,
        order: 3,
      },
    ]);

    const [ma2] = await db
      .insert(courseModules)
      .values({
        courseId: c2.id,
        title: {
          en: "Guest Experience Optimization",
          fr: "Optimisation de l'expérience client",
          es: "Optimización de la experiencia del cliente",
          de: "Optimierung der Gasterfahrung",
          it: "Ottimizzazione dell'esperienza degli ospiti",
          pl: "Optymalizacja doświadczenia gości",
          pt: "Otimização da experiência do convidado",
          nl: "Optimalisatie van gastervaring",
        },
        order: 2,
      })
      .returning();

    await db.insert(lessons).values([
      {
        moduleId: ma2.id,
        title: {
          en: "Creating a VIP Booth Experience",
          fr: "Créer une expérience VIP",
          es: "Creando una experiencia VIP",
          de: "Eine VIP-Booth-Erfahrung schaffen",
          it: "Creare un'esperienza VIP",
          pl: "Tworzenie doświadczenia VIP",
          pt: "Criando uma experiência VIP",
          nl: "Een VIP-booth-ervaring creëren",
        },
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSeconds: 660,
        order: 1,
      },
      {
        moduleId: ma2.id,
        title: {
          en: "Instant Share & Social Media Integration",
          fr: "Partage instantané et réseaux sociaux",
          es: "Compartir instantáneo e integración con redes sociales",
          de: "Sofortiges Teilen & Social-Media-Integration",
          it: "Condivisione istantanea e integrazione social",
          pl: "Natychmiastowe udostępnianie i integracja mediów społecznościowych",
          pt: "Compartilhamento instantâneo e integração com redes sociais",
          nl: "Instant delen en sociale media-integratie",
        },
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSeconds: 780,
        order: 2,
      },
    ]);

    console.log("  ✓ Course 2 modules and lessons created");
  } else {
    console.log("  - Skipped existing course: advanced-features");
  }

  // ─── Course 3: Business Growth & Marketing ────────────────────────────
  const [existing3] = await db
    .select()
    .from(courses)
    .where(eq(courses.slug, "business-growth"));

  if (!existing3) {
    const [c3] = await db
      .insert(courses)
      .values({
        slug: "business-growth",
        title: {
          en: "Business Growth & Marketing",
          fr: "Croissance des affaires et marketing",
          es: "Crecimiento empresarial y marketing",
          de: "Unternehmenswachstum & Marketing",
          it: "Crescita aziendale e marketing",
          pl: "Rozwój biznesu i marketing",
          pt: "Crescimento empresarial e marketing",
          nl: "Bedrijfsgroei en marketing",
        },
        description: {
          en: "Scale your photobooth business. Pricing strategies, lead generation, corporate partnerships, and building a 6-figure operation.",
          fr: "Développez votre activité de photobooth. Stratégies de tarification, génération de leads et partenariats d'entreprise.",
          es: "Escala tu negocio de fotomatón. Estrategias de precios, generación de leads y asociaciones corporativas.",
          de: "Skalieren Sie Ihr Fotokabinen-Geschäft. Preisstrategien, Lead-Generierung und Unternehmenspartnerschaften.",
          it: "Scala il tuo business di photobooth. Strategie di prezzo, generazione di lead e partnership aziendali.",
          pl: "Skaluj swój biznes fotobudki. Strategie cenowe, generowanie leadów i partnerstwa korporacyjne.",
          pt: "Escale seu negócio de fotocabine. Estratégias de preços, geração de leads e parcerias corporativas.",
          nl: "Schaal uw fotoboothbedrijf. Prijsstrategieën, leadgeneratie en zakelijke partnerschappen.",
        },
        category: "business",
        level: "advanced",
        thumbnailUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80",
        order: 3,
        totalDurationSeconds: 7200,
      })
      .returning();

    console.log("  ✓ Created course: Business Growth & Marketing");

    const [mb1] = await db
      .insert(courseModules)
      .values({
        courseId: c3.id,
        title: {
          en: "Pricing & Packages",
          fr: "Tarification et offres",
          es: "Precios y paquetes",
          de: "Preisgestaltung & Pakete",
          it: "Prezzi e pacchetti",
          pl: "Cennik i pakiety",
          pt: "Preços e pacotes",
          nl: "Prijzen en pakketten",
        },
        order: 1,
      })
      .returning();

    await db.insert(lessons).values([
      {
        moduleId: mb1.id,
        title: {
          en: "Market Rate Research",
          fr: "Étude des tarifs du marché",
          es: "Investigación de precios de mercado",
          de: "Marktpreisforschung",
          it: "Ricerca sui prezzi di mercato",
          pl: "Badanie stawek rynkowych",
          pt: "Pesquisa de preços de mercado",
          nl: "Marktprijsonderzoek",
        },
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSeconds: 900,
        order: 1,
      },
      {
        moduleId: mb1.id,
        title: {
          en: "Building Profitable Packages",
          fr: "Créer des offres rentables",
          es: "Construyendo paquetes rentables",
          de: "Profitable Pakete erstellen",
          it: "Costruire pacchetti redditizi",
          pl: "Tworzenie dochodowych pakietów",
          pt: "Construindo pacotes lucrativos",
          nl: "Winstgevende pakketten bouwen",
        },
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSeconds: 1020,
        order: 2,
      },
    ]);

    const [mb2] = await db
      .insert(courseModules)
      .values({
        courseId: c3.id,
        title: {
          en: "Lead Generation & Sales",
          fr: "Génération de prospects et ventes",
          es: "Generación de clientes potenciales y ventas",
          de: "Lead-Generierung & Vertrieb",
          it: "Generazione di lead e vendite",
          pl: "Generowanie leadów i sprzedaż",
          pt: "Geração de leads e vendas",
          nl: "Leadgeneratie en verkoop",
        },
        order: 2,
      })
      .returning();

    await db.insert(lessons).values([
      {
        moduleId: mb2.id,
        title: {
          en: "Social Media Strategy for Photobooths",
          fr: "Stratégie réseaux sociaux pour photobooths",
          es: "Estrategia de redes sociales para photobooths",
          de: "Social-Media-Strategie für Fotoboxen",
          it: "Strategia social media per photobooths",
          pl: "Strategia mediów społecznościowych dla fotobudek",
          pt: "Estratégia de redes sociais para fotocabines",
          nl: "Social media strategie voor fotobooths",
        },
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSeconds: 1200,
        order: 1,
      },
      {
        moduleId: mb2.id,
        title: {
          en: "Closing Corporate Contracts",
          fr: "Conclure des contrats d'entreprise",
          es: "Cerrando contratos corporativos",
          de: "Unternehmensverträge abschließen",
          it: "Chiudere contratti aziendali",
          pl: "Zamykanie kontraktów korporacyjnych",
          pt: "Fechando contratos corporativos",
          nl: "Bedrijfscontracten sluiten",
        },
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSeconds: 1080,
        order: 2,
      },
    ]);

    console.log("  ✓ Course 3 modules and lessons created");
  } else {
    console.log("  - Skipped existing course: business-growth");
  }

  console.log("\n✅ Academy seed complete.");
}
