import { useTranslation } from "react-i18next";
import { useListUsers, useGetCurrentUser } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, ShieldAlert } from "lucide-react";
import { Redirect } from "wouter";

export default function Admin() {
  const { t } = useTranslation();
  const { data: currentUser, isLoading: isLoadingCurrent } = useGetCurrentUser();
  const { data: usersData, isLoading: isLoadingUsers } = useListUsers();

  if (isLoadingCurrent) return <div className="p-8"><Skeleton className="h-10 w-full" /></div>;

  if (currentUser?.role !== "admin") {
    return <Redirect to="/dashboard" />;
  }

  if (isLoadingUsers) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  const users = usersData?.items || [];

  return (
    <div className="space-y-8" data-testid="page-admin">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 rounded-xl">
          <ShieldAlert className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("admin.console_title")}</h1>
          <p className="text-muted-foreground mt-1">{t("admin.console_subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("admin.total_users")}</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{usersData?.total || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>{t("admin.user_directory")}</CardTitle>
          <CardDescription>{t("admin.user_directory_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead>{t("admin.col_user")}</TableHead>
                  <TableHead>{t("admin.col_email")}</TableHead>
                  <TableHead>{t("admin.col_role")}</TableHead>
                  <TableHead>{t("admin.col_joined")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                    <TableCell className="font-medium text-foreground">
                      {user.fullName || t("admin.unset_name")}
                      {user.companyName && <span className="block text-xs font-normal text-muted-foreground">{user.companyName}</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${user.role === "admin" ? "bg-primary/10 text-primary border-primary/20" : ""}`}>
                        {user.role.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
