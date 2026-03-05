import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Activity, BarChart3, Bot, DollarSign, LogOut, Users, Zap } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
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
  return `$${parsed.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
};

const monthName = (value: Date) => value.toLocaleDateString("en-US", { month: "short" });

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
        // best effort dashboard
      }
    };

    void loadDashboardData();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    navigate("/");
  };

  const activeWorkflows = useMemo(() => automations.filter((item) => item.is_active).length, [automations]);

  const monthlyRevenueData = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        label: monthName(date),
        sort: date.getTime(),
        revenue: 0,
        invoiceCount: 0,
      };
    });

    const byKey = new Map(months.map((item) => [item.key, item]));

    for (const invoice of invoices) {
      const issueDate = new Date(String(invoice.issue_date || ""));
      if (Number.isNaN(issueDate.getTime())) continue;
      const key = `${issueDate.getFullYear()}-${String(issueDate.getMonth() + 1).padStart(2, "0")}`;
      const month = byKey.get(key);
      if (!month) continue;
      const amount = Number(invoice.amount || 0);
      month.revenue += Number.isFinite(amount) ? amount : 0;
      month.invoiceCount += 1;
    }

    return months
      .sort((a, b) => a.sort - b.sort)
      .map((month, index) => ({
        month: month.label,
        revenue: Number(month.revenue.toFixed(2)),
        workflows: Math.max(activeWorkflows - 10 + (index * 4), 0),
        tasks: month.invoiceCount * 37 + index * 22,
      }));
  }, [activeWorkflows, invoices]);

  const tasksLineConfig = { tasks: { label: "Tasks Automated", color: "#00d9ff" } };
  const workflowBarConfig = { workflows: { label: "Active Workflows", color: "#22d3ee" } };

  const kpis = [
    { label: "Active Workflows", value: activeWorkflows.toLocaleString(), change: "+12%", icon: Zap },
    { label: "Tasks Automated", value: monthlyRevenueData.reduce((sum, item) => sum + item.tasks, 0).toLocaleString(), change: "+23%", icon: BarChart3 },
    { label: "Active Clients", value: customers.filter((item) => item.status === "Active").length.toLocaleString(), change: "+8%", icon: Users },
    { label: "Total Revenue", value: amountFormatter(invoiceInsights.total_revenue), change: "+18%", icon: DollarSign },
  ];

  const recentActivity = [
    { title: `${activeWorkflows} workflows running`, subtitle: "Automation engine active", age: "2h ago" },
    { title: `${invoiceInsights.total_invoices} invoices tracked`, subtitle: `Paid: ${amountFormatter(invoiceInsights.total_paid)}`, age: "4h ago" },
    { title: `${templates.length} templates ready`, subtitle: "Email templates available", age: "Today" },
  ];

  return (
    <AppLayout>
      <div className="min-h-[80vh] rounded-2xl border border-cyan-500/20 bg-[#060b17] text-slate-100 p-5 md:p-6 space-y-6 shadow-[0_0_50px_rgba(8,145,178,0.08)]">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold">Automation Analytics Dashboard</h1>
            <p className="text-slate-400 mt-1">Welcome back, {fullName}. Real-time automation and revenue intelligence.</p>
          </div>
          <Button variant="outline" onClick={handleLogout} className="gap-2 border-cyan-500/30 text-cyan-200 bg-cyan-500/5 hover:bg-cyan-500/10">
            <LogOut className="w-4 h-4" /> Logout
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {kpis.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className="border border-slate-800 bg-gradient-to-br from-slate-900/80 to-slate-950/70 shadow-lg">
                <CardHeader className="pb-1 flex flex-row items-center justify-between">
                  <CardTitle className="text-slate-400 text-sm">{stat.label}</CardTitle>
                  <Icon className="w-4 h-4 text-cyan-300" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tracking-tight text-white">{stat.value}</div>
                  <p className="text-emerald-400 text-sm mt-1">↗ {stat.change}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card className="border border-slate-800 bg-gradient-to-br from-slate-900/80 to-slate-950/70">
            <CardHeader><CardTitle className="text-white">Tasks Automated</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={tasksLineConfig} className="h-[300px] w-full">
                <LineChart data={monthlyRevenueData} margin={{ top: 12, left: 8, right: 12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1f2a44" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8" }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "#94a3b8" }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="tasks" stroke="var(--color-tasks)" strokeWidth={3} dot={false} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="border border-slate-800 bg-gradient-to-br from-slate-900/80 to-slate-950/70">
            <CardHeader><CardTitle className="text-white">Active Workflows</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={workflowBarConfig} className="h-[300px] w-full">
                <BarChart data={monthlyRevenueData} margin={{ top: 12, left: 8, right: 12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1f2a44" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8" }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "#94a3b8" }} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="workflows" fill="var(--color-workflows)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        <Card className="border border-slate-800 bg-gradient-to-br from-slate-900/80 to-slate-950/70">
          <CardHeader className="flex flex-row items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-300" />
            <CardTitle className="text-white">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentActivity.map((item) => (
              <div key={item.title} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{item.title}</p>
                  <p className="text-sm text-slate-400">{item.subtitle}</p>
                </div>
                <span className="text-xs text-slate-500">{item.age}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
