import type { ComponentType } from "react";
import {
  LayoutDashboard, GraduationCap, Calendar, Users, TrendingUp, FileText,
  FileSignature, ReceiptText, LifeBuoy, BookOpen, Sparkles, Settings,
  UserRound, Bell, CheckCircle2, Monitor, Package,
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
