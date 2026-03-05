import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowUpRight, Bot, Clock, FileText, LogOut, Mail, MoreHorizontal, Users } from "lucide-react";
import { Pie, PieChart, Cell, Bar, BarChart, CartesianGrid, XAxis, YAxis, Line, LineChart } from "recharts";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:4000";

type Customer = { id: string; name?: string; status?: string; value?: string };
type Invoice = { id: string; status?: string; amount?: number | string; due_date?: string };
type InvoiceInsights = { total_revenue: number; total_invoices: number; total_paid: number; total_unpaid: number; total_overdue: number };
type Automation = { id: string; is_active?: boolean };
type Template = { id: string };
type Email = { id: string; replied_at?: string | null };

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

const PIE_COLORS = ["#4f46e5", "#f59e0b", "#ef4444"];

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

  const report = useMemo(() => {
    const paidCount = invoices.filter((invoice) => String(invoice.status || "").toLowerCase() === "paid").length;
    const unpaidCount = invoices.filter((invoice) => {
      const status = String(invoice.status || "").toLowerCase();
      return status === "unpaid" || status === "pending" || status === "draft";
    }).length;
    const overdueCount = invoices.filter((invoice) => String(invoice.status || "").toLowerCase() === "overdue").length;
    const totalCustomerValue = customers.reduce((sum, customer) => sum + parseCurrencyString(customer.value), 0);
    const repliedEmails = emails.filter((email) => Boolean(email.replied_at)).length;

    return { paidCount, unpaidCount, overdueCount, totalCustomerValue, repliedEmails };
  }, [customers, emails, invoices]);

  const kpis = useMemo(() => ([
    { label: "Customers", value: String(customers.length), helper: `${customers.filter((item) => item.status === "Active").length} active`, icon: Users },
    { label: "Revenue", value: amountFormatter(invoiceInsights.total_revenue), helper: `${invoiceInsights.total_invoices} invoices`, icon: FileText },
    { label: "Automations", value: String(automations.filter((item) => item.is_active).length), helper: `${automations.length} total`, icon: Bot },
    { label: "Inbox", value: String(emails.length), helper: `${templates.length} templates`, icon: Mail },
  ]), [automations, customers, emails.length, invoiceInsights.total_invoices, invoiceInsights.total_revenue, templates.length]);

  const invoiceStatusPie = useMemo(() => ([
    { status: "Paid", value: report.paidCount, fill: "var(--color-paid)" },
    { status: "Unpaid", value: report.unpaidCount, fill: "var(--color-unpaid)" },
    { status: "Overdue", value: report.overdueCount, fill: "var(--color-overdue)" },
  ]), [report.overdueCount, report.paidCount, report.unpaidCount]);

  const invoiceStatusConfig = {
    paid: { label: "Paid", color: PIE_COLORS[0] },
    unpaid: { label: "Unpaid", color: PIE_COLORS[1] },
    overdue: { label: "Overdue", color: PIE_COLORS[2] },
  };

  const moduleHistogramData = useMemo(() => ([
    { module: "Customers", total: customers.length },
    { module: "Invoices", total: invoiceInsights.total_invoices },
    { module: "Automations", total: automations.length },
    { module: "Templates", total: templates.length },
    { module: "Inbox", total: emails.length },
  ]), [automations.length, customers.length, emails.length, invoiceInsights.total_invoices, templates.length]);

  const moduleHistogramConfig = {
    total: { label: "Records", color: "#6366f1" },
  };

  const revenueTrendData = useMemo(() => ([
    { name: "Paid", value: Number(invoiceInsights.total_paid || 0) },
    { name: "Unpaid", value: Number(invoiceInsights.total_unpaid || 0) },
    { name: "Overdue", value: Number(invoiceInsights.total_overdue || 0) },
    { name: "Revenue", value: Number(invoiceInsights.total_revenue || 0) },
  ]), [invoiceInsights.total_overdue, invoiceInsights.total_paid, invoiceInsights.total_revenue, invoiceInsights.total_unpaid]);

  const revenueTrendConfig = {
    value: { label: "Amount", color: "#14b8a6" },
  };

  return (
    <AppLayout>
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-r from-indigo-500/10 via-violet-500/5 to-emerald-500/10 p-6 mb-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.15),transparent_50%)] pointer-events-none" />
        <div className="relative flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Hi {fullName}, your business insight cockpit is ready.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-background/70 px-3 py-1 rounded-full border border-border backdrop-blur">
              <Clock className="w-4 h-4" />
              <span>Live snapshot</span>
            </div>
            <Button variant="outline" onClick={handleLogout} className="gap-2 bg-background/70">
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {kpis.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="shadow-sm hover:shadow-md transition-shadow border-muted">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                <div className="flex items-center gap-2 text-primary">
                  <Icon className="h-4 w-4" />
                  <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-heading">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{stat.helper}</p>
              </CardContent>
            </Card>
          );
        })}
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
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-base">Module Distribution (Histogram)</CardTitle></CardHeader>
                <CardContent>
                  <ChartContainer config={moduleHistogramConfig} className="h-[300px] w-full">
                    <BarChart data={moduleHistogramData} margin={{ left: 8, right: 8 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="module" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="total" fill="var(--color-total)" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-base">Invoice Status Split (Pie)</CardTitle></CardHeader>
                <CardContent>
                  <ChartContainer config={invoiceStatusConfig} className="h-[300px] w-full">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
                      <Pie data={invoiceStatusPie} dataKey="value" nameKey="status" innerRadius={70} outerRadius={110} strokeWidth={4}>
                        {invoiceStatusPie.map((entry, index) => <Cell key={`${entry.status}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                      </Pie>
                      <ChartLegend content={<ChartLegendContent nameKey="status" />} />
                    </PieChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-base">Revenue Story</CardTitle></CardHeader>
              <CardContent>
                <ChartContainer config={revenueTrendConfig} className="h-[260px] w-full">
                  <LineChart data={revenueTrendData} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line dataKey="value" stroke="var(--color-value)" strokeWidth={3} dot={{ fill: "var(--color-value)" }} />
                  </LineChart>
                </ChartContainer>
                <p className="text-sm text-muted-foreground mt-2">
                  Total tracked customer value is <span className="font-semibold text-foreground">{amountFormatter(report.totalCustomerValue)}</span> and inbox reply coverage is <span className="font-semibold text-foreground">{report.repliedEmails}/{emails.length}</span> emails.
                </p>
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Paid Amount</p><p className="text-2xl font-semibold">{amountFormatter(invoiceInsights.total_paid)}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Unpaid Amount</p><p className="text-2xl font-semibold">{amountFormatter(invoiceInsights.total_unpaid)}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Overdue Amount</p><p className="text-2xl font-semibold">{amountFormatter(invoiceInsights.total_overdue)}</p></CardContent></Card>
            </div>
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
