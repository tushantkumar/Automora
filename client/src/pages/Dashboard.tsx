import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
type InvoiceInsights = { total_revenue: number; total_invoices: number; total_overdue?: number };
type Automation = { id: string; name?: string; is_active?: boolean; created_at?: string; updated_at?: string };
type MailTemplate = { id: string };

const emptyInvoiceInsights: InvoiceInsights = { total_revenue: 0, total_invoices: 0, total_overdue: 0 };

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

  const activeAutomationCount = useMemo(() => automations.filter((item) => Boolean(item?.is_active)).length, [automations]);
  const overdueInvoiceCount = Number(invoiceInsights.total_overdue || 0);
  const recentCustomers = useMemo(() => toRecentCustomers(customers), [customers]);
  const recentInvoices = useMemo(() => toRecentInvoices(invoices), [invoices]);
  const invoiceBarData = useMemo(() => toInvoiceBarData(invoices), [invoices]);
  const automationLineData = useMemo(() => toAutomationLineData(automations), [automations]);

  const kpis = [
    { label: "Total Customer", value: String(customers.length) },
    { label: "Total Invoice", value: String(invoiceInsights.total_invoices || 0) },
    { label: "Overdue Invoice", value: String(overdueInvoiceCount) },
    { label: "Active Automation", value: String(activeAutomationCount) },
    { label: "Total Mail Template", value: String(templates.length) },
    { label: "Total Revenue", value: amountFormatter(invoiceInsights.total_revenue) },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of customer, invoice, and automation activity.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
          {kpis.map((kpi) => (
            <Card key={kpi.label}>
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase tracking-wide">{kpi.label}</CardDescription>
                <CardTitle className="text-2xl">{kpi.value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Customer Activity</CardTitle>
              <CardDescription>Latest 5 customers by updated time.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentCustomers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No customer activity yet.</p>
              ) : recentCustomers.map((customer) => (
                <div key={customer.id} className="rounded-md border p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{customer.name || customer.client || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{customer.status || "-"}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(customer.updated_at || customer.created_at || Date.now()).toLocaleString()}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Invoice Activity</CardTitle>
              <CardDescription>Latest 5 invoices by updated time.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invoice activity yet.</p>
              ) : recentInvoices.map((invoice) => (
                <div key={invoice.id} className="rounded-md border p-3 flex items-center justify-between">
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

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Invoice Issued Trend</CardTitle>
              <CardDescription>Bar chart based on invoice issue date.</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={invoiceBarData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="invoices" fill="#7c3aed" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Automation Active vs Inactive</CardTitle>
              <CardDescription>Line chart of active/inactive automations by update month.</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={automationLineData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="active" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="inactive" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
