import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowUpRight, Clock, LogOut, MoreHorizontal } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:4000";

type Customer = { id: string; name?: string; status?: string; value?: string };
type Invoice = { id: string; status?: string; amount?: number | string; due_date?: string };
type InvoiceInsights = { total_revenue: number; total_invoices: number; total_paid: number; total_unpaid: number; total_overdue: number };
type Automation = { id: string; is_active?: boolean; trigger_type?: string; action_type?: string };
type Template = { id: string; name?: string; created_at?: string };
type Email = { id: string; replied_at?: string | null; received_at?: string | null };

const emptyInvoiceInsights: InvoiceInsights = {
  total_revenue: 0,
  total_invoices: 0,
  total_paid: 0,
  total_unpaid: 0,
  total_overdue: 0,
};

const amountFormatter = (value: number | string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "$0.00";
  return `$${parsed.toFixed(2)}`;
};

const parseCurrencyString = (value?: string) => {
  const normalized = String(value || "").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
};

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [fullName, setFullName] = useState("User");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceInsights, setInvoiceInsights] = useState<InvoiceInsights>(emptyInvoiceInsights);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) return;

    const loadDashboardData = async () => {
      try {
        const [
          meResponse,
          customerResponse,
          invoiceResponse,
          invoiceInsightsResponse,
          automationResponse,
          templateResponse,
          emailResponse,
        ] = await Promise.all([
          fetch(`${AUTH_API_URL}/me`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${AUTH_API_URL}/customers`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${AUTH_API_URL}/invoices`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${AUTH_API_URL}/invoices/insights`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${AUTH_API_URL}/automations`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${AUTH_API_URL}/mail-templates`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${AUTH_API_URL}/emails?limit=100`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (meResponse.ok) {
          const meData = await meResponse.json();
          if (meData?.user?.onboardingCompleted === false) {
            navigate("/onboarding");
            return;
          }
          if (meData?.user?.name) setFullName(meData.user.name);
        }

        if (customerResponse.ok) {
          const customerData = await customerResponse.json();
          setCustomers(Array.isArray(customerData?.customers) ? customerData.customers : []);
        }

        if (invoiceResponse.ok) {
          const invoiceData = await invoiceResponse.json();
          setInvoices(Array.isArray(invoiceData?.invoices) ? invoiceData.invoices : []);
        }

        if (invoiceInsightsResponse.ok) {
          const insightData = await invoiceInsightsResponse.json();
          setInvoiceInsights({ ...emptyInvoiceInsights, ...(insightData?.insights || {}) });
        }

        if (automationResponse.ok) {
          const automationData = await automationResponse.json();
          setAutomations(Array.isArray(automationData?.automations) ? automationData.automations : []);
        }

        if (templateResponse.ok) {
          const templateData = await templateResponse.json();
          setTemplates(Array.isArray(templateData?.templates) ? templateData.templates : []);
        }

        if (emailResponse.ok) {
          const emailData = await emailResponse.json();
          setEmails(Array.isArray(emailData?.emails) ? emailData.emails : []);
        }
      } catch {
        // best-effort dashboard only
      }
    };

    void loadDashboardData();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    navigate("/");
  };

  const topLineCards = useMemo(() => ([
    {
      label: "Total Customers",
      value: String(customers.length),
      change: `${customers.filter((item) => item.status === "Active").length} active`,
      trend: customers.length > 0 ? "up" : "neutral",
    },
    {
      label: "Total Revenue",
      value: amountFormatter(invoiceInsights.total_revenue),
      change: `${invoiceInsights.total_invoices} invoices`,
      trend: invoiceInsights.total_revenue > 0 ? "up" : "neutral",
    },
    {
      label: "Active Automations",
      value: String(automations.filter((item) => Boolean(item?.is_active)).length),
      change: `${automations.length} total automations`,
      trend: automations.some((item) => item?.is_active) ? "up" : "neutral",
    },
    {
      label: "Mail Templates",
      value: String(templates.length),
      change: `${emails.length} inbox emails`,
      trend: templates.length > 0 ? "up" : "neutral",
    },
  ]), [automations, customers, emails.length, invoiceInsights.total_invoices, invoiceInsights.total_revenue, templates.length]);

  const report = useMemo(() => {
    const overdueInvoices = invoices.filter((invoice) => String(invoice.status || "").toLowerCase() === "overdue");
    const paidInvoices = invoices.filter((invoice) => String(invoice.status || "").toLowerCase() === "paid");
    const unpaidInvoices = invoices.filter((invoice) => {
      const status = String(invoice.status || "").toLowerCase();
      return status === "unpaid" || status === "pending" || status === "draft";
    });

    const totalCustomerValue = customers.reduce((sum, customer) => sum + parseCurrencyString(customer.value), 0);
    const repliedEmails = emails.filter((email) => Boolean(email.replied_at)).length;

    return {
      overdueInvoices,
      paidInvoices,
      unpaidInvoices,
      totalCustomerValue,
      repliedEmails,
    };
  }, [customers, emails, invoices]);

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Welcome back, {fullName}. Cross-page insight report is ready.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-1 rounded-full border border-border">
            <Clock className="w-4 h-4" />
            <span>Live snapshot</span>
          </div>
          <Button variant="outline" onClick={handleLogout} className="gap-2">
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {topLineCards.map((stat) => (
          <Card key={stat.label} className="shadow-sm hover:shadow-md transition-shadow border-muted">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              {stat.trend === "up" ? <ArrowUpRight className="h-4 w-4 text-emerald-500" /> : <MoreHorizontal className="h-4 w-4 text-muted-foreground" />}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-heading">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-4 flex flex-wrap h-auto gap-1 justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="automations">Automations</TabsTrigger>
            <TabsTrigger value="inbox">Inbox & Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Invoice Paid</p><p className="text-2xl font-semibold">{amountFormatter(invoiceInsights.total_paid)}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Invoice Unpaid</p><p className="text-2xl font-semibold">{amountFormatter(invoiceInsights.total_unpaid)}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Invoice Overdue</p><p className="text-2xl font-semibold">{amountFormatter(invoiceInsights.total_overdue)}</p></CardContent></Card>
            </div>
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium">Insight Report Summary</p>
                <p className="text-sm text-muted-foreground">You currently have <span className="font-semibold text-foreground">{customers.length}</span> customers, <span className="font-semibold text-foreground">{invoiceInsights.total_invoices}</span> invoices and <span className="font-semibold text-foreground">{automations.filter((item) => item.is_active).length}</span> active automations.</p>
                <p className="text-sm text-muted-foreground">Total tracked customer value is <span className="font-semibold text-foreground">{amountFormatter(report.totalCustomerValue)}</span> and inbox reply coverage is <span className="font-semibold text-foreground">{report.repliedEmails}/{emails.length}</span> emails replied.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customers">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Customers</p><p className="text-2xl font-semibold">{customers.length}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Active Customers</p><p className="text-2xl font-semibold">{customers.filter((c) => c.status === "Active").length}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Combined Value</p><p className="text-2xl font-semibold">{amountFormatter(report.totalCustomerValue)}</p></CardContent></Card>
            </div>
          </TabsContent>

          <TabsContent value="invoices">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Paid Count</p><p className="text-2xl font-semibold">{report.paidInvoices.length}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Unpaid Count</p><p className="text-2xl font-semibold">{report.unpaidInvoices.length}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Overdue Count</p><p className="text-2xl font-semibold">{report.overdueInvoices.length}</p></CardContent></Card>
            </div>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-2">Upcoming Due Invoices</p>
                <div className="space-y-2">
                  {invoices.slice(0, 5).map((invoice) => (
                    <div key={invoice.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                      <span className="text-muted-foreground">{String(invoice.id).slice(0, 8)} • {String(invoice.status || "Unknown")}</span>
                      <span className="font-medium">{formatDate(invoice.due_date)} • {amountFormatter(invoice.amount || 0)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="automations">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Automations</p><p className="text-2xl font-semibold">{automations.length}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Active Automations</p><p className="text-2xl font-semibold">{automations.filter((item) => item.is_active).length}</p></CardContent></Card>
            </div>
          </TabsContent>

          <TabsContent value="inbox">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Inbox Emails</p><p className="text-2xl font-semibold">{emails.length}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Replied Emails</p><p className="text-2xl font-semibold">{report.repliedEmails}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Mail Templates</p><p className="text-2xl font-semibold">{templates.length}</p></CardContent></Card>
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </AppLayout>
  );
}
