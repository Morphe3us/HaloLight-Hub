import type { ComponentType } from "react";
import {
  LayoutDashboard, GraduationCap, Calendar, Users, TrendingUp, FileText,
  FileSignature, ReceiptText, LifeBuoy, BookOpen, Sparkles, Settings,
  UserRound, Bell, CheckCircle2, Monitor, Package,
  Shield, BarChart3, DollarSign, UserCheck, Zap, LibraryBig, Search,
  Languages, FolderUp, Brain, HardDrive, DownloadCloud,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  badge?: boolean;
  children?: NavItem[];
};

export function isNavItemActive(item: NavItem, location: string): boolean {
  if (item.children) return item.children.some((child) => isNavItemActive(child, location));
  const pathname = location.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  return pathname === item.href || (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
}

export function hasNotificationBadge(item: NavItem): boolean {
  return !!item.badge || !!item.children?.some(hasNotificationBadge);
}

export function createAdminNavigation(t: (key: string) => string): NavItem[] {
  return [{ title: t("nav.admin_section"), href: "/admin", icon: Shield, children: [
    { title: t("nav.admin_pilotage"), href: "/admin/group/pilotage", icon: BarChart3, children: [
      { title: t("nav.analytics"), href: "/admin/analytics", icon: BarChart3 },
      { title: t("nav.revenue"), href: "/admin/revenue", icon: DollarSign },
    ] },
    { title: t("nav.admin_operations"), href: "/admin/group/operations", icon: UserCheck, children: [
      { title: t("nav.clients"), href: "/admin/clients", icon: UserCheck },
      { title: t("nav.equipment"), href: "/admin/equipment", icon: Monitor },
      { title: t("nav.automation"), href: "/admin/automation", icon: Zap },
      { title: t("nav.contract_templates"), href: "/admin/contract-templates", icon: FileSignature },
    ] },
    { title: t("nav.admin_content_ai"), href: "/admin/group/content", icon: LibraryBig, children: [
      { title: t("nav.academy"), href: "/admin/academy", icon: GraduationCap },
      { title: t("nav.resources"), href: "/admin/resources", icon: LibraryBig },
      { title: t("nav.ai_knowledge"), href: "/admin/ai-knowledge", icon: Brain },
      { title: t("nav.uploads"), href: "/admin/uploads", icon: FolderUp },
      { title: t("nav.translations"), href: "/admin/translations", icon: Languages },
    ] },
    { title: t("nav.admin_data_system"), href: "/admin/group/data", icon: HardDrive, children: [
      { title: t("nav.backup"), href: "/admin/backup", icon: HardDrive },
      { title: t("nav.exports"), href: "/admin/exports", icon: DownloadCloud },
    ] },
    { title: t("nav.settings"), href: "/admin/group/settings", icon: Settings, children: [
      { title: t("nav.users"), href: "/admin", icon: Users },
      { title: t("nav.search_admin"), href: "/admin/search", icon: Search },
    ] },
  ] }];
}

export function createClientNavigation(t: (key: string) => string): NavItem[] {
  return [
    { title: t("nav.dashboard"), href: "/dashboard", icon: LayoutDashboard },
    { title: t("nav.academy"), href: "/academy", icon: GraduationCap },
    { title: t("nav.events"), href: "/events", icon: Calendar },
    {
      title: t("nav.clients"), href: "/crm", icon: Users,
      children: [
        { title: t("nav.leads"), href: "/crm/leads", icon: TrendingUp },
        { title: t("nav.quotes"), href: "/quotes", icon: FileText },
        { title: t("nav.contracts"), href: "/contracts", icon: FileSignature },
        { title: t("nav.invoices"), href: "/invoices", icon: ReceiptText },
      ],
    },
    {
      title: t("nav.support"), href: "/support", icon: LifeBuoy,
      children: [
        { title: t("nav.tickets"), href: "/support", icon: LifeBuoy },
        { title: t("nav.kb"), href: "/kb", icon: BookOpen },
        { title: t("nav.ai_assistant"), href: "/ai", icon: Sparkles },
      ],
    },
    {
      title: t("nav.settings"), href: "/settings", icon: Settings,
      children: [
        { title: t("nav.profile"), href: "/settings", icon: UserRound },
        { title: t("nav.notifications"), href: "/notifications", icon: Bell, badge: true },
        { title: t("nav.onboarding"), href: "/onboarding", icon: CheckCircle2 },
        {
          title: t("nav.hardware"), href: "/equipment", icon: Monitor,
          children: [
            { title: t("nav.equipment"), href: "/equipment", icon: Monitor },
            { title: t("nav.consumables"), href: "/consumables", icon: Package },
          ],
        },
      ],
    },
  ];
}
