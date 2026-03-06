import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Auth from "@/pages/Auth";
import VerifyEmail from "@/pages/VerifyEmail";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import ActivateAccount from "@/pages/ActivateAccount";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import Inbox from "@/pages/Inbox";
import Customers from "@/pages/Customers";
import Invoices from "@/pages/Invoices";
import Settings from "@/pages/Settings";
import MailTemplates from "@/pages/MailTemplates";
import Automation from "@/pages/Automation";

const PUBLIC_ROUTES = new Set(["/", "/login", "/signup", "/verify-email", "/forgot-password", "/reset-password", "/activate-account"]);
const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:4000";

function AuthGuard() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    const pathname = location.split("?")[0];
    const isPublicRoute = PUBLIC_ROUTES.has(pathname);

    if (!token && !isPublicRoute) {
      navigate("/");
    }

    if (token && (pathname === "/login" || pathname === "/signup")) {
      navigate("/dashboard");
    }
  }, [location, navigate]);

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    const pathname = location.split("?")[0];

    if (!token || PUBLIC_ROUTES.has(pathname)) return;

    const controller = new AbortController();

    const verifyAccountStatus = async () => {
      try {
        const response = await fetch(`${AUTH_API_URL}/me`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => ({}));
        const message = String(payload?.message || "").toLowerCase();

        if (response.status === 403) {
          if (!message.includes("deactivated") && !message.includes("disabled")) return;

          localStorage.removeItem("authToken");
          if (!sessionStorage.getItem("accountDeactivatedToastShown")) {
            toast({
              title: "Account deactivated",
              description: "Your account has been deactivated by an administrator. Please contact your admin.",
              variant: "destructive",
            });
            sessionStorage.setItem("accountDeactivatedToastShown", "1");
          }
          navigate("/login");
          return;
        }

        if (response.status === 401) {
          localStorage.removeItem("authToken");
          if (!sessionStorage.getItem("accountDeletedToastShown")) {
            toast({
              title: "Account removed",
              description: "Your account was deleted by an administrator. Please contact your admin.",
              variant: "destructive",
            });
            sessionStorage.setItem("accountDeletedToastShown", "1");
          }
          navigate("/login");
        }
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
      }
    };

    verifyAccountStatus();
    const intervalId = window.setInterval(verifyAccountStatus, 30000);

    return () => {
      window.clearInterval(intervalId);
      controller.abort();
    };
  }, [location, navigate, toast]);

  return null;
}

function Router() {
  return (
    <>
      <AuthGuard />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={Auth} />
        <Route path="/signup" component={Auth} />
        <Route path="/verify-email" component={VerifyEmail} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/activate-account" component={ActivateAccount} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/inbox" component={Inbox} />
        <Route path="/customers" component={Customers} />
        <Route path="/invoices" component={Invoices} />
        <Route path="/mail-templates" component={MailTemplates} />
        <Route path="/automation" component={Automation} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
