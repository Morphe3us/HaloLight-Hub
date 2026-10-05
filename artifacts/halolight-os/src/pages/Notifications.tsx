import { useTranslation } from "react-i18next";
import { useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, getGetUnreadNotificationCountQueryKey, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Bell } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/page";

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
      <div className="max-w-4xl space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const notifications = notificationsData?.items || [];
  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="max-w-4xl space-y-8" data-testid="page-notifications">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {t("notifications.inbox")}
            {unreadCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-sm font-normal tracking-normal text-muted-foreground tabular-nums">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                {unreadCount} {t("notifications.new_badge")}
              </span>
            )}
          </span>
        }
        description={t("notifications.subtitle")}
        actions={unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={markAllRead.isPending}
            className="gap-1.5"
            data-testid="button-mark-all-read"
          >
            <Check className="h-4 w-4 stroke-[1.75]" />
            {t("notifications.mark_all_read")}
          </Button>
        )}
      />

      <div>
        {notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            text={
              <>
                <span className="block font-medium text-foreground">{t("notifications.all_caught_up_title")}</span>
                <span className="block mt-1">{t("notifications.all_caught_up_body")}</span>
              </>
            }
          />
        ) : (
          <ul className="rounded-xl border border-border bg-card divide-y divide-border">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className="px-4 py-4 transition-colors"
                data-testid={`card-notification-${notification.id}`}
              >
                <div className="flex items-start gap-3">
                  <span className={cn("h-1.5 w-1.5 rounded-full mt-2 shrink-0", !notification.isRead ? "bg-primary" : "bg-transparent")} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h4 className={cn("text-sm", !notification.isRead ? "font-medium text-foreground" : "text-foreground/80")}>
                          {notification.title}
                        </h4>
                        <p className="text-sm text-muted-foreground mt-0.5">{notification.body}</p>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-xs text-muted-foreground">
                          <span className="first-letter:uppercase">
                            {notification.type.replace('_', ' ')}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
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
                          className="shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
                          data-testid={`button-mark-read-${notification.id}`}
                        >
                          <Check className="h-4 w-4 stroke-[1.75]" />
                          {t("notifications.mark_read")}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
