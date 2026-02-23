import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Auth from "@/pages/Auth";
import VerifyEmail from "@/pages/VerifyEmail";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import Inbox from "@/pages/Inbox";
import Customers from "@/pages/Customers";
import Invoices from "@/pages/Invoices";
import Settings from "@/pages/Settings";
import MailTemplates from "@/pages/MailTemplates";
import Automation from "@/pages/Automation";

const PUBLIC_ROUTES = new Set(["/", "/login", "/signup", "/verify-email", "/forgot-password", "/reset-password"]);

function AuthGuard() {
  const [location, navigate] = useLocation();

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
