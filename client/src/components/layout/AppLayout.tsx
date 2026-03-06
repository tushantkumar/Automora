import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Sidebar } from "./Sidebar";
import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clearNotifications, getNotifications, subscribeNotifications, type AppNotification } from "@/lib/notifications";

interface AppLayoutProps {
  children: React.ReactNode;
  searchQuery?: string;
  onSearchQueryChange?: (value: string) => void;
  searchPlaceholder?: string;
}

const formatNotificationTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleString();
};

export function AppLayout({
  children,
  searchQuery,
  onSearchQueryChange,
  searchPlaceholder = "Search workflows, customers, emails...",
}: AppLayoutProps) {
  const [, navigate] = useLocation();
  const [notifications, setNotifications] = useState<AppNotification[]>(() => getNotifications());
  const [internalSearchQuery, setInternalSearchQuery] = useState("");

  const resolvedSearchQuery = searchQuery ?? internalSearchQuery;

  const handleSearchChange = (value: string) => {
    if (onSearchQueryChange) {
      onSearchQueryChange(value);
      return;
    }
    setInternalSearchQuery(value);
  };

  useEffect(() => {
    setNotifications(getNotifications());
    return subscribeNotifications(() => setNotifications(getNotifications()));
  }, []);

  const hasNotifications = notifications.length > 0;
  const badgeText = useMemo(() => (notifications.length > 99 ? "99+" : String(notifications.length)), [notifications.length]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />

      <div className="pl-64">
        <header className="h-16 border-b border-border px-8 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-4 w-96">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={resolvedSearchQuery}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
                className="pl-9 bg-muted/50 border-transparent hover:bg-muted focus:bg-background focus:border-ring transition-all h-9"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground" aria-label="Notifications">
                  <Bell className="w-5 h-5" />
                  {hasNotifications && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 bg-red-500 text-[10px] text-white rounded-full border border-background flex items-center justify-center">
                      {badgeText}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-96">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
                  <Button variant="ghost" size="sm" onClick={() => clearNotifications()} disabled={!hasNotifications}>
                    Clear all
                  </Button>
                </div>
                <DropdownMenuSeparator />
                {hasNotifications ? (
                  <div className="max-h-80 overflow-auto space-y-2 px-2 py-1">
                    {notifications.map((notification) => (
                      <div key={notification.id} className="rounded-md border p-2">
                        <p className="text-sm font-medium leading-tight">{notification.title}</p>
                        {notification.description && <p className="text-xs text-muted-foreground mt-1">{notification.description}</p>}
                        <p className="text-[11px] text-muted-foreground mt-1">{formatNotificationTime(notification.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground px-2 py-3">No notifications yet.</p>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
              onClick={() => navigate("/automation?new=true")}
            >
              New Automation
            </Button>
          </div>
        </header>

        <main className="p-8 max-w-7xl mx-auto animate-in-fade">
          {children}
        </main>
      </div>
    </div>
  );
}
