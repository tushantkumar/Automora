import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowUpRight, Bot, Clock, FileText, LogOut, MoreHorizontal, Users } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:4000";

type Customer = { id: string; status?: string };
type Invoice = { id: string; amount?: number | string; issue_date?: string };
type InvoiceInsights = { total_revenue: number; total_invoices: number; total_paid: number; total_unpaid: number; total_overdue: number };
type Automation = { id: string; is_active?: boolean };
type Template = { id: string };

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

const formatMonth = (value: Date) => value.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [fullName, setFullName] = useState("User");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceInsights, setInvoiceInsights] = useState<InvoiceInsights>(emptyInvoiceInsights);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) return;

    const loadDashboardData = async () => {
      try {
        const [meResponse, customerResponse, invoiceResponse, invoiceInsightsResponse, automationResponse, templateResponse] = await Promise.all([
          fetch(`${AUTH_API_URL}/me`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${AUTH_API_URL}/customers`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${AUTH_API_URL}/invoices`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${AUTH_API_URL}/invoices/insights`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${AUTH_API_URL}/automations`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${AUTH_API_URL}/mail-templates`, { headers: { Authorization: `Bearer ${token}` } }),
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

  const kpis = useMemo(() => ([
    { label: "Customers", value: String(customers.length), helper: `${customers.filter((item) => item.status === "Active").length} active`, icon: Users },
    { label: "Total Revenue", value: amountFormatter(invoiceInsights.total_revenue), helper: `${invoiceInsights.total_invoices} invoices`, icon: FileText },
    { label: "Automations", value: String(automations.length), helper: `${automations.filter((item) => item.is_active).length} active`, icon: Bot },
    { label: "Mail Templates", value: String(templates.length), helper: "Template library", icon: FileText },
  ]), [automations, customers, invoiceInsights.total_invoices, invoiceInsights.total_revenue, templates.length]);

  const monthlyRevenueData = useMemo(() => {
    const map = new Map<string, { month: string; revenue: number; sort: number }>();

    for (const invoice of invoices) {
      const issueDate = new Date(String(invoice.issue_date || ""));
      if (Number.isNaN(issueDate.getTime())) continue;
      const keyDate = new Date(issueDate.getFullYear(), issueDate.getMonth(), 1);
      const key = `${keyDate.getFullYear()}-${String(keyDate.getMonth() + 1).padStart(2, "0")}`;
      const amount = Number(invoice.amount || 0);
      const existing = map.get(key) || { month: formatMonth(keyDate), revenue: 0, sort: keyDate.getTime() };
      existing.revenue += Number.isFinite(amount) ? amount : 0;
      map.set(key, existing);
    }

    return Array.from(map.values())
      .sort((a, b) => a.sort - b.sort)
      .slice(-12)
      .map((item) => ({ month: item.month, revenue: Number(item.revenue.toFixed(2)) }));
  }, [invoices]);

  const revenueChartConfig = {
    revenue: { label: "Revenue", color: "#14b8a6" },
  };

  return (
    <AppLayout>
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-r from-indigo-500/10 via-violet-500/5 to-emerald-500/10 p-6 mb-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.15),transparent_50%)] pointer-events-none" />
        <div className="relative flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard Overview</h1>
            <p className="text-muted-foreground mt-1">Hi {fullName}, here is your monthly revenue and key platform summary.</p>
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
                  {Number(stat.value.replace(/[^0-9.-]/g, "")) > 0 ? <ArrowUpRight className="h-4 w-4 text-emerald-500" /> : <MoreHorizontal className="h-4 w-4 text-muted-foreground" />}
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

      <Card>
        <CardHeader>
          <CardTitle>Monthly Revenue Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={revenueChartConfig} className="h-[360px] w-full">
            <LineChart data={monthlyRevenueData} margin={{ top: 8, left: 8, right: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `$${Number(value).toFixed(0)}`} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value) => amountFormatter(Number(value))} />} />
              <Line type="monotone" dataKey="revenue" stroke="var(--color-revenue)" strokeWidth={3} dot={{ fill: "var(--color-revenue)", r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ChartContainer>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">Paid Revenue</p>
              <p className="text-lg font-semibold">{amountFormatter(invoiceInsights.total_paid)}</p>
            </div>
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">Unpaid Revenue</p>
              <p className="text-lg font-semibold">{amountFormatter(invoiceInsights.total_unpaid)}</p>
            </div>
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">Overdue Revenue</p>
              <p className="text-lg font-semibold">{amountFormatter(invoiceInsights.total_overdue)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
