import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Download, Plus, FileText, Zap, Users, Wallet, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:4000";

type Customer = { id: string };
type Invoice = { amount: number | string; status?: string };
type InvoiceInsights = { total_revenue: number; total_invoices: number; total_overdue?: number };
type Automation = { id: string; is_active?: boolean };
type MailTemplate = { id: string };

const emptyInvoiceInsights: InvoiceInsights = { total_revenue: 0, total_invoices: 0, total_overdue: 0 };

const activityFeed = [
  { label: "Invoice generated", time: "2m ago", color: "bg-emerald-500" },
  { label: "Customer updated by AI", time: "15m ago", color: "bg-blue-500" },
  { label: "Automation draft queued", time: "1h ago", color: "bg-amber-500" },
];

const amountFormatter = (value: number | string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "$0";
  return `$${parsed.toLocaleString()}`;
};

const toMonthlyRevenue = (invoices: Invoice[]) => {
  const now = new Date();
  const rows = Array.from({ length: 6 }, (_, idx) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
    return {
      month: date.toLocaleString("en-US", { month: "short" }),
      value: 0,
    };
  });

  // Fallback: distribute total invoice amounts in a simple deterministic way for visual overview.
  invoices.forEach((invoice, idx) => {
    const amount = Number(invoice?.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) return;
    rows[idx % rows.length].value += amount;
  });

  return rows;
};

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [fullName, setFullName] = useState("User");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [invoiceInsights, setInvoiceInsights] = useState<InvoiceInsights>(emptyInvoiceInsights);

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
          automationsResponse,
          templatesResponse,
        ] = await Promise.all([
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

        if (automationsResponse.ok) {
          const automationData = await automationsResponse.json();
          setAutomations(Array.isArray(automationData?.automations) ? automationData.automations : []);
        }

        if (templatesResponse.ok) {
          const templateData = await templatesResponse.json();
          setTemplates(Array.isArray(templateData?.templates) ? templateData.templates : []);
        }
      } catch {
        // best-effort only
      }
    };

    void loadDashboardData();
  }, [navigate]);

  const revenueByMonth = useMemo(() => toMonthlyRevenue(invoices), [invoices]);
  const activeAutomations = useMemo(() => automations.filter((item) => Boolean(item?.is_active)).length, [automations]);
  const pausedAutomations = Math.max(automations.length - activeAutomations, 0);
  const overdueInvoices = Number(invoiceInsights.total_overdue || 0);

  const cards = [
    { label: "Active Customers", value: String(customers.length), icon: Users, tint: "text-blue-600" },
    { label: "Total Revenue", value: amountFormatter(invoiceInsights.total_revenue), icon: Wallet, tint: "text-emerald-600" },
    { label: "Overdue Invoices", value: String(overdueInvoices), icon: AlertTriangle, tint: "text-rose-600" },
    { label: "Active Automations", value: String(activeAutomations), icon: Zap, tint: "text-violet-600" },
    { label: "Mail Templates", value: String(templates.length), icon: FileText, tint: "text-cyan-600" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Business Overview</h1>
            <p className="text-muted-foreground mt-1">Everything is running smoothly today, {fullName}.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-1 rounded-full border border-border">
              <Clock className="w-4 h-4" />
              <span>Last sync: 2 mins ago</span>
            </div>
            <Button className="gap-2 bg-violet-600 hover:bg-violet-700"><Plus className="w-4 h-4" />New Workflow</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {cards.map((card) => (
            <Card key={card.label}>
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase tracking-wide">{card.label}</CardDescription>
                <CardTitle className="text-3xl flex items-center justify-between">
                  {card.value}
                  <card.icon className={`w-5 h-5 ${card.tint}`} />
                </CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Revenue Growth</CardTitle>
                <CardDescription>Monthly revenue performance</CardDescription>
              </div>
              <Button variant="outline" size="sm" className="gap-1"><Download className="w-3.5 h-3.5" />Download Report</Button>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByMonth}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(v) => amountFormatter(Number(v || 0))} />
                  <Bar dataKey="value" fill="#7c3aed" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Automation Status</CardTitle>
              <CardDescription>Distribution of workflows</CardDescription>
            </CardHeader>
            <CardContent className="pt-10">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold">{activeAutomations}</p>
                  <p className="text-xs text-muted-foreground uppercase">Active</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{pausedAutomations}</p>
                  <p className="text-xs text-muted-foreground uppercase">Paused</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">0</p>
                  <p className="text-xs text-muted-foreground uppercase">Draft</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent System Activity</CardTitle>
              <Button variant="link" className="text-violet-600 px-0">View All</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {activityFeed.map((item) => (
                <div key={item.label} className="rounded-lg border bg-muted/30 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`inline-block w-2 h-2 rounded-full ${item.color}`} />
                    <span>{item.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{item.time}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-violet-50/50 border-violet-100">
            <CardHeader>
              <CardTitle>Quick Intelligence</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                "New Template",
                "Sync CRM",
                "Review Invoices",
                "AI Insights",
              ].map((item) => (
                <Button key={item} variant="outline" className="h-14 border-violet-200 text-violet-700">{item}</Button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
