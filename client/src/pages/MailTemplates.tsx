import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Pencil, X, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:4000";

type MailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
};

type TemplateVariable = { label: string; token: string; source: "customer" | "invoice" | "inbox" | "system" };

const templateVariables: TemplateVariable[] = [
  // Customer datapills
  { label: "Customer ID", token: "{{customer.id}}", source: "customer" },
  { label: "Customer Name", token: "{{customer.name}}", source: "customer" },
  { label: "Customer Client", token: "{{customer.client}}", source: "customer" },
  { label: "Customer Contact", token: "{{customer.contact}}", source: "customer" },
  { label: "Customer Email", token: "{{customer.email}}", source: "customer" },
  { label: "Customer Status", token: "{{customer.status}}", source: "customer" },
  { label: "Customer Value", token: "{{customer.value}}", source: "customer" },
  { label: "Customer Created At", token: "{{customer.created_at}}", source: "customer" },

  // Invoice datapills
  { label: "Invoice ID", token: "{{invoice.id}}", source: "invoice" },
  { label: "Invoice Number", token: "{{invoice.invoice_number}}", source: "invoice" },
  { label: "Invoice Client Name", token: "{{invoice.client_name}}", source: "invoice" },
  { label: "Invoice Issue Date", token: "{{invoice.issue_date}}", source: "invoice" },
  { label: "Invoice Due Date", token: "{{invoice.due_date}}", source: "invoice" },
  { label: "Invoice Amount", token: "{{invoice.amount}}", source: "invoice" },
  { label: "Invoice Tax Rate", token: "{{invoice.tax_rate}}", source: "invoice" },
  { label: "Invoice Status", token: "{{invoice.status}}", source: "invoice" },
  { label: "Invoice Notes", token: "{{invoice.notes}}", source: "invoice" },
  { label: "Invoice Line Items", token: "{{invoice.line_items}}", source: "invoice" },
  { label: "Invoice Created At", token: "{{invoice.created_at}}", source: "invoice" },

  // Invoice linked customer datapills
  { label: "Invoice Customer Name", token: "{{invoice.customer_name}}", source: "invoice" },
  { label: "Invoice Customer Email", token: "{{invoice.customer_email}}", source: "invoice" },

  // Inbox / system datapills
  { label: "Email Subject", token: "{{email.subject}}", source: "inbox" },
  { label: "Email Body", token: "{{email.body}}", source: "inbox" },
  { label: "Email From", token: "{{email.from}}", source: "inbox" },
  { label: "Organization", token: "{{user.organization_name}}", source: "system" },
  { label: "User Name", token: "{{user.name}}", source: "system" },
];

const sourceBadgeColor: Record<TemplateVariable["source"], string> = {
  customer: "bg-cyan-50 text-cyan-700 border-cyan-200",
  invoice: "bg-amber-50 text-amber-700 border-amber-200",
  inbox: "bg-violet-50 text-violet-700 border-violet-200",
  system: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function MailTemplates() {
  const token = localStorage.getItem("authToken");
  const { toast } = useToast();

  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [activeField, setActiveField] = useState<"subject" | "body">("body");

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const loadTemplates = async () => {
    if (!token) return;

    try {
      const response = await fetch(`${AUTH_API_URL}/mail-templates`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) {
        toast({ title: "Unable to load templates", description: data.message || "Please try again." });
        return;
      }

      setTemplates(Array.isArray(data.templates) ? data.templates : []);
    } catch {
      toast({ title: "Unable to load templates", description: "Please try again." });
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  const appendPill = (tokenValue: string) => {
    if (activeField === "subject") {
      setSubject((prev) => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}${tokenValue}`.trim());
      return;
    }

    setBody((prev) => `${prev}${prev && !prev.endsWith("\n") ? "\n" : ""}${tokenValue}`);
  };

  const openCreate = () => {
    setEditingTemplateId(null);
    setName("");
    setSubject("");
    setBody("Hi {{customer.name}},\n\nThank you for reaching out.\n\nRegards,\n{{user.organization_name}}");
    setShowForm(true);
  };

  const openEdit = (template: MailTemplate) => {
    setEditingTemplateId(template.id);
    setName(template.name);
    setSubject(template.subject);
    setBody(template.body);
    setShowForm(true);
  };

  const saveTemplate = async () => {
    if (!token) return;
    if (!name.trim() || !subject.trim() || !body.trim()) {
      toast({ title: "Name, subject and body are required" });
      return;
    }

    const endpoint = editingTemplateId ? `${AUTH_API_URL}/mail-templates/${editingTemplateId}` : `${AUTH_API_URL}/mail-templates`;
    const method = editingTemplateId ? "PUT" : "POST";

    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, subject, body }),
    });

    const data = await response.json();
    if (!response.ok) {
      toast({ title: "Unable to save template", description: data.message || "Please try again." });
      return;
    }

    toast({ title: editingTemplateId ? "Template updated" : "Template created" });
    setShowForm(false);
    setEditingTemplateId(null);
    void loadTemplates();
  };

  const deleteTemplate = async (templateId: string) => {
    if (!token) return;

    const response = await fetch(`${AUTH_API_URL}/mail-templates/${templateId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      toast({ title: "Unable to delete template" });
      return;
    }

    toast({ title: "Template deleted" });
    void loadTemplates();
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Mail Templates</h1>
          <p className="text-muted-foreground">Create reusable mail subjects and bodies for workflow actions.</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New Template</Button>
      </div>

      {showForm && (
        <Card className="mb-6 border-primary/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">{editingTemplateId ? "Edit Template" : "Create Template"}</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}><X className="w-4 h-4" /></Button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Name</Label>
                    <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Invoice response template" />
                  </div>
                  <div>
                    <Label>Subject</Label>
                    <Input
                      value={subject}
                      onFocus={() => setActiveField("subject")}
                      onChange={(event) => setSubject(event.target.value)}
                      placeholder="Re: {{emailSubject}}"
                    />
                  </div>
                </div>

                <div>
                  <Label>Body</Label>
                  <Textarea
                    value={body}
                    onFocus={() => setActiveField("body")}
                    onChange={(event) => setBody(event.target.value)}
                    rows={10}
                    placeholder="Write message body..."
                  />
                  <p className="text-xs text-muted-foreground mt-2">Click data pills from sidebar to insert variables.</p>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                  <Button onClick={() => { void saveTemplate(); }}>Save Template</Button>
                </div>
              </div>

              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    <h3 className="font-semibold">Data Pills Sidebar</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">Click to insert into the active field.</p>
                  <p className="text-xs">Active Field: <span className="font-semibold capitalize">{activeField}</span></p>

                  <div className="flex flex-wrap gap-2">
                    {templateVariables.map((variable) => (
                      <button
                        key={variable.token}
                        type="button"
                        className={`rounded-full border px-2 py-1 text-xs ${sourceBadgeColor[variable.source]}`}
                        onClick={() => appendPill(variable.token)}
                      >
                        {variable.label}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map((template) => (
          <Card key={template.id}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{template.name}</h3>
                  <p className="text-sm text-muted-foreground">{template.subject}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(template)}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => { void deleteTemplate(template.id); }}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
              <pre className="text-xs whitespace-pre-wrap bg-muted/50 rounded-md p-3 border">{template.body}</pre>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppLayout>
  );
}
