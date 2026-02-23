import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Download, Send, Pencil, Trash2, X, CalendarDays } from "lucide-react";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:4000";

type Invoice = {
  id: string;
  customer_id?: string | null;
  invoice_number: string;
  client_name: string;
  issue_date: string;
  due_date: string;
  amount: number;
  tax_rate?: number;
  status: string;
  notes?: string;
  line_items?: Array<{
    description?: string;
    quantity?: number;
    rate?: number;
  }>;
};

type Customer = {
  id: string;
  name: string;
  client: string;
  email: string;
  contact: string;
};

type LineItem = {
  id: string;
  description: string;
  quantity: number;
  rate: number;
};

const createLineItem = (): LineItem => ({
  id: Math.random().toString(36).slice(2),
  description: "",
  quantity: 1,
  rate: 0,
});

const emptyInsights = {
  total_paid: 0,
  total_overdue: 0,
  total_unpaid: 0,
  total_revenue: 0,
  total_invoices: 0,
};

const initialForm = {
  customerId: "",
  invoiceNumber: "",
  clientName: "",
  issueDate: new Date().toISOString().slice(0, 10),
  dueDate: "",
  taxRate: "0",
  status: "Unpaid",
  notes: "",
  lineItems: [createLineItem()],
};

export default function Invoices() {
  const token = localStorage.getItem("authToken");

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [invoiceNumberFilter, setInvoiceNumberFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [insights, setInsights] = useState(emptyInsights);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("Please confirm");
  const [confirmDescription, setConfirmDescription] = useState("");
  const [confirmAction, setConfirmAction] = useState<null | (() => void)>(null);
  const { toast } = useToast();

  const openConfirmDialog = (title: string, description: string, onConfirm: () => void) => {
    setConfirmTitle(title);
    setConfirmDescription(description);
    setConfirmAction(() => onConfirm);
    setConfirmOpen(true);
  };

  const handleConfirmAction = () => {
    setConfirmOpen(false);
    const action = confirmAction;
    setConfirmAction(null);
    action?.();
  };

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (invoiceNumberFilter.trim()) params.set("invoiceNumber", invoiceNumberFilter.trim());
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    return params.toString();
  }, [invoiceNumberFilter, fromDate, toDate]);

  const loadInvoices = async () => {
    if (!token) return;

    try {
      const response = await fetch(`${AUTH_API_URL}/invoices${queryString ? `?${queryString}` : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (!response.ok) {
        toast({ title: "Unable to load invoices", description: data.message || "Please try again." });
        return;
      }

      setInvoices(Array.isArray(data.invoices) ? data.invoices : []);
    } catch {
      toast({ title: "Unable to load invoices", description: "Please try again." });
    }
  };

  const loadCustomers = async () => {
    if (!token) return;

    try {
      const response = await fetch(`${AUTH_API_URL}/customers`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (!response.ok) return;

      setCustomers(Array.isArray(data.customers) ? data.customers : []);
    } catch {
      setCustomers([]);
    }
  };

  const loadInsights = async () => {
    if (!token) return;

    try {
      const response = await fetch(`${AUTH_API_URL}/invoices/insights`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (!response.ok) return;

      setInsights({ ...emptyInsights, ...(data?.insights || {}) });
    } catch {
      setInsights(emptyInsights);
    }
  };

  useEffect(() => {
    void loadInvoices();
  }, [queryString]);

  useEffect(() => {
    void loadInsights();
    void loadCustomers();
  }, []);


  const subtotal = useMemo(
    () => form.lineItems.reduce((sum, item) => sum + item.quantity * item.rate, 0),
    [form.lineItems],
  );

  const total = useMemo(() => {
    const taxRate = Number(form.taxRate || 0);
    if (!Number.isFinite(taxRate) || taxRate < 0) return subtotal;
    return subtotal + (subtotal * taxRate) / 100;
  }, [form.taxRate, subtotal]);

  const customerById = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((customer) => {
      const key = String(customer.id || "").trim();
      if (key) map.set(key, customer);
    });
    return map;
  }, [customers]);

  const customerByClient = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((customer) => {
      const key = String(customer.client || "").trim();
      if (key && !map.has(key)) map.set(key, customer);
    });
    return map;
  }, [customers]);

  const openCreate = () => {
    setEditingInvoiceId(null);
    setForm(initialForm);
    setShowForm(true);
  };

  const openEdit = (invoice: Invoice) => {
    const matchingCustomer = customers.find((customer) => customer.id === invoice.customer_id)
      || customers.find((customer) => customer.client === invoice.client_name);

    setEditingInvoiceId(invoice.id);
    const persistedLineItems = Array.isArray(invoice.line_items)
      ? invoice.line_items
        .map((item) => ({
          id: Math.random().toString(36).slice(2),
          description: String(item?.description || "").trim(),
          quantity: Number(item?.quantity),
          rate: Number(item?.rate),
        }))
        .filter((item) => item.description && Number.isFinite(item.quantity) && Number.isFinite(item.rate))
      : [];

    setForm({
      customerId: matchingCustomer?.id || "",
      invoiceNumber: invoice.invoice_number,
      clientName: invoice.client_name,
      issueDate: invoice.issue_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      dueDate: invoice.due_date?.slice(0, 10) || "",
      taxRate: String(invoice.tax_rate ?? 0),
      status: invoice.status === "Draft" ? "Unpaid" : invoice.status,
      notes: String(invoice.notes || ""),
      lineItems: persistedLineItems.length > 0
        ? persistedLineItems
        : [{ id: Math.random().toString(36).slice(2), description: "Imported line item", quantity: 1, rate: Number(invoice.amount ?? 0) }],
    });
    setShowForm(true);
  };

  const onCustomerSelect = (customerId: string) => {
    const selected = customers.find((customer) => customer.id === customerId);
    setForm((prev) => ({
      ...prev,
      customerId,
      clientName: selected?.client || "",
    }));
  };

  const updateLineItem = (id: string, updates: Partial<LineItem>) => {
    setForm((prev) => ({
      ...prev,
      lineItems: prev.lineItems.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    }));
  };

  const addLineItem = () => {
    setForm((prev) => ({ ...prev, lineItems: [...prev.lineItems, createLineItem()] }));
  };

  const removeLineItem = (id: string) => {
    setForm((prev) => {
      if (prev.lineItems.length <= 1) return prev;
      return { ...prev, lineItems: prev.lineItems.filter((item) => item.id !== id) };
    });
  };

  const saveInvoice = async (skipConfirm = false) => {
    if (!token) {
      toast({ title: "You are not logged in" });
      return;
    }

    if (editingInvoiceId && !skipConfirm) {
      openConfirmDialog(
        "Update invoice?",
        "This will save the changes to this invoice.",
        () => { void saveInvoice(true); },
      );
      return;
    }

    if (!form.invoiceNumber.trim() || !form.customerId || !form.clientName.trim() || !form.issueDate || !form.dueDate || form.lineItems.some((item) => !item.description.trim())) {
      toast({ title: "Please fill required invoice fields and line items" });
      return;
    }


    const response = await fetch(
      editingInvoiceId ? `${AUTH_API_URL}/invoices/${editingInvoiceId}` : `${AUTH_API_URL}/invoices`,
      {
        method: editingInvoiceId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          customerId: form.customerId,
          invoiceNumber: form.invoiceNumber,
          clientName: form.clientName,
          issueDate: form.issueDate,
          dueDate: form.dueDate,
          amount: Number(total.toFixed(2)),
          status: form.status,
          notes: form.notes,
          taxRate: Number(form.taxRate || 0),
          lineItems: form.lineItems,
        }),
      },
    );

    const data = await response.json();
    if (!response.ok) {
      toast({ title: "Unable to save invoice", description: data.message || "Please try again." });
      return;
    }

    toast({ title: editingInvoiceId ? "Invoice updated" : "Invoice created" });
    setShowForm(false);
    setForm(initialForm);
    setEditingInvoiceId(null);
    void loadInvoices();
    void loadInsights();
  };

  const removeInvoice = async (invoiceId: string, skipConfirm = false) => {
    if (!token) return;
    if (!skipConfirm) {
      openConfirmDialog(
        "Delete invoice?",
        "This action cannot be undone.",
        () => { void removeInvoice(invoiceId, true); },
      );
      return;
    }

    const response = await fetch(`${AUTH_API_URL}/invoices/${invoiceId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();
    if (!response.ok) {
      toast({ title: "Unable to delete invoice", description: data.message || "Please try again." });
      return;
    }

    toast({ title: "Invoice deleted" });
    void loadInvoices();
    void loadInsights();
  };

  const amountFormatter = (value: number | string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "$0.00";
    return `$${parsed.toFixed(2)}`;
  };

  const displayDate = (value: string) => {
    const datePart = String(value || "").slice(0, 10);
    if (!datePart) return "-";

    const [year, month, day] = datePart.split("-");
    if (!year || !month || !day) return datePart;
    return `${month}/${day}/${year}`;
  };

  const statusClassName = (status: string) => {
    if (status === "Paid") return "bg-emerald-100 text-emerald-700";
    if (status === "Overdue") return "bg-red-100 text-red-700";
    if (status === "Pending") return "bg-amber-100 text-amber-700";
    return "bg-blue-100 text-blue-700";
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Invoices</h1>
          <p className="text-muted-foreground mt-1">Track payments, billings and invoice insights</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Create Invoice
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
        <Card className="bg-violet-50 border-violet-100"><CardContent className="p-6"><p className="text-sm font-medium text-violet-600 mb-1">Total Revenue</p><h3 className="text-2xl font-bold text-violet-700">{amountFormatter(insights.total_revenue)}</h3></CardContent></Card>
        <Card className="bg-emerald-50 border-emerald-100"><CardContent className="p-6"><p className="text-sm font-medium text-emerald-600 mb-1">Paid</p><h3 className="text-2xl font-bold text-emerald-700">{amountFormatter(insights.total_paid)}</h3></CardContent></Card>
        <Card className="bg-blue-50 border-blue-100"><CardContent className="p-6"><p className="text-sm font-medium text-blue-600 mb-1">Unpaid</p><h3 className="text-2xl font-bold text-blue-700">{amountFormatter(insights.total_unpaid)}</h3></CardContent></Card>
        <Card className="bg-orange-50 border-orange-100"><CardContent className="p-6"><p className="text-sm font-medium text-orange-600 mb-1">Overdue</p><h3 className="text-2xl font-bold text-orange-700">{amountFormatter(insights.total_overdue)}</h3></CardContent></Card>
        <Card className="bg-slate-50 border-slate-200"><CardContent className="p-6"><p className="text-sm font-medium text-slate-600 mb-1">Total Invoices</p><h3 className="text-2xl font-bold text-slate-700">{insights.total_invoices}</h3></CardContent></Card>
      </div>

      {showForm && (
        <Card className="mb-6 border-primary/30">
          <div className="p-6 space-y-5">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-semibold">{editingInvoiceId ? "Edit Invoice" : "New Invoice"}</h2>
                <p className="text-sm text-muted-foreground">Fill invoice details, line items and save.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}><X className="w-4 h-4" /></Button>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Customer</Label>
                <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.customerId} onChange={(event) => onCustomerSelect(event.target.value)}>
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name} ({customer.email})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Client</Label>
                <Input value={form.clientName} readOnly placeholder="Auto-filled from selected customer" />
              </div>
              <div className="space-y-2">
                <Label>Invoice Number</Label>
                <Input value={form.invoiceNumber} onChange={(event) => setForm((prev) => ({ ...prev, invoiceNumber: event.target.value }))} placeholder="INV-MLULTTX3" />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2"><Label>Issue Date</Label><Input type="date" value={form.issueDate} onChange={(event) => setForm((prev) => ({ ...prev, issueDate: event.target.value }))} /></div>
              <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={form.dueDate} onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))} /></div>
              <div className="space-y-2"><Label>Tax Rate (%)</Label><Input type="number" min={0} step="0.01" value={form.taxRate} onChange={(event) => setForm((prev) => ({ ...prev, taxRate: event.target.value }))} /></div>
              <div className="space-y-2"><Label>Status</Label><select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}><option value="Unpaid">Unpaid</option><option value="Pending">Pending</option><option value="Paid">Paid</option><option value="Overdue">Overdue</option></select></div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base">Line Items</Label>
                <Button variant="outline" type="button" onClick={addLineItem}><Plus className="w-4 h-4 mr-2" />Add Item</Button>
              </div>

              <div className="grid grid-cols-12 gap-2 px-1 text-xs uppercase tracking-wide text-muted-foreground">
                <p className="col-span-6">Description</p>
                <p className="col-span-2">Qty</p>
                <p className="col-span-2">Rate</p>
                <p className="col-span-1 text-right">Total</p>
                <p className="col-span-1 text-right">Remove</p>
              </div>

              {form.lineItems.map((item) => (
                <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                  <Input className="col-span-6" placeholder="Service description" value={item.description} onChange={(event) => updateLineItem(item.id, { description: event.target.value })} />
                  <Input className="col-span-2" type="number" min={1} step="1" value={item.quantity} onChange={(event) => updateLineItem(item.id, { quantity: Number(event.target.value || 1) })} />
                  <Input className="col-span-2" type="number" min={0} step="0.01" value={item.rate} onChange={(event) => updateLineItem(item.id, { rate: Number(event.target.value || 0) })} />
                  <div className="col-span-1 text-right text-sm font-medium">{amountFormatter(item.quantity * item.rate)}</div>
                  <Button variant="ghost" type="button" size="icon" className="col-span-1 justify-self-end text-destructive" onClick={() => removeLineItem(item.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}

              <div className="text-right space-y-1 pt-2 border-t border-border">
                <p className="text-muted-foreground">Subtotal: {amountFormatter(subtotal)}</p>
                <p className="text-3xl font-bold">Total: {amountFormatter(total)}</p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <Label>Notes</Label>
              <textarea className="w-full min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Additional notes for customer" value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={() => { void saveInvoice(); }}>{editingInvoiceId ? "Update Invoice" : "Create Invoice"}</Button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="p-4 border-b border-border flex flex-wrap items-center gap-3 justify-between">
          <div className="relative w-72"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search by invoice number..." className="pl-9" value={invoiceNumberFilter} onChange={(event) => setInvoiceNumberFilter(event.target.value)} /></div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative"><CalendarDays className="w-4 h-4 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" /><Input type="date" className="pl-8" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></div>
            <span className="text-sm text-muted-foreground">to</span>
            <div className="relative"><CalendarDays className="w-4 h-4 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" /><Input type="date" className="pl-8" value={toDate} onChange={(event) => setToDate(event.target.value)} /></div>
            <Button variant="outline" size="sm" onClick={() => { setInvoiceNumberFilter(""); setFromDate(""); setToDate(""); }}>Reset</Button>
            <Button variant="outline" size="sm"><Download className="w-4 h-4 mr-2" /> Export Report</Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Created Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => {
              const customer = (invoice.customer_id ? customerById.get(invoice.customer_id) : null) || customerByClient.get(invoice.client_name);
              const normalizedStatus = invoice.status === "Draft" ? "Unpaid" : invoice.status;

              return (
                <TableRow key={invoice.id} className="group hover:bg-muted/50">
                  <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                  <TableCell>
                    <div className="text-left">
                      <p className="font-medium text-foreground hover:text-primary">{customer?.name || invoice.client_name}</p>
                      <p className="text-sm text-muted-foreground hover:text-primary/80">{customer?.email || invoice.client_name}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{invoice.client_name}</TableCell>
                  <TableCell className="text-muted-foreground">{displayDate(invoice.issue_date)}</TableCell>
                  <TableCell className="text-muted-foreground">{displayDate(invoice.due_date)}</TableCell>
                  <TableCell className="font-semibold">{amountFormatter(invoice.amount)}</TableCell>
                  <TableCell><span className={`px-2 py-1 rounded-full text-xs font-medium ${statusClassName(normalizedStatus)}`}>{normalizedStatus}</span></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-primary"><Send className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(invoice)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeInvoice(invoice.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
