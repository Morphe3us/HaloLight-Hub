// Editorial revision pins, not a source corpus. Changes require explicit review.
export const NAMESPACE = "halolight:corrected-content:fr";
export const REVISION = "2026-09-10";
export const CATEGORIES = [
  ["demarrer", "Bien démarrer"],
  ["logiciel", "LumaBooth & Configuration"],
  ["montage", "Installation & Matériel"],
  ["support", "Dépannage & Support"],
  ["business", "Développer son activité"],
  ["contrats", "Contrats & Gestion"],
] as const;

export interface Source {
  key: string;
  path: string;
  hash: string;
  bytes: number;
  kind: "pdf" | "faq" | "definition" | "business";
  category: string;
  title?: string;
  model?: string;
  revision?: string;
}

const pdfs: Array<[string, string, string, number, string, string, string?]> = [
  ["analyse-concurrentielle", "guides/AnalyseConcurrentielle15p.pdf", "75df59b96db79bf55448232fc921e519aec1cdee61e5e8a8e82784a0ba32cd05", 212297, "business", "Analyse concurrentielle"],
  ["booster-visibilite", "guides/BoosterVisibilite12p.pdf", "e9a840d88c30f2f490ef45fb919c4ed91fb9c1b5391179076c3c34323fd0ed73", 248012, "business", "Booster votre visibilité"],
  ["contrat", "guides/Contrat4p.pdf", "5ad27a55c398780e1a297a5ef489f9109a5a6687802ea30aa0b1298aa8def5cb", 144439, "contrats", "Contrat de location - trame illustrative non approuvée"],
  ["guide-ultime", "guides/GuideUltime94p.pdf", "62c08de0981195281fa94c86e408b0615727ebc4ea6423fc74bf40986c91134d", 6223026, "business", "Guide ultime"],
  ["lumabooth", "logiciel/Guide-LumaBooth-HaloLight-corrige.pdf", "0fb842bdd7ce11d97261d3fc9ee15588a7afcc7bb58842cfaa754a4e8f4496ff", 3302746, "logiciel", "Guide LumaBooth"],
  ["box", "montage/box-guide-corrige.pdf", "af5bb5f3d244745142bdaec38cbafde666ff8c984d0c754a6745d0d175b6024c", 3497745, "montage", "Manuel Box", "Box"],
  ["lumipix", "montage/lumipix-guide-corrige.pdf", "7c24c69c6272f69dc1cddd7ebf2c7d2d668c587abc63dc2eee1e730f18b3ca8c", 4052743, "montage", "Manuel Lumipix", "Lumipix"],
  ["miroir-glow", "montage/miroir-glow-guide-corrige.pdf", "f727fda8361188722aa08458133074e9692121d1bd172061cf0ddebcc26f5dde", 4576692, "montage", "Manuel Miroir Glow", "Miroir Glow"],
  ["miroir-halo", "montage/miroir-halo-guide-corrige.pdf", "e47b6fe53b6d5a78f3e7c73afe4e550970d2b0706310409967c9911e9324b139", 3819483, "montage", "Manuel Miroir Halo", "Miroir Halo"],
  ["miroir-mini", "montage/miroir-mini-guide-corrige.pdf", "8816fecd7c00181f0f2e77f828397588e7af3ded0727255fd8494ef6e95452ea", 4156611, "montage", "Manuel Miroir Mini", "Miroir Mini"],
  ["photobooth-mariage", "montage/photobooth-mariage-guide-corrige.pdf", "1523c64cf0a617c1cb73eb1fb54f3fa8f3eeb63fcb4b6be3218c75ad496144c7", 4105028, "montage", "Manuel Photobooth Mariage", "Photobooth Mariage"],
  ["snapsquare", "montage/snapsquare-guide-corrige.pdf", "6979d0b9b6367df06d460f920463e424ab2c349eae387ba64d4af8a8bbf7aad0", 3988648, "montage", "Manuel SnapSquare", "SnapSquare"],
  ["woody", "montage/woody-guide-corrige.pdf", "36ac838ab38b0a3a71ece1110588ee3b17b198cece50ffd39922a61f8bb07da2", 4292236, "montage", "Manuel Woody", "Woody"],
  ["assistance-technique", "support/assistance-technique-fr.pdf", "d26fea310069d0ec4b2f7661dcdb5beface4fa0458a864ca062241ad6063cd09", 75175, "support", "Assistance technique"],
  ["faq-support", "support/faq-support-photobooth-fr.pdf", "6cc8c8becc555c50497cd0bbd9a17b5daad495eaad64c5f445a3e2a7b76ae356", 96993, "support", "FAQ support photobooth"],
];

