import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type User,
  useCreateUser,
  useGetCurrentUser,
  useListUsers,
  useUpdateUser,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Redirect } from "wouter";
import {
  Pencil,
  Power,
  PowerOff,
  Search,
  ShieldAlert,
  UserPlus,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { AdminConsentProof } from "@/components/AdminConsentProof";
import { InviteUserButton } from "@/components/InviteUserButton";

const ROLES = ["admin", "client", "coach", "sales_rep"] as const;
const LANGUAGES = ["en", "fr", "de", "nl", "es", "it", "pt", "pl"] as const;

const EMPTY_FORM = {
  email: "",
  fullName: "",
  firstName: "",
  lastName: "",
  companyName: "",
  phone: "",
  role: "client",
  language: "en",
  currency: "EUR",
  isActive: true,
};

type UserForm = typeof EMPTY_FORM;

export default function Admin() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: currentUser, isLoading: isLoadingCurrent } =
    useGetCurrentUser();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);

  const { data: usersData, isLoading: isLoadingUsers } = useListUsers({
    q: search || undefined,
    role: roleFilter === "all" ? undefined : roleFilter,
    active: activeFilter === "all" ? undefined : activeFilter === "active",
    limit: 100,
  });

  const invalidateUsers = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/users"] });

  const createUser = useCreateUser({
    mutation: {
      onSuccess: () => {
        toast({ title: t("admin.toast_user_created") });
        setDialogOpen(false);
        void invalidateUsers();
      },
      onError: () =>
        toast({
          title: t("admin.toast_user_save_failed"),
          variant: "destructive",
        }),
    },
  });

  const updateUser = useUpdateUser({
    mutation: {
      onSuccess: () => {
        toast({ title: t("admin.toast_user_updated") });
        setDialogOpen(false);
        void invalidateUsers();
      },
      onError: () =>
        toast({
          title: t("admin.toast_user_save_failed"),
          variant: "destructive",
        }),
    },
  });

  if (isLoadingCurrent)
    return (
      <div className="p-8">
        <Skeleton className="h-10 w-full" />
      </div>
    );

  if (currentUser?.role !== "admin") {
    return <Redirect to="/dashboard" />;
  }

  const users = usersData?.items || [];
  const activeUsers = users.filter((user) => user.isActive).length;
  const inactiveUsers = users.filter((user) => !user.isActive).length;
  const adminUsers = users.filter((user) => user.role === "admin").length;
  const isSaving = createUser.isPending || updateUser.isPending;

  function openCreate() {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(user: User) {
    setEditingUser(user);
    setForm({
      email: user.email,
      fullName: user.fullName ?? "",
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      companyName: user.companyName ?? "",
      phone: user.phone ?? "",
      role: user.role,
      language: user.language,
      currency: user.currency,
      isActive: user.isActive,
    });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!form.email.trim() || !form.fullName.trim()) {
      toast({ title: t("admin.toast_user_required"), variant: "destructive" });
      return;
    }

    if (editingUser) {
      await updateUser.mutateAsync({
        id: editingUser.id,
        data: {
          email: form.email,
          fullName: form.fullName,
          firstName: form.firstName || undefined,
          lastName: form.lastName || undefined,
          companyName: form.companyName || undefined,
          phone: form.phone || undefined,
          role: form.role as User["role"],
          language: form.language as User["language"],
          currency: form.currency,
          isActive: form.isActive,
        },
      });
      return;
    }

    await createUser.mutateAsync({
      data: {
        email: form.email,
        fullName: form.fullName,
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        companyName: form.companyName || undefined,
        phone: form.phone || undefined,
        role: form.role as User["role"],
        language: form.language as User["language"],
        currency: form.currency,
        isActive: form.isActive,
      },
    });
  }

  async function toggleActive(user: User) {
    await updateUser.mutateAsync({
      id: user.id,
      data: { isActive: !user.isActive },
    });
  }

  return (
    <div className="space-y-6" data-testid="page-admin">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3">
            <ShieldAlert className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {t("admin.console_title")}
            </h1>
            <p className="mt-1 text-muted-foreground">
              {t("admin.console_subtitle")}
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <UserPlus className="h-4 w-4" />
          {t("admin.create_user")}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          { label: t("admin.total_users"), value: usersData?.total || 0 },
          { label: t("admin.active_users"), value: activeUsers },
          { label: t("admin.inactive_users"), value: inactiveUsers },
          { label: t("admin.admin_users"), value: adminUsers },
        ].map((stat) => (
          <Card key={stat.label} className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {stat.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>{t("admin.user_directory")}</CardTitle>
          <CardDescription>{t("admin.user_directory_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={t("admin.search_users")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="lg:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("admin.filter_all_roles")}
                </SelectItem>
                {ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {t(`admin.role_${role}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="lg:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("admin.filter_all_statuses")}
                </SelectItem>
                <SelectItem value="active">
                  {t("admin.status_active")}
                </SelectItem>
                <SelectItem value="inactive">
                  {t("admin.status_inactive")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead>{t("admin.col_user")}</TableHead>
                  <TableHead>{t("admin.col_email")}</TableHead>
                  <TableHead>{t("admin.col_role")}</TableHead>
                  <TableHead>{t("admin.col_status")}</TableHead>
                  <TableHead>{t("admin.col_joined")}</TableHead>
                  <TableHead className="text-right">
                    {t("admin.col_actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingUsers ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10">
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-10 text-center text-muted-foreground"
                    >
                      {t("admin.no_users")}
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                      <TableCell className="font-medium text-foreground">
                        {user.fullName || t("admin.unset_name")}
                        {user.companyName && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {user.companyName}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.email}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            user.role === "admin"
                              ? "border-primary/20 bg-primary/10 text-primary"
                              : ""
                          }
                        >
                          {t(`admin.role_${user.role}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            user.isActive
                              ? "border-success/20 bg-success/10 text-success"
                              : "border-destructive/20 bg-destructive/10 text-destructive"
                          }
                        >
                          {user.isActive
                            ? t("admin.status_active")
                            : t("admin.status_inactive")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <InviteUserButton user={user} />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(user)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={
                              user.id === currentUser.id || updateUser.isPending
                            }
                            onClick={() => void toggleActive(user)}
                          >
                            {user.isActive ? (
                              <PowerOff className="h-4 w-4" />
                            ) : (
                              <Power className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? t("admin.edit_user") : t("admin.create_user")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("admin.label_email")}</Label>
              <Input
                value={form.email}
                onChange={(event) =>
                  setForm((value) => ({ ...value, email: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.label_full_name")}</Label>
              <Input
                value={form.fullName}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    fullName: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.label_first_name")}</Label>
              <Input
                value={form.firstName}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    firstName: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.label_last_name")}</Label>
              <Input
                value={form.lastName}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    lastName: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.label_company")}</Label>
              <Input
                value={form.companyName}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    companyName: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.label_phone")}</Label>
              <Input
                value={form.phone}
                onChange={(event) =>
                  setForm((value) => ({ ...value, phone: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.col_role")}</Label>
              <Select
                value={form.role}
                onValueChange={(role) =>
                  setForm((value) => ({ ...value, role }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {t(`admin.role_${role}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.label_language")}</Label>
              <Select
                value={form.language}
                onValueChange={(language) =>
                  setForm((value) => ({ ...value, language }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((language) => (
                    <SelectItem key={language} value={language}>
                      {language.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.label_currency")}</Label>
              <Input
                value={form.currency}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    currency: event.target.value.toUpperCase(),
                  }))
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label>{t("admin.status_active")}</Label>
              <Switch
                checked={form.isActive}
                onCheckedChange={(isActive) =>
                  setForm((value) => ({ ...value, isActive }))
                }
              />
            </div>
          </div>
          {editingUser && <AdminConsentProof userId={editingUser.id} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={isSaving}>
              {isSaving ? t("admin.saving_user") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
