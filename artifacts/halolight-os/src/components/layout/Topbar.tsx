import { useGetCurrentUser, useGetUnreadNotificationCount } from "@workspace/api-client-react";
import { Bell } from "lucide-react";
import { Link } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function Topbar() {
  const { data: user } = useGetCurrentUser();
  const { data: unreadData } = useGetUnreadNotificationCount();

  const initials = user?.fullName
    ? user.fullName.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2)
    : user?.email.substring(0, 2).toUpperCase();

  return (
    <header className="hidden md:flex h-16 border-b bg-white items-center justify-between px-8 sticky top-0 z-10">
      <div className="flex-1" />
      
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-100 px-2 py-1 rounded-md">
            {user?.language.toUpperCase()}
          </span>
        </div>

        <Link href="/notifications" className="relative text-gray-500 hover:text-gray-900 transition-colors" data-testid="link-topbar-notifications">
          <Bell className="w-5 h-5" />
          {!!unreadData?.count && unreadData.count > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white border-2 border-white">
              {unreadData.count}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-3 border-l pl-6">
          <div className="text-right">
            <div className="text-sm font-medium text-gray-900">{user?.fullName || 'User'}</div>
            <div className="text-xs text-gray-500 capitalize">{user?.role.replace('_', ' ')}</div>
          </div>
          <Link href="/settings">
            <Avatar className="h-9 w-9 cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all" data-testid="avatar-topbar">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </div>
    </header>
  );
}