const faqs: Array<[string, string, number]> = [
  ["001", "b59ea3420e4a23182605adc2a51c2b346c8ac92f10a4d1828bb73742552f5f06", 2404],
  ["002", "14a14edc2901c35fe4a00b9afcc08f33183dd8f60e547a749d0a54dd8bf0b04a", 2809],
  ["003", "6b9cc6f8e733cc1da584db35137f2480e88169c98129373b509caf98f34b0e9d", 2685],
  ["004", "ab20fc71656ce04855e6e2547201d0d8ddf258ca430b4aa9b4f1a6728b0e7f25", 2429],
  ["005", "a5f0da196634bf7499577897786a5400ea5cdf9bf80d898ce029cc36efc56277", 2482],
  ["006", "7fc582b34a2d4fea2401208a98ae6e5b10c11bd142a175349a13a881e851265e", 2768],
  ["007", "af7d1b9a505562e71ad884cafc932af2750ace8b960ca4067f9173e4e0430efc", 2790],
  ["008", "ad160d986b5ae8b46ab98abcd8e318670f328e0a3c0842222d4b317ab186ce3f", 2826],
  ["009", "c1d83598ef60b7ccfff7cd47a8c2aa28b7b27ef562bf2c7ac0668574ab8ee166", 2904],
  ["010", "8e0b3290abd54ad2d427ab1cd4384371367c61b2cc40f07de69db3749d0c4a62", 2711],
  ["011", "aaeda96a6a316133a1fdea800b1efd5fd258047c009ae9765fdccd41536ee33d", 2765],
  ["012", "225699d6c75efe45aabad4923cebd77e99c34d1270169fda9873391f413d4b00", 2789],
  ["013", "d9b5c5fe9a477451076a02f586173b9011358d087f24a3c486d2b764cbbccaa6", 2759],
  ["014", "8e3141f2f4fbc6669fed28e2b77428ebb30a5ac74a440df462b4f8c18ef1cde5", 3179],
  ["015", "038c31e2d2335219ec6ad6c8bc7256a02659f303a6d6684bae4d4748650b7047", 2847],
  ["016", "0ef80e4a688107ac4a5733abc587f7448a48e35af1cb06a9c3f7c4a26eee238a", 2768],
  ["017", "520efe002a0c57c5e7b3df98f273f0c6e1db41bacbcbd4d30259775fa4fc51f2", 2646],
  ["018", "c56fdd33166d11c2c9263bf47b4263fbb7195fc1db46a4b04b40abd8428de3aa", 2592],
  ["019", "589f939647f93c987f802e58a75917f2585ba38fae230f1a0792588934ae1c67", 2678],
  ["020", "cc1d51c093c4fb0aaf2311ebee2f5249e1e01ad700b1d2e3207217c8559c7d4c", 2723],
  ["021", "a062cd7140ec30ab77f0c5db2ac272fb98efae49801eba484dbfb6a5794398dc", 2732],
  ["022", "ffe00664bda759428d9166fe9097107c109a41da9b9a47260a31132b3f610e61", 2819],
  ["023", "35c884fd9db25cea4d149955012eb2f644affe28552393969fedd10419045b64", 2702],
  ["024", "02cf8754959be689c99f837b40b4725a56389798ac60717347922a0cc3399158", 2778],
  ["025", "0608880ed314c2d6a419c259ad641e50a80a90ab1bbc1a8de650a9a3317c6fb2", 3803],
  ["026", "9aa3862ec46d68d6158ade84707df097dc2d95b842ac64e850fc22e965cd8cc7", 3114],
  ["027", "d17e930e73495d8d18f2ce5fa688dedce492c743e20df17556bf83c8685a45e9", 3218],
  ["028", "044cd595f5493b281cb0686aa3da293a3d70c2be9877d9c9ba9d93aad1095dba", 2982],
];

export const SOURCES: readonly Source[] = [
  ...pdfs.map(([key, path, hash, bytes, category, title, model]): Source => ({ key, path: `documents/${path}`, hash, bytes, category, title, model, kind: "pdf" })),
  ...faqs.map(([id, hash, bytes]): Source => ({ key: `faq-fr-${id}`, path: `kb-fr/faq/FAQ-FR-${id}.md`, hash, bytes, category: "support", kind: "faq", revision: id === "025" ? "1.1-corrigee" : "1.0-corrigee" })),
  { key: "definition-animateur", path: "chatbot/facts/animateur.fr-FR.md", hash: "1e9c3a10ed5ebb9d7f5d152eac82829754519181161c57a1109daadf1ac61011", bytes: 101, category: "demarrer", kind: "definition" },
  { key: "definition-calque", path: "chatbot/facts/calque.fr-FR.md", hash: "079801beedcbcd249609f7ca1525502e6b23ca3d3774df39937ad2a006d8e3c0", bytes: 106, category: "demarrer", kind: "definition" },
  { key: "definition-photobooth", path: "chatbot/facts/photobooth.fr-FR.md", hash: "ccaa932d28692c755971b83cd87b3cbfc65ffaa54c77a20c6cf5c575351a2cb3", bytes: 69, category: "demarrer", kind: "definition" },
  { key: "business-objectifs-visibilite", path: "documents/guides/BoosterVisibilite12p.md", hash: "966120ca3736f5c487508739b9567d8d4e0956110bd121aefeaf3485b720a08f", bytes: 13423, category: "business", kind: "business", title: "Trois objectifs de visibilité" },
];
