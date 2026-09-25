import { lazy } from "react";
import { retryablePageLoader } from "./pageLoader";

export const protectedPages = [
  { path: "/dashboard", load: () => import("../pages/Dashboard"), admin: false },
  { path: "/academy", load: () => import("../pages/Academy"), admin: false },
  { path: "/academy/:courseId/:lessonId", load: () => import("../pages/AcademyLesson"), admin: false },
  { path: "/academy/:courseId", load: () => import("../pages/AcademyCourse"), admin: false },
  { path: "/events", load: () => import("../pages/Events"), admin: false },
  { path: "/crm/leads/:id", load: () => import("../pages/LeadDetail"), admin: false },
  { path: "/crm/leads", load: () => import("../pages/Leads"), admin: false },
  { path: "/quotes/:id", load: () => import("../pages/QuoteDetail"), admin: false },
  { path: "/quotes", load: () => import("../pages/Quotes"), admin: false },
  { path: "/contracts/:id", load: () => import("../pages/ContractDetail"), admin: false },
  { path: "/contracts", load: () => import("../pages/Contracts"), admin: false },
  { path: "/invoices/:id", load: () => import("../pages/InvoiceDetail"), admin: false },
  { path: "/invoices", load: () => import("../pages/Invoices"), admin: false },
  { path: "/support/tickets/:id", load: () => import("../pages/TicketDetail"), admin: false },
  { path: "/support", load: () => import("../pages/Support"), admin: false },
  { path: "/kb/admin", load: () => import("../pages/KBAdmin"), admin: true },
  { path: "/kb/articles/:id", load: () => import("../pages/KBArticle"), admin: false },
  { path: "/kb", load: () => import("../pages/KnowledgeBase"), admin: false },
  { path: "/ai", load: () => import("../pages/AIAssistant"), admin: false },
  { path: "/community/posts/:id", load: () => import("../pages/PostDetail"), admin: false },
  { path: "/community/:id", load: () => import("../pages/CommunityChannel"), admin: false },
  { path: "/community", load: () => import("../pages/Community"), admin: false },
  { path: "/notifications", load: () => import("../pages/Notifications"), admin: false },
  { path: "/onboarding", load: () => import("../pages/Onboarding"), admin: false },
  { path: "/settings", load: () => import("../pages/Settings"), admin: false },
  { path: "/admin/roles", load: () => import("../pages/AdminRoles"), admin: true },
  { path: "/admin/settings", load: () => import("../pages/AdminSettings"), admin: true },
  { path: "/admin/branding", load: () => import("../pages/AdminSettings"), admin: true },
  { path: "/admin/notifications", load: () => import("../pages/AdminSettings"), admin: true },
  { path: "/admin/analytics", load: () => import("../pages/AdminAnalytics"), admin: true },
  { path: "/admin/revenue", load: () => import("../pages/AdminRevenue"), admin: true },
  { path: "/admin/clients/:id", load: () => import("../pages/Client360"), admin: true },
  { path: "/admin/clients", load: () => import("../pages/AdminClients"), admin: true },
  { path: "/admin/equipment", load: () => import("../pages/AdminEquipment"), admin: true },
  { path: "/admin/automation", load: () => import("../pages/AdminAutomation"), admin: true },
  { path: "/admin/academy", load: () => import("../pages/AdminAcademy"), admin: true },
  { path: "/admin/resources", load: () => import("../pages/AdminResources"), admin: true },
  { path: "/admin/search", load: () => import("../pages/AdminSearch"), admin: true },
  { path: "/admin/translations", load: () => import("../pages/AdminTranslations"), admin: true },
  { path: "/admin/uploads", load: () => import("../pages/AdminUploads"), admin: true },
  { path: "/admin/ai-knowledge", load: () => import("../pages/AdminAIKnowledge"), admin: true },
  { path: "/admin/backup", load: () => import("../pages/AdminBackup"), admin: true },
  { path: "/admin/exports", load: () => import("../pages/AdminExports"), admin: true },
  { path: "/admin/contract-templates", load: () => import("../pages/AdminContractTemplates"), admin: true },
  { path: "/admin", load: () => import("../pages/Admin"), admin: true },
  { path: "/equipment/:id", load: () => import("../pages/EquipmentDetail"), admin: false },
  { path: "/equipment", load: () => import("../pages/Equipment"), admin: false },
  { path: "/consumables", load: () => import("../pages/Consumables"), admin: false },
].map((route) => {
  const load = retryablePageLoader(route.load);
  return { ...route, load, component: lazy(load) };
});

export function preloadSidebarPage(href: string): void {
  const page = protectedPages.find(({ path }) => path === href);
  // Sidebar leaves are exact destinations. Import code without mounting queries.
  void page?.load().catch(() => {});
}
