import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Mail, Phone, Pencil, Trash2, X, Download } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:4000";

type Customer = {
  id: string;
  name: string;
  client: string;
  contact: string;
  email: string;
  status: string;
  value: string;
};

const initialForm = {
  name: "",
  client: "",
  contact: "",
  email: "",
  status: "Active",
  value: "$0",
};

export default function Customers() {
  const token = localStorage.getItem("authToken");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<{ customerId: string; type: "email" | "phone" } | null>(null);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
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

  const loadCustomers = async () => {
    if (!token) return;

    try {
      const response = await fetch(`${AUTH_API_URL}/customers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        toast({ title: "Unable to load customers", description: data.message || "Please try again." });
        return;
      }
      setCustomers(Array.isArray(data.customers) ? data.customers : []);
    } catch {
      toast({ title: "Unable to load customers", description: "Please try again." });
    }
  };

  useEffect(() => {
    void loadCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers;

    return customers.filter((customer) => {
      const haystack = [customer.name, customer.client, customer.contact, customer.email, customer.status].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [customers, search]);

  const selectedCustomer = useMemo(
    () => filteredCustomers.find((customer) => customer.id === selectedDetail?.customerId) || null,
    [filteredCustomers, selectedDetail],
  );


  useEffect(() => {
    if (!selectedDetail) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedDetail(null);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedDetail]);

  const openCreateForm = () => {
    setForm(initialForm);
    setEditingCustomerId(null);
    setShowForm(true);
  };

  const openEditForm = (customer: Customer) => {
    setForm({
      name: customer.name,
      client: customer.client,
      contact: customer.contact,
      email: customer.email,
      status: customer.status,
      value: customer.value,
    });
    setEditingCustomerId(customer.id);
    setShowForm(true);
  };



  const downloadCustomerPdf = async (customerId: string) => {
    if (!token) return;

    try {
      const response = await fetch(`${AUTH_API_URL}/customers/${customerId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast({ title: "Unable to download customer report", description: data?.message || "Please try again." });
        return;
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition") || "";
      const fileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
      const fileName = fileNameMatch?.[1] || `customer-${customerId}.pdf`;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Unable to download customer report", description: "Please try again." });
    }
  };
  const saveCustomer = async (skipConfirm = false) => {
    if (!token) {
      toast({ title: "You are not logged in" });
      return;
    }

    if (!form.name.trim() || !form.client.trim() || !form.contact.trim() || !form.email.trim()) {
      toast({ title: "Name, client, contact and email are required" });
      return;
    }

    setSaving(true);
    try {
      const isEditing = Boolean(editingCustomerId);
      if (isEditing && !skipConfirm) {
        openConfirmDialog(
          "Update customer?",
          "This will save the customer changes.",
          () => { void saveCustomer(true); },
        );
        return;
      }

      const response = await fetch(
        isEditing ? `${AUTH_API_URL}/customers/${editingCustomerId}` : `${AUTH_API_URL}/customers`,
        {
          method: isEditing ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(form),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        toast({ title: "Unable to save customer", description: data.message || "Please try again." });
        return;
      }

      toast({ title: isEditing ? "Customer updated" : "Customer created" });
      setShowForm(false);
      setEditingCustomerId(null);
      setForm(initialForm);
      void loadCustomers();
    } catch {
      toast({ title: "Unable to save customer", description: "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const removeCustomer = async (customerId: string, skipConfirm = false) => {
    if (!skipConfirm) {
      openConfirmDialog(
        "Delete customer?",
        "This action cannot be undone.",
        () => { void removeCustomer(customerId, true); },
      );
      return;
    }

    if (!token) {
      toast({ title: "You are not logged in" });
      return;
    }

    const response = await fetch(`${AUTH_API_URL}/customers/${customerId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();
    if (!response.ok) {
      if (response.status === 409) {
        toast({ title: data.message || "Customer has invoices. Please delete invoices first." });
        return;
      }

      toast({ title: "Unable to delete customer", description: data.message || "Please try again." });
      return;
    }

    toast({ title: "Customer deleted" });
    if (selectedDetail?.customerId === customerId) {
      setSelectedDetail(null);
    }
    void loadCustomers();
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Customers</h1>
          <p className="text-muted-foreground mt-1">Create, edit, search and manage all your customers.</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90" onClick={openCreateForm}>
          <Plus className="w-4 h-4 mr-2" /> Add Customer
        </Button>
      </div>

      {showForm && (
        <Card className="p-4 mb-6 space-y-4 border-primary/40">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{editingCustomerId ? "Edit Customer" : "Add Customer"}</h2>
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}><X className="w-4 h-4" /></Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Client</Label>
              <Input value={form.client} onChange={(event) => setForm((prev) => ({ ...prev, client: event.target.value }))} placeholder="Acme LLC" />
            </div>
            <div className="space-y-2">
              <Label>Contact</Label>
              <Input value={form.contact} onChange={(event) => setForm((prev) => ({ ...prev, contact: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
              >
                <option value="Active">Active</option>
                <option value="Negotiation">Negotiation</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Revenue Generated</Label>
            <Input value={form.value} onChange={(event) => setForm((prev) => ({ ...prev, value: event.target.value }))} placeholder="$5000" />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={() => { void saveCustomer(); }} disabled={saving}>{saving ? "Saving..." : editingCustomerId ? "Update" : "Create"}</Button>
          </div>
        </Card>
      )}

      {selectedCustomer && selectedDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm p-4" onClick={() => setSelectedDetail(null)}>
          <Card className="w-full max-w-md border-primary/20 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="p-6 space-y-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Contact Details</p>
                  <h3 className="text-xl font-semibold text-foreground">{selectedCustomer.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedDetail.type === "email" ? "Email address" : "Phone number"}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedDetail(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    {selectedDetail.type === "email" ? <Mail className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                  </div>
                  <p className="text-sm font-medium break-all">
                    {selectedDetail.type === "email" ? selectedCustomer.email : selectedCustomer.contact}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelectedDetail(null)}>Close</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      <Card>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search customers..." className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Revenue Generated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCustomers.map((customer) => (
              <TableRow key={customer.id} className="group hover:bg-muted/50">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-primary/10 text-primary font-medium">
                        {customer.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="font-medium">{customer.name}</div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{customer.client}</TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    customer.status === "Active"
                      ? "bg-emerald-100 text-emerald-700"
                      : customer.status === "Negotiation"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-700"
                  }`}>
                    {customer.status}
                  </span>
                </TableCell>
                <TableCell className="font-medium">{customer.value}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setSelectedDetail({ customerId: customer.id, type: "email" })}
                    >
                      <Mail className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setSelectedDetail({ customerId: customer.id, type: "phone" })}
                    >
                      <Phone className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { void downloadCustomerPdf(customer.id); }}><Download className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditForm(customer)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeCustomer(customer.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
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
