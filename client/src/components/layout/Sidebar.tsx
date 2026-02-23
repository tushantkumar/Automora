import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Inbox,
  Users,
  FileText,
  Settings,
  LogOut,
  Mails,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:4000";

export function Sidebar() {
  const [location, navigate] = useLocation();
  const [fullName, setFullName] = useState("User");
  const [organizationName, setOrganizationName] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) return;

    const loadUser = async () => {
      try {
        const response = await fetch(`${AUTH_API_URL}/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) return;

        const data = await response.json();
        if (data?.user?.name) {
          setFullName(data.user.name);
        }

        if (data?.user?.organizationName) {
          setOrganizationName(data.user.organizationName);
        }
      } catch {
        // best-effort only
      }
    };

    loadUser();
  }, []);

  const links = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/inbox", label: "Inbox", icon: Inbox, badge: "2" },
    { href: "/customers", label: "Customers", icon: Users },
    { href: "/invoices", label: "Invoices", icon: FileText },
    { href: "/mail-templates", label: "Mail Templates", icon: Mails },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    navigate("/");
  };

  return (
    <aside className="w-64 border-r border-sidebar-border bg-sidebar h-screen flex flex-col fixed left-0 top-0 z-20">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold font-heading text-lg shadow-lg shadow-primary/20">
          A
        </div>
        <span className="font-heading font-bold text-xl tracking-tight text-sidebar-foreground">Autoflow</span>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1">
        {links.map((link) => {
          const isActive = location === link.href;
          return (
            <Link key={link.href} href={link.href}>
              <a
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 group relative",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                )}
              >
                <link.icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                <span>{link.label}</span>
                {link.badge && (
                  <span className="ml-auto bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {link.badge}
                  </span>
                )}
                {isActive && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-l-full" />}
              </a>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-sidebar-accent/50 transition-colors cursor-pointer group"
          type="button"
        >
          <Avatar className="w-9 h-9 border border-sidebar-border">
            <AvatarFallback>{fullName.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden text-left">
            <p className="text-sm font-medium truncate text-foreground">{fullName}</p>
            <p className="text-xs text-muted-foreground truncate">{organizationName || "Organization not set"}</p>
          </div>
          <LogOut className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </div>
    </aside>
  );
}
