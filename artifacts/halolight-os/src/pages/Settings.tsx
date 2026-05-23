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

const profileSchema = z.object({
  fullName: z.string().min(2, "Name is too short").optional().or(z.literal("")),
  companyName: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  language: z.enum(['en', 'fr', 'es', 'de', 'it', 'pl', 'pt', 'nl']),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function Settings() {
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
        toast({ title: "Profile updated successfully" });
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      },
      onError: () => {
        toast({ title: "Failed to update profile", variant: "destructive" });
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
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account preferences and profile.</p>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Partner Profile</CardTitle>
          <CardDescription>Update your personal and company information.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmitProfile)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input id="fullName" {...register("fullName")} data-testid="input-fullname" />
                {errors.fullName && <p className="text-xs text-red-500">{errors.fullName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user?.email} disabled className="bg-muted" />
                <p className="text-xs text-muted-foreground">Managed via Clerk</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input id="companyName" {...register("companyName")} data-testid="input-companyname" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input id="phone" {...register("phone")} data-testid="input-phone" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Select value={languageValue} onValueChange={(v) => setValue("language", v as any)}>
                  <SelectTrigger data-testid="select-language">
                    <SelectValue placeholder="Select Language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="it">Italian</SelectItem>
                    <SelectItem value="pl">Polish</SelectItem>
                    <SelectItem value="pt">Portuguese</SelectItem>
                    <SelectItem value="nl">Dutch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={updateUser.isPending} data-testid="button-save-profile">
                Save Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Control how you receive alerts and updates.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Email Notifications</Label>
              <p className="text-sm text-muted-foreground">Receive daily summaries and critical alerts via email.</p>
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
              <Label className="text-base">In-App Notifications</Label>
              <p className="text-sm text-muted-foreground">Show alerts inside the dashboard.</p>
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
