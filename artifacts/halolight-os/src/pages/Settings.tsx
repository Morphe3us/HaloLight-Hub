import { useGetCurrentUser, useUpdateCurrentUser, useGetNotificationPreferences, useUpdateNotificationPreferences, getGetCurrentUserQueryKey, getGetNotificationPreferencesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import i18n, { LANG_STORAGE_KEY } from "@/i18n";

const profileSchema = z.object({
  fullName: z.string().min(2, "Name is too short").optional().or(z.literal("")),
  companyName: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  language: z.enum(['en', 'fr', 'es', 'de', 'it', 'pl', 'pt', 'nl']),
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
      fullName: "",
      companyName: "",
      phone: "",
      language: "en"
    }
  });

  const languageValue = watch("language");
  const initRef = useRef(false);

  useEffect(() => {
    if (user && !initRef.current) {
      initRef.current = true;
      setValue("fullName", user.fullName || "");
      setValue("companyName", user.companyName || "");
      setValue("phone", user.phone || "");
      setValue("language", user.language);
    }
  }, [user, setValue]);

  const onSubmitProfile = (data: ProfileFormValues) => {
    updateUser.mutate({ data }, {
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

  const handleTogglePref = (key: 'emailEnabled' | 'inAppEnabled', checked: boolean) => {
    updatePrefs.mutate({ data: { [key]: checked } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetNotificationPreferencesQueryKey() });
      }
    });
  };

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

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>{t("settings.profile")}</CardTitle>
          <CardDescription>{t("settings.profile_desc", { defaultValue: "Update your personal and company information." })}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmitProfile)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="fullName">{t("settings.full_name")}</Label>
                <Input id="fullName" {...register("fullName")} data-testid="input-fullname" />
                {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t("settings.email")}</Label>
                <Input id="email" value={user?.email} disabled className="bg-muted" />
                <p className="text-xs text-muted-foreground">{t("settings.email_managed", { defaultValue: "Managed via Clerk" })}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyName">{t("settings.company_name")}</Label>
                <Input id="companyName" {...register("companyName")} data-testid="input-companyname" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{t("settings.phone")}</Label>
                <Input id="phone" {...register("phone")} data-testid="input-phone" />
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
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={updateUser.isPending} data-testid="button-save-profile">
                {updateUser.isPending ? t("settings.saving") : t("settings.save")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

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
