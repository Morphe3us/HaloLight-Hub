import { useGetCurrentUser, useGetUnreadNotificationCount, useGetOnboardingSummary, useListNotifications } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, ArrowRight, Activity, Calendar, Trophy } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { data: user, isLoading: isLoadingUser } = useGetCurrentUser();
  const { data: unreadData, isLoading: isLoadingUnread } = useGetUnreadNotificationCount();
  const { data: onboardingSummary, isLoading: isLoadingOnboarding } = useGetOnboardingSummary();
  const { data: notificationsData, isLoading: isLoadingNotifications } = useListNotifications({ limit: 3 });

  if (isLoadingUser || isLoadingUnread || isLoadingOnboarding || isLoadingNotifications) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8" data-testid="page-dashboard">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user?.fullName?.split(' ')[0] || 'Partner'}
        </h1>
        <p className="text-gray-500 mt-1">Here is what's happening with your operations today.</p>
      </div>

      {onboardingSummary && onboardingSummary.percentComplete < 100 && (
        <Card className="border-primary/20 shadow-sm bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Trophy className="w-5 h-5 text-primary" />
                Setup Your Account
              </CardTitle>
              <span className="text-sm font-medium text-primary">{onboardingSummary.percentComplete}% Complete</span>
            </div>
            <CardDescription>
              Complete the onboarding steps to unlock all features of HaloLight OS.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={onboardingSummary.percentComplete} className="h-2 mb-4" />
            <div className="flex justify-end">
              <Link href="/onboarding">
                <Button size="sm" className="shadow-sm" data-testid="button-continue-onboarding">
                  Continue Setup <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-sm border-gray-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Unread Notifications</CardTitle>
            <Bell className="w-4 h-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">{unreadData?.count || 0}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-gray-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">System Status</CardTitle>
            <Activity className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">Optimal</div>
            <p className="text-xs text-green-600 font-medium mt-1">All systems operational</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-gray-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Account Type</CardTitle>
            <Calendar className="w-4 h-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900 capitalize">{user?.role.replace('_', ' ')}</div>
            <p className="text-xs text-gray-500 mt-1">Member since {new Date(user?.createdAt || '').toLocaleDateString()}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
          <div>
            <CardTitle className="text-lg">Recent Notifications</CardTitle>
            <CardDescription>Stay updated on your operations</CardDescription>
          </div>
          <Link href="/notifications">
            <Button variant="ghost" size="sm" className="text-primary" data-testid="button-view-all-notifications">
              View All
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {notificationsData?.items && notificationsData.items.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {notificationsData.items.map((notification) => (
                <div key={notification.id} className={`p-4 flex gap-4 ${!notification.isRead ? 'bg-primary/5' : ''}`}>
                  <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${!notification.isRead ? 'bg-primary' : 'bg-transparent'}`} />
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">{notification.title}</h4>
                    <p className="text-sm text-gray-600 mt-1">{notification.body}</p>
                    <p className="text-xs text-gray-400 mt-2">{new Date(notification.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              No recent notifications.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
