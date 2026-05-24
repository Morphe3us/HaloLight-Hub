import { useTranslation } from "react-i18next";
import { useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, getGetUnreadNotificationCountQueryKey, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Bell, BellRing } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

export default function Notifications() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: notificationsData, isLoading } = useListNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const handleMarkRead = (id: string) => {
    markRead.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
      }
    });
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  const notifications = notificationsData?.items || [];
  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6" data-testid="page-notifications">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            {t("notifications.inbox")}
            {unreadCount > 0 && (
              <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 text-sm">
                {unreadCount} {t("notifications.new_badge")}
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-1">{t("notifications.subtitle")}</p>
        </div>

        {unreadCount > 0 && (
          <Button
            variant="outline"
            onClick={handleMarkAllRead}
            disabled={markAllRead.isPending}
            className="shadow-sm"
            data-testid="button-mark-all-read"
          >
            <Check className="mr-2 h-4 w-4" />
            {t("notifications.mark_all_read")}
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {notifications.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <div className="flex justify-center mb-4">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <Bell className="h-6 w-6 text-muted-foreground" />
              </div>
            </div>
            <h3 className="text-lg font-medium text-foreground">{t("notifications.all_caught_up_title")}</h3>
            <p className="text-muted-foreground mt-1">{t("notifications.all_caught_up_body")}</p>
          </Card>
        ) : (
          notifications.map((notification) => (
            <Card
              key={notification.id}
              className={`p-5 transition-colors border ${!notification.isRead ? 'bg-primary/[0.02] border-primary/20 shadow-sm' : 'bg-card border-border'}`}
              data-testid={`card-notification-${notification.id}`}
            >
              <div className="flex items-start gap-4">
                <div className={`mt-1 p-2 rounded-full shrink-0 ${!notification.isRead ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  {!notification.isRead ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="text-base font-semibold text-foreground">
                        {notification.title}
                      </h4>
                      <p className="text-muted-foreground mt-1">{notification.body}</p>

                      <div className="flex items-center gap-4 mt-3">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          {notification.type.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(notification.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {!notification.isRead && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMarkRead(notification.id)}
                        disabled={markRead.isPending}
                        className="shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
                        data-testid={`button-mark-read-${notification.id}`}
                      >
                        <Check className="h-4 w-4 mr-2" />
                        {t("notifications.mark_read")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
