import { useEffect, useRef } from "react";
import {
  useGetCurrentUser,
  useUpdateCurrentUser,
  useGetNotificationPreferences,
  useUpdateNotificationPreferences,
  getGetCurrentUserQueryKey,
  getGetNotificationPreferencesQueryKey,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { setAppLanguage } from "@/i18n";
import {
  AlertCircle,
  Sun,
  Moon,
  Monitor,
  Download,
  RefreshCw,
} from "lucide-react";
import { CURRENCIES, CURRENCY_LABELS } from "@/lib/currency";
import { syncLanguageCaches } from "@/lib/languageQueries";
import { useTheme } from "@/components/theme-provider";
import { useState } from "react";
import { getAuthToken } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { isPlaceholderEmail, resolveCurrentUserIdentity } from "@/lib/currentUserIdentity";

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "Required"),
  lastName: z.string().trim().min(1, "Required"),
  companyName: z.string().trim().min(1, "Required"),
  companyAddress: z.string().optional().or(z.literal("")),
  phone: z.string().trim().min(1, "Required"),
  language: z.enum(["en", "fr", "es", "de", "it", "pl", "pt", "nl"]),
  currency: z.string().trim().min(1, "Required"),
  country: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  birthday: z.string().optional().or(z.literal("")),
  website: z.string().optional().or(z.literal("")),
  instagram: z.string().optional().or(z.literal("")),
  facebook: z.string().optional().or(z.literal("")),
  pinterest: z.string().optional().or(z.literal("")),
  tiktok: z.string().optional().or(z.literal("")),
  linkedin: z.string().optional().or(z.literal("")),
  businessType: z.string().optional().or(z.literal("")),
  mainMarket: z.string().optional().or(z.literal("")),
  taxId: z.string().optional().or(z.literal("")),
  photobooths: z.string().optional().or(z.literal("")),
  businessGoal: z.string().optional().or(z.literal("")),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

