import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Bot, FileText, Receipt, TriangleAlert, TrendingUp, Users } from "lucide-react";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:4000";

type Customer = { id: string; name?: string; client?: string; status?: string; updated_at?: string; created_at?: string };
type Invoice = {
  id: string;
  invoice_number?: string;
  client_name?: string;
  amount?: number | string;
  status?: string;
  issue_date?: string;
  updated_at?: string;
  created_at?: string;
};
type Automation = { id: string; name?: string; is_active?: boolean; created_at?: string; updated_at?: string };
type MailTemplate = { id: string };

const amountFormatter = (value: number | string) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return "$0.00";
  return `$${parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const toEpoch = (value?: string) => {
  const date = new Date(String(value || ""));
  const time = date.getTime();
  return Number.isNaN(time) ? 0 : time;
};

const toRecentCustomers = (customers: Customer[]) => [...customers]
  .sort((a, b) => toEpoch(b.updated_at || b.created_at) - toEpoch(a.updated_at || a.created_at))
  .slice(0, 5);

const toRecentInvoices = (invoices: Invoice[]) => [...invoices]
  .sort((a, b) => toEpoch(b.updated_at || b.created_at) - toEpoch(a.updated_at || a.created_at))
  .slice(0, 5);

const toInvoiceBarData = (invoices: Invoice[]) => {
  const buckets = new Map<string, number>();
  invoices.forEach((invoice) => {
    const parsed = new Date(String(invoice.issue_date || ""));
    if (Number.isNaN(parsed.getTime())) return;
    const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  });

  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-8)
    .map(([key, count]) => {
      const [year, month] = key.split("-");
      const d = new Date(Number(year), Number(month) - 1, 1);
      return {
        label: d.toLocaleString("en-US", { month: "short", year: "2-digit" }),
        invoices: count,
      };
    });
};

const toAutomationLineData = (automations: Automation[]) => {
  const buckets = new Map<string, { active: number; inactive: number }>();

  automations.forEach((automation) => {
    const parsed = new Date(String(automation.updated_at || automation.created_at || ""));
    if (Number.isNaN(parsed.getTime())) return;
    const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
    const row = buckets.get(key) || { active: 0, inactive: 0 };
    if (automation.is_active) row.active += 1;
    else row.inactive += 1;
    buckets.set(key, row);
  });

  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-8)
    .map(([key, values]) => {
      const [year, month] = key.split("-");
      const d = new Date(Number(year), Number(month) - 1, 1);
      return {
        label: d.toLocaleString("en-US", { month: "short", year: "2-digit" }),
        ...values,
      };
    });
};

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [fullName, setFullName] = useState("User");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) return;

    const loadDashboardData = async () => {
      try {
        const [
          meResponse,
          customerResponse,
          invoiceResponse,
          automationsResponse,
          templatesResponse,
        ] = await Promise.all([
          fetch(`${AUTH_API_URL}/me`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${AUTH_API_URL}/customers`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${AUTH_API_URL}/invoices`, { headers: { Authorization: `Bearer ${token}` } }),
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


  const filteredData = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return { customers, invoices, automations, templates };
    }

    const filteredCustomers = customers.filter((customer) => {
      const haystack = [customer.name, customer.client, customer.status].join(" ").toLowerCase();
      return haystack.includes(query);
    });

    const filteredInvoices = invoices.filter((invoice) => {
      const haystack = [invoice.invoice_number, invoice.client_name, invoice.status].join(" ").toLowerCase();
      return haystack.includes(query);
    });

    const filteredAutomations = automations.filter((automation) => {
      const haystack = [automation.name, automation.is_active ? "active" : "inactive"].join(" ").toLowerCase();
      return haystack.includes(query);
    });

    const filteredTemplates = templates.filter((template) => String(template.id).toLowerCase().includes(query));

    return {
      customers: filteredCustomers,
      invoices: filteredInvoices,
      automations: filteredAutomations,
      templates: filteredTemplates,
    };
  }, [searchQuery, customers, invoices, automations, templates]);

  const activeAutomationCount = useMemo(() => filteredData.automations.filter((item) => Boolean(item?.is_active)).length, [filteredData.automations]);
  const overdueInvoiceCount = useMemo(() => filteredData.invoices.filter((item) => (item.status || "").toLowerCase() === "overdue").length, [filteredData.invoices]);
  const totalRevenue = useMemo(() => filteredData.invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0), [filteredData.invoices]);
  const recentCustomers = useMemo(() => toRecentCustomers(filteredData.customers), [filteredData.customers]);
  const recentInvoices = useMemo(() => toRecentInvoices(filteredData.invoices), [filteredData.invoices]);
  const invoiceBarData = useMemo(() => toInvoiceBarData(filteredData.invoices), [filteredData.invoices]);
  const automationLineData = useMemo(() => toAutomationLineData(filteredData.automations), [filteredData.automations]);

  const kpis = [
    { label: "Total Customer", value: String(filteredData.customers.length), icon: Users, iconBg: "bg-blue-500/10", iconColor: "text-blue-600" },
    { label: "Total Invoice", value: String(filteredData.invoices.length), icon: Receipt, iconBg: "bg-violet-500/10", iconColor: "text-violet-600" },
    { label: "Overdue Invoice", value: String(overdueInvoiceCount), icon: TriangleAlert, iconBg: "bg-rose-500/10", iconColor: "text-rose-600" },
    { label: "Active Automation", value: String(activeAutomationCount), icon: Bot, iconBg: "bg-emerald-500/10", iconColor: "text-emerald-600" },
    { label: "Total Mail Template", value: String(filteredData.templates.length), icon: FileText, iconBg: "bg-cyan-500/10", iconColor: "text-cyan-600" },
    { label: "Total Revenue", value: amountFormatter(totalRevenue), icon: TrendingUp, iconBg: "bg-amber-500/10", iconColor: "text-amber-600" },
  ];

  return (
    <AppLayout
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      searchPlaceholder="Search dashboard metrics, activity, and charts..."
    >
      <div className="space-y-6">
        <div className="rounded-2xl border bg-gradient-to-r from-violet-50 via-background to-blue-50 p-6">
          <h1 className="text-3xl font-bold text-foreground">Dashboard Overview</h1>
          <p className="text-muted-foreground mt-1">Welcome back, {fullName}. Here's what's happening today.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {kpis.map((kpi) => (
            <Card key={kpi.label} className="hover:shadow-lg transition-all duration-200 min-h-[160px]">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardDescription className="text-xs uppercase tracking-wide">{kpi.label}</CardDescription>
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${kpi.iconBg}`}>
                    <kpi.icon className={`h-5 w-5 ${kpi.iconColor}`} />
                  </div>
                </div>
                <CardTitle className="text-3xl mt-3">{kpi.value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Invoice chart</CardTitle>
              <CardDescription>Bar chart based on invoice issue date.</CardDescription>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={invoiceBarData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="invoices" fill="#7c3aed" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Recent Customer Activity</CardTitle>
              <CardDescription>Latest 5 customers by updated time.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentCustomers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No customer activity yet.</p>
              ) : recentCustomers.map((customer) => (
                <div key={customer.id} className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{customer.name || customer.client || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{customer.status || "-"}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(customer.updated_at || customer.created_at || Date.now()).toLocaleString()}</p>
                </div>
              ))}
            </CardContent>
          </Card>

        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Automation Active vs Inactive</CardTitle>
              <CardDescription>Histogram for active and inactive automations.</CardDescription>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={automationLineData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="active" name="Active" fill="#16a34a" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="inactive" name="Inactive" fill="#ef4444" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Recent Invoice Activity</CardTitle>
              <CardDescription>Latest 5 invoices by updated time.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invoice activity yet.</p>
              ) : recentInvoices.map((invoice) => (
                <div key={invoice.id} className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{invoice.invoice_number || invoice.id}</p>
                    <p className="text-xs text-muted-foreground">{invoice.status || "-"} • {invoice.client_name || "-"}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(invoice.updated_at || invoice.created_at || Date.now()).toLocaleString()}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
