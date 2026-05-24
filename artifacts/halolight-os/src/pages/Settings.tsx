import { useEffect, useRef } from "react";
import {
  useGetCurrentUser, useUpdateCurrentUser,
  useGetNotificationPreferences, useUpdateNotificationPreferences,
  getGetCurrentUserQueryKey, getGetNotificationPreferencesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import i18n, { LANG_STORAGE_KEY } from "@/i18n";
import { AlertCircle } from "lucide-react";
import { CURRENCIES, CURRENCY_LABELS } from "@/lib/currency";

const profileSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  companyName: z.string().min(1, "Required"),
  phone: z.string().min(1, "Required"),
  language: z.enum(["en", "fr", "es", "de", "it", "pl", "pt", "nl"]),
  currency: z.string().min(1, "Required"),
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
  photobooths: z.string().optional().or(z.literal("")),
  businessGoal: z.string().optional().or(z.literal("")),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function Settings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: user, isLoading: isLoadingUser } = useGetCurrentUser();
  const { data: prefs, isLoading: isLoadingPrefs } = useGetNotificationPreferences();
  const updateUser = useUpdateCurrentUser();
  const updatePrefs = useUpdateNotificationPreferences();

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: "", lastName: "", companyName: "", phone: "",
      language: "en", currency: "EUR",
      country: "", city: "", birthday: "", website: "",
      instagram: "", facebook: "", pinterest: "", tiktok: "", linkedin: "",
      businessType: "", mainMarket: "", photobooths: "", businessGoal: "",
    }
  });

  const languageValue = watch("language");
  const currencyValue = watch("currency");
  const initRef = useRef(false);

  useEffect(() => {
    if (user && !initRef.current) {
      initRef.current = true;
      const u = user as any;
      setValue("firstName", u.firstName ?? "");
      setValue("lastName", u.lastName ?? "");
      setValue("companyName", u.companyName ?? "");
      setValue("phone", u.phone ?? "");
      setValue("language", u.language ?? "en");
      setValue("currency", u.currency ?? "EUR");
      setValue("country", u.country ?? "");
      setValue("city", u.city ?? "");
      setValue("birthday", u.birthday ?? "");
      setValue("website", u.website ?? "");
      setValue("instagram", u.instagram ?? "");
      setValue("facebook", u.facebook ?? "");
      setValue("pinterest", u.pinterest ?? "");
      setValue("tiktok", u.tiktok ?? "");
      setValue("linkedin", u.linkedin ?? "");
      setValue("businessType", u.businessType ?? "");
      setValue("mainMarket", u.mainMarket ?? "");
      setValue("photobooths", u.photobooths != null ? String(u.photobooths) : "");
      setValue("businessGoal", u.businessGoal ?? "");
    }
  }, [user, setValue]);

  const onSubmitProfile = (data: ProfileFormValues) => {
    const payload = {
      ...data,
      fullName: `${data.firstName} ${data.lastName}`.trim(),
      photobooths: data.photobooths ? parseInt(data.photobooths as string) : undefined,
    };
    updateUser.mutate({ data: payload as any }, {
      onSuccess: () => {
        i18n.changeLanguage(data.language);
        localStorage.setItem(LANG_STORAGE_KEY, data.language);
        toast({ title: t("settings.saved") });
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      },
      onError: () => {
        toast({ title: t("common.error"), variant: "destructive" });
      }
    });
  };

  const handleTogglePref = (key: "emailEnabled" | "inAppEnabled", checked: boolean) => {
    updatePrefs.mutate({ data: { [key]: checked } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetNotificationPreferencesQueryKey() });
      }
    });
  };

  const u = user as any;
  const isMissingRequired = u && (!u.firstName || !u.lastName || !u.companyName || !u.phone);

  if (isLoadingUser || isLoadingPrefs) {
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
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("settings.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("settings.subtitle", { defaultValue: "Manage your account preferences and profile." })}</p>
      </div>

      {isMissingRequired && (
        <Alert className="border-warning/30 bg-warning/8">
          <AlertCircle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning">
            <span className="font-semibold">{t("settings.profile_complete_title")}</span>
            {" — "}{t("settings.profile_complete_desc")}
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmitProfile)} className="space-y-6">

        {/* Required Profile */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{t("settings.profile")}</CardTitle>
            <CardDescription>{t("settings.profile_desc", { defaultValue: "Update your personal and company information." })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="firstName">{t("settings.first_name")} *</Label>
                <Input id="firstName" {...register("firstName")} data-testid="input-firstname" />
                {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">{t("settings.last_name")} *</Label>
                <Input id="lastName" {...register("lastName")} data-testid="input-lastname" />
                {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t("settings.email")}</Label>
                <Input id="email" value={u?.email ?? ""} disabled className="bg-muted" />
                <p className="text-xs text-muted-foreground">{t("settings.email_managed", { defaultValue: "Managed via Clerk" })}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyName">{t("settings.company_name")} *</Label>
                <Input id="companyName" {...register("companyName")} data-testid="input-companyname" />
                {errors.companyName && <p className="text-xs text-destructive">{errors.companyName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{t("settings.phone")} *</Label>
                <Input id="phone" {...register("phone")} data-testid="input-phone" />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="language">{t("settings.language")}</Label>
                <Select value={languageValue} onValueChange={(v) => setValue("language", v as any)}>
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
                <Select value={currencyValue} onValueChange={(v) => setValue("currency", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("settings.currency_select")} />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{CURRENCY_LABELS[c] ?? c}</SelectItem>
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
            <CardDescription>{t("settings.contact_info_desc", { defaultValue: "Optional location and web presence details." })}</CardDescription>
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
                <Input id="website" {...register("website")} placeholder="https://" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Social Media */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{t("settings.social_media")}</CardTitle>
            <CardDescription>{t("settings.social_media_desc", { defaultValue: "Links to your social profiles." })}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="instagram">{t("settings.instagram")}</Label>
                <Input id="instagram" {...register("instagram")} placeholder="@handle or URL" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="facebook">{t("settings.facebook")}</Label>
                <Input id="facebook" {...register("facebook")} placeholder="URL or page name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pinterest">{t("settings.pinterest")}</Label>
                <Input id="pinterest" {...register("pinterest")} placeholder="@handle or URL" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tiktok">{t("settings.tiktok")}</Label>
                <Input id="tiktok" {...register("tiktok")} placeholder="@handle" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="linkedin">{t("settings.linkedin")}</Label>
                <Input id="linkedin" {...register("linkedin")} placeholder="LinkedIn URL" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Business Info */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{t("settings.business_info")}</CardTitle>
            <CardDescription>{t("settings.business_info_desc", { defaultValue: "Help us tailor the platform to your business." })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="businessType">{t("settings.business_type")}</Label>
                <Input id="businessType" {...register("businessType")} placeholder="e.g. Photobooth rental, Event photography" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mainMarket">{t("settings.main_market")}</Label>
                <Input id="mainMarket" {...register("mainMarket")} placeholder="e.g. United States, UK" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="photobooths">{t("settings.photobooths")}</Label>
                <Input id="photobooths" type="number" min="0" {...register("photobooths")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessGoal">{t("settings.business_goal")}</Label>
              <Textarea id="businessGoal" {...register("businessGoal")} rows={3} placeholder="e.g. Expand to corporate events, grow to 10 units" />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={updateUser.isPending} data-testid="button-save-profile">
            {updateUser.isPending ? t("settings.saving") : t("settings.save")}
          </Button>
        </div>
      </form>

      {/* Notification Preferences */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>{t("settings.notifications")}</CardTitle>
          <CardDescription>{t("settings.notifications_desc", { defaultValue: "Control how you receive alerts and updates." })}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">{t("settings.email_notifications")}</Label>
              <p className="text-sm text-muted-foreground">{t("settings.email_notifications_desc", { defaultValue: "Receive daily summaries and critical alerts via email." })}</p>
            </div>
            <Switch
              checked={prefs?.emailEnabled}
              onCheckedChange={(c) => handleTogglePref("emailEnabled", c)}
              disabled={updatePrefs.isPending}
              data-testid="switch-email-notif"
            />
          </div>
          <div className="h-px bg-muted w-full" />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">{t("settings.in_app_notifications")}</Label>
              <p className="text-sm text-muted-foreground">{t("settings.in_app_notifications_desc", { defaultValue: "Show alerts inside the dashboard." })}</p>
            </div>
            <Switch
              checked={prefs?.inAppEnabled}
              onCheckedChange={(c) => handleTogglePref("inAppEnabled", c)}
              disabled={updatePrefs.isPending}
              data-testid="switch-inapp-notif"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