function filledString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function PersonalExportCard() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/exports/personal", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const date = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `halolight-personal-data-${date}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 1000);
      toast({
        title: t("settings.export_data", { defaultValue: "Export My Data" }),
        description: `halolight-personal-data-${date}.json`,
      });
    } catch (err) {
      toast({
        title: "Export failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>
          {t("settings.export_data", { defaultValue: "Export My Data" })}
        </CardTitle>
        <CardDescription>
          {t("settings.export_data_desc", {
            defaultValue:
              "Download all your personal data as a JSON file (GDPR Article 20 — Right to Data Portability).",
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          onClick={handleExport}
          disabled={loading}
          variant="outline"
          className="gap-2"
        >
          {loading ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {loading
            ? t("settings.export_data_downloading", {
                defaultValue: "Preparing export…",
              })
            : t("settings.export_data_btn", {
                defaultValue: "Download Personal Data",
              })}
        </Button>
      </CardContent>
    </Card>
  );
}

export function NotificationPreferences() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const prefs = useGetNotificationPreferences();
  const update = useUpdateNotificationPreferences({ mutation: {
    onSuccess: async (data) => {
      const queryKey = getGetNotificationPreferencesQueryKey();
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, data);
    },
  } });
  const saving = useRef(false);
  const attempted = useRef(false);
  const ready = !prefs.isLoading && !prefs.isError && typeof prefs.data?.inAppEnabled === "boolean";
  const busy = prefs.isFetching || update.isPending;

  const save = (checked: boolean) => {
    if (!ready || busy || saving.current) return;
    saving.current = true;
    attempted.current = checked;
    update.mutate({ data: { inAppEnabled: checked } }, {
      onSettled: () => { saving.current = false; },
    });
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{t("settings.notifications")}</CardTitle>
        <CardDescription>{t("settings.notifications_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="min-w-0 space-y-0.5 break-words">
          <p className="text-base font-medium">{t("settings.email_notifications")}</p>
          <p className="text-sm text-muted-foreground">{t("settings.email_notifications_desc")}</p>
        </div>
        <div className="h-px bg-muted w-full" />
        <div className="flex items-center justify-between gap-4" aria-busy={busy}>
          <div className="min-w-0 space-y-0.5 break-words">
            <Label htmlFor="settings-inapp-notifications" className="text-base">
              {t("settings.in_app_notifications")}
            </Label>
            <p id="settings-inapp-description" className="text-sm text-muted-foreground">
              {t("settings.in_app_notifications_desc")}
            </p>
          </div>
          <Switch
            id="settings-inapp-notifications"
            className="shrink-0"
            aria-describedby="settings-inapp-description"
            checked={prefs.data?.inAppEnabled === true}
            onCheckedChange={save}
            disabled={!ready || busy}
            data-testid="switch-inapp-notif"
          />
        </div>
        <div className="min-h-6 text-sm" role="status" aria-live="polite">
          {update.isPending ? t("settings.saving") : prefs.isFetching || prefs.isLoading
            ? t("common.loading") : update.isSuccess && !prefs.isError ? t("settings.saved") : null}
        </div>
        {(!prefs.isLoading && !ready || update.isError) && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{t("common.error")}</span>
              <Button type="button" variant="outline" disabled={busy}
                onClick={() => { if (!ready) void prefs.refetch(); else save(attempted.current); }}>
                <RefreshCw className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                {t("common.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const { data: user, isLoading: isLoadingUser } = useGetCurrentUser();
  const { user: clerkUser, isLoaded: isClerkLoaded } = useUser();
  useEffect(() => {
    const scrollToLogo = () => {
      if (!isLoadingUser && isClerkLoaded && window.location.hash === "#company-logo") {
        document.getElementById("company-logo")?.scrollIntoView({ block: "start" });
      }
    };
    scrollToLogo();
    window.addEventListener("hashchange", scrollToLogo);
    return () => window.removeEventListener("hashchange", scrollToLogo);
  }, [isLoadingUser, isClerkLoaded]);
  const updateUser = useUpdateCurrentUser();
  const sigInitRef = useRef(false);
  const [sigForm, setSigForm] = useState({
    providerSignature: "",
    providerSignerTitle: "",
  });
  const [sigSaving, setSigSaving] = useState(false);

  // Logo upload state
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoForm, setLogoForm] = useState({ logoUrl: "" });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoSaving, setLogoSaving] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      companyName: "",
      phone: "",
      companyAddress: "",
      taxId: "",
      language: "en",
      currency: "EUR",
      country: "",
      city: "",
      birthday: "",
      website: "",
      instagram: "",
      facebook: "",
      pinterest: "",
      tiktok: "",
      linkedin: "",
      businessType: "",
      mainMarket: "",
      photobooths: "",
      businessGoal: "",
    },
  });

  const languageValue = watch("language");
  const currencyValue = watch("currency");
  const initializedProfileUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (user && !sigInitRef.current) {
      sigInitRef.current = true;
      const u = user as any;
      setSigForm({
        providerSignature: u.providerSignature ?? "",
        providerSignerTitle: u.providerSignerTitle ?? "",
      });
      const existingLogo = u.logoUrl ?? "";
      setLogoForm({ logoUrl: existingLogo });
      setLogoPreview(existingLogo || null);
    }
  }, [user]);

  useEffect(() => {
    if (!user || !isClerkLoaded) return;
    const u = user as any;
    const userId = filledString(u.id, "current-user");
    const isSameUser = initializedProfileUserIdRef.current === userId;
    if (isSameUser && isDirty) return;

    reset({
      firstName: filledString(u.firstName, clerkUser?.firstName ?? ""),
      lastName: filledString(u.lastName, clerkUser?.lastName ?? ""),
      companyName: filledString(u.companyName),
      companyAddress: filledString(u.companyAddress),
      phone: filledString(u.phone),
      language: u.language ?? "en",
      currency: filledString(u.currency, "EUR"),
      country: filledString(u.country),
      city: filledString(u.city),
      birthday: filledString(u.birthday),
      website: filledString(u.website),
      instagram: filledString(u.instagram),
      facebook: filledString(u.facebook),
      pinterest: filledString(u.pinterest),
      tiktok: filledString(u.tiktok),
      linkedin: filledString(u.linkedin),
      businessType: filledString(u.businessType),
      mainMarket: filledString(u.mainMarket),
      taxId: filledString(u.taxId),
      photobooths: u.photobooths != null ? String(u.photobooths) : "",
      businessGoal: filledString(u.businessGoal),
    });
    initializedProfileUserIdRef.current = userId;
  }, [
    clerkUser?.firstName,
    clerkUser?.lastName,
    isClerkLoaded,
    isDirty,
    reset,
    user,
  ]);

  const onSubmitProfile = (data: ProfileFormValues) => {
    const payload = {
      ...data,
      fullName: `${data.firstName} ${data.lastName}`.trim(),
      photobooths: data.photobooths
        ? parseInt(data.photobooths as string)
        : undefined,
    };
    updateUser.mutate(
      { data: payload as any },
      {
        onSuccess: (updatedUser) => {
          queryClient.setQueryData(getGetCurrentUserQueryKey(), updatedUser);
          void setAppLanguage(data.language);
          toast({ title: t("settings.saved") });
          syncLanguageCaches(queryClient, data.language);
        },
        onError: () => {
          toast({ title: t("common.error"), variant: "destructive" });
        },
      },
    );
  };

  const handleSaveSignature = () => {
    setSigSaving(true);
    updateUser.mutate(
      {
        data: {
          providerSignature: sigForm.providerSignature || null,
          providerSignerTitle: sigForm.providerSignerTitle || null,
        } as any,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetCurrentUserQueryKey(),
          });
          toast({
            title: t("contracts.provider_signature_saved", {
              defaultValue: "Signature saved",
            }),
          });
          setSigSaving(false);
        },
        onError: () => {
          toast({ title: t("common.error"), variant: "destructive" });
          setSigSaving(false);
        },
      },
    );
  };

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: t("settings.logo_too_large", {
          defaultValue: "Logo file is too large (max 2 MB)",
        }),
        variant: "destructive",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setLogoPreview(dataUrl);
      setLogoForm({ logoUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const handleSaveLogo = () => {
    setLogoSaving(true);
    updateUser.mutate(
      { data: { logoUrl: logoForm.logoUrl || null } as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetCurrentUserQueryKey(),
          });
          toast({
            title: t("settings.logo_saved", { defaultValue: "Logo saved" }),
          });
          setLogoSaving(false);
        },
        onError: () => {
          toast({ title: t("common.error"), variant: "destructive" });
          setLogoSaving(false);
        },
      },
    );
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setLogoForm({ logoUrl: "" });
    if (logoInputRef.current) logoInputRef.current.value = "";
  };

  const u = user as any;
  const identity = resolveCurrentUserIdentity(user, clerkUser);
  const displayEmail = isPlaceholderEmail(u?.email) ? identity.email : u?.email ?? "";
  const isMissingRequired =
    u &&
    (!filledString(u.firstName) ||
      !filledString(u.lastName) ||
      !filledString(u.companyName) ||
      !filledString(u.phone));

  if (isLoadingUser || !isClerkLoaded) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
        <Skeleton className="h-[200px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8" data-testid="page-settings">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {t("settings.title")}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t("settings.subtitle", {
            defaultValue: "Manage your account preferences and profile.",
          })}
        </p>
      </div>

      {isMissingRequired && (
        <Alert className="border-warning/30 bg-warning/8">
          <AlertCircle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning">
            <span className="font-semibold">
              {t("settings.profile_complete_title")}
            </span>
            {" — "}
            {t("settings.profile_complete_desc")}
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmitProfile)} className="space-y-6">
        {/* Required Profile */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{t("settings.profile")}</CardTitle>
            <CardDescription>
              {t("settings.profile_desc", {
                defaultValue: "Update your personal and company information.",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="firstName">{t("settings.first_name")} *</Label>
                <Input
                  id="firstName"
                  {...register("firstName")}
                  data-testid="input-firstname"
                />
                {errors.firstName && (
                  <p className="text-xs text-destructive">
                    {errors.firstName.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">{t("settings.last_name")} *</Label>
                <Input
                  id="lastName"
                  {...register("lastName")}
                  data-testid="input-lastname"
                />
                {errors.lastName && (
                  <p className="text-xs text-destructive">
                    {errors.lastName.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t("settings.email")}</Label>
                <Input
                  id="email"
                  value={displayEmail}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  {t("settings.email_managed", {
                    defaultValue: "Managed via Clerk",
                  })}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyName">
                  {t("settings.company_name")} *
                </Label>
                <Input
                  id="companyName"
                  {...register("companyName")}
                  data-testid="input-companyname"
                />
                {errors.companyName && (
                  <p className="text-xs text-destructive">
                    {errors.companyName.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{t("settings.phone")} *</Label>
                <Input
                  id="phone"
                  {...register("phone")}
                  data-testid="input-phone"
                />
                {errors.phone && (
                  <p className="text-xs text-destructive">
                    {errors.phone.message}
                  </p>
                )}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="companyAddress">
                  {t("settings.company_address")}
                </Label>
                <Input
                  id="companyAddress"
                  {...register("companyAddress")}
                  placeholder={t("settings.company_address_placeholder", {
                    defaultValue: "Street, postal code, city, country",
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="language">{t("settings.language")}</Label>
                <Select
                  value={languageValue}
                  onValueChange={(v) => setValue("language", v as any)}
                >
                  <SelectTrigger data-testid="select-language">
                    <SelectValue placeholder={t("settings.language_select")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="de">Deutsch</SelectItem>
                    <SelectItem value="it">Italiano</SelectItem>
                    <SelectItem value="pl">Polski</SelectItem>
                    <SelectItem value="pt">Português</SelectItem>
                    <SelectItem value="nl">Nederlands</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">{t("settings.currency")} *</Label>
                <Select
                  value={currencyValue}
                  onValueChange={(v) => setValue("currency", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("settings.currency_select")} />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CURRENCY_LABELS[c] ?? c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact & Location */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{t("settings.contact_info")}</CardTitle>
            <CardDescription>
              {t("settings.contact_info_desc", {
                defaultValue: "Optional location and web presence details.",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="country">{t("settings.country")}</Label>
                <Input id="country" {...register("country")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">{t("settings.city")}</Label>
                <Input id="city" {...register("city")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthday">{t("settings.birthday")}</Label>
                <Input id="birthday" type="date" {...register("birthday")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">{t("settings.website")}</Label>
                <Input
                  id="website"
                  {...register("website")}
                  placeholder="https://"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Social Media */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{t("settings.social_media")}</CardTitle>
            <CardDescription>
              {t("settings.social_media_desc", {
                defaultValue: "Links to your social profiles.",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="instagram">{t("settings.instagram")}</Label>
                <Input
                  id="instagram"
                  {...register("instagram")}
                  placeholder="@handle or URL"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="facebook">{t("settings.facebook")}</Label>
                <Input
                  id="facebook"
                  {...register("facebook")}
                  placeholder="URL or page name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pinterest">{t("settings.pinterest")}</Label>
                <Input
                  id="pinterest"
                  {...register("pinterest")}
                  placeholder="@handle or URL"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tiktok">{t("settings.tiktok")}</Label>
                <Input
                  id="tiktok"
                  {...register("tiktok")}
                  placeholder="@handle"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="linkedin">{t("settings.linkedin")}</Label>
                <Input
                  id="linkedin"
                  {...register("linkedin")}
                  placeholder="LinkedIn URL"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Business Info */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{t("settings.business_info")}</CardTitle>
            <CardDescription>
              {t("settings.business_info_desc", {
                defaultValue: "Help us tailor the platform to your business.",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="businessType">
                  {t("settings.business_type")}
                </Label>
                <Input
                  id="businessType"
                  {...register("businessType")}
                  placeholder="e.g. Photobooth rental, Event photography"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mainMarket">{t("settings.main_market")}</Label>
                <Input
                  id="mainMarket"
                  {...register("mainMarket")}
                  placeholder="e.g. United States, UK"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxId">{t("settings.tax_id")}</Label>
                <Input
                  id="taxId"
                  {...register("taxId")}
                  placeholder={t("settings.tax_id_placeholder", {
                    defaultValue: "VAT, GST or tax registration number",
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="photobooths">{t("settings.photobooths")}</Label>
                <Input
                  id="photobooths"
                  type="number"
                  min="0"
                  {...register("photobooths")}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessGoal">
                {t("settings.business_goal")}
              </Label>
              <Textarea
                id="businessGoal"
                {...register("businessGoal")}
                rows={3}
                placeholder="e.g. Expand to corporate events, grow to 10 units"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row justify-end gap-2">
          <Button
            type="submit"
            disabled={updateUser.isPending}
            className="w-full sm:w-auto"
            data-testid="button-save-profile"
          >
            {updateUser.isPending ? t("settings.saving") : t("settings.save")}
          </Button>
        </div>
      </form>

      {/* Appearance */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>
            {t("settings.appearance", { defaultValue: "Appearance" })}
          </CardTitle>
          <CardDescription>
            {t("settings.appearance_desc", {
              defaultValue: "Choose how HaloLight OS looks on your device.",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                value: "light",
                label: t("settings.theme_light", { defaultValue: "Light" }),
                icon: Sun,
              },
              {
                value: "dark",
                label: t("settings.theme_dark", { defaultValue: "Dark" }),
                icon: Moon,
              },
              {
                value: "system",
                label: t("settings.theme_system", { defaultValue: "System" }),
                icon: Monitor,
              },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value as "light" | "dark" | "system")}
                className={`flex items-center gap-3 rounded-xl border-2 p-4 text-sm font-medium transition-all ${
                  theme === value
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                <Icon
                  className={`w-5 h-5 ${theme === value ? "text-primary" : ""}`}
                />
                <span>{label}</span>
                {theme === value && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Company Logo for Documents */}
      <Card id="company-logo" className="shadow-sm scroll-mt-24">
        <CardHeader>
          <CardTitle>
            {t("settings.logo_title", { defaultValue: "Company Logo" })}
          </CardTitle>
          <CardDescription>
            {t("settings.logo_desc", {
              defaultValue:
                "Shown on quotes, contracts and invoices. If not set, no logo appears on your documents.",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={handleLogoFile}
          />
          {logoPreview ? (
            <div className="flex items-start gap-4">
              <div className="flex-1 border rounded-xl overflow-hidden bg-muted/30 p-4 flex items-center justify-center min-h-[80px]">
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="max-h-20 max-w-full object-contain"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRemoveLogo}
              >
                {t("common.remove", { defaultValue: "Remove" })}
              </Button>
            </div>
          ) : (
            <div className="border-2 border-dashed rounded-xl p-6 text-center text-muted-foreground text-sm">
              {t("settings.logo_empty", {
                defaultValue: "No logo uploaded yet.",
              })}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="https://example.com/logo.png"
              value={
                logoForm.logoUrl.startsWith("data:") ? "" : logoForm.logoUrl
              }
              onChange={(e) => {
                setLogoForm({ logoUrl: e.target.value });
                setLogoPreview(e.target.value || null);
              }}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => logoInputRef.current?.click()}
            >
              {t("settings.logo_upload_btn", { defaultValue: "Upload file" })}
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={logoSaving}
            onClick={handleSaveLogo}
          >
            {logoSaving ? t("settings.saving") : t("settings.save")}
          </Button>
        </CardContent>
      </Card>

      {/* Provider Signature for Contracts */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>
            {t("contracts.provider_signature_section", {
              defaultValue: "Provider Signature for Contracts",
            })}
          </CardTitle>
          <CardDescription>
            {t("contracts.provider_signature_desc", {
              defaultValue:
                "When set, this text appears as the provider signature in generated contracts.",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="providerSignerTitle">
                {t("contracts.provider_signer_title_label", {
                  defaultValue: "Signer Title (optional)",
                })}
              </Label>
              <Input
                id="providerSignerTitle"
                value={sigForm.providerSignerTitle}
                onChange={(e) =>
                  setSigForm((p) => ({
                    ...p,
                    providerSignerTitle: e.target.value,
                  }))
                }
                placeholder="CEO, Manager, Director…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="providerSignature">
                {t("contracts.provider_signature_label", {
                  defaultValue: "Typed Signature (optional)",
                })}
              </Label>
              <Input
                id="providerSignature"
                value={sigForm.providerSignature}
                onChange={(e) =>
                  setSigForm((p) => ({
                    ...p,
                    providerSignature: e.target.value,
                  }))
                }
                placeholder="/Jean Dupont/"
              />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={sigSaving}
            onClick={handleSaveSignature}
          >
            {sigSaving ? t("settings.saving") : t("settings.save")}
          </Button>
        </CardContent>
      </Card>

      {/* Personal Data Export (GDPR) */}
      <PersonalExportCard />

      {/* Notification Preferences */}
      <NotificationPreferences />
    </div>
  );
}
