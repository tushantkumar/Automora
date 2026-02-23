import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Condition = {
  entity: "customer" | "invoice";
  field: string;
  operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than";
  value: string;
};

type Metadata = {
  triggers: string[];
  operators: Condition["operator"][];
  conditionLogic: Array<"AND" | "OR">;
  actions: string[];
  fields: {
    customer: Array<{ key: string; label: string }>;
    invoice: Array<{ key: string; label: string }>;
  };
  mailTemplates: Array<{ id: string; name: string }>;
};

const initialCondition: Condition = {
  entity: "customer",
  field: "name",
  operator: "equals",
  value: "",
};

export default function Automation() {
  const { toast } = useToast();
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [automations, setAutomations] = useState<Array<{ id: string; name: string; trigger: string; action: string }>>([]);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("Email Received");
  const [conditionLogic, setConditionLogic] = useState<"AND" | "OR">("AND");
  const [conditions, setConditions] = useState<Condition[]>([initialCondition]);
  const [action, setAction] = useState("Send Mail");
  const [mailTemplateId, setMailTemplateId] = useState("");
  const [subAction, setSubAction] = useState("");

  const load = async () => {
    const [metadataRes, automationsRes] = await Promise.all([
      fetch("/api/automations/metadata"),
      fetch("/api/automations"),
    ]);

    if (!metadataRes.ok || !automationsRes.ok) {
      throw new Error("Failed to load automation data");
    }

    const metadataData = await metadataRes.json();
    const automationsData = await automationsRes.json();
    setMetadata(metadataData);
    setAutomations(automationsData.automations ?? []);
  };

  useEffect(() => {
    load().catch(() => {
      toast({ title: "Unable to load automation module", description: "Please verify database connection and retry." });
    });
  }, []);

  const requiresMailTemplate = useMemo(
    () => ["Send Mail", "AI Generate (Auto Reply)", "AI Generate (Draft)"].includes(action),
    [action],
  );

  const conditionFields = (entity: "customer" | "invoice") => {
    if (!metadata) return [];
    return entity === "customer" ? metadata.fields.customer : metadata.fields.invoice;
  };

  const updateCondition = (index: number, patch: Partial<Condition>) => {
    setConditions((prev) => prev.map((condition, i) => {
      if (i !== index) return condition;
      const next = { ...condition, ...patch };
      if (patch.entity) {
        const nextFields = conditionFields(patch.entity);
        next.field = nextFields[0]?.key ?? "";
      }
      return next;
    }));
  };

  const handleSave = async () => {
    const payload = {
      name,
      trigger,
      conditionLogic,
      conditions,
      action,
      subAction: action === "CRM" ? "Upsert CRM" : action === "Invoice" ? "Upsert Invoice" : undefined,
      mailTemplateId: requiresMailTemplate ? mailTemplateId || undefined : undefined,
    };

    const response = await fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      toast({ title: "Validation failed", description: data.errors?.[0]?.message ?? data.message ?? "Please check your inputs." });
      return;
    }

    toast({ title: "Automation saved" });
    setName("");
    setMailTemplateId("");
    setConditions([initialCondition]);
    await load();
  };

  useEffect(() => {
    if (action === "CRM") setSubAction("Upsert CRM");
    else if (action === "Invoice") setSubAction("Upsert Invoice");
    else setSubAction("");
  }, [action]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Automation Builder</h1>
          <p className="text-muted-foreground">Build dynamic automations using Customer and Invoice fields.</p>
        </div>

        <Card>
          <CardHeader><CardTitle>Create Automation</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Auto reply for overdue invoice" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Trigger</Label>
                <Select value={trigger} onValueChange={setTrigger}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{metadata?.triggers.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Condition Logic</Label>
                <Select value={conditionLogic} onValueChange={(value) => setConditionLogic(value as "AND" | "OR")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{metadata?.conditionLogic.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Action</Label>
                <Select value={action} onValueChange={setAction}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{metadata?.actions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {conditions.map((condition, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 border rounded-md">
                <Select value={condition.entity} onValueChange={(value) => updateCondition(index, { entity: value as "customer" | "invoice" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="invoice">Invoice</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={condition.field} onValueChange={(value) => updateCondition(index, { field: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {conditionFields(condition.entity).map((field) => (
                      <SelectItem key={`${condition.entity}-${field.key}`} value={field.key}>{field.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={condition.operator} onValueChange={(value) => updateCondition(index, { operator: value as Condition["operator"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{metadata?.operators.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                </Select>
                <Input value={condition.value} placeholder="Condition value" onChange={(event) => updateCondition(index, { value: event.target.value })} />
              </div>
            ))}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConditions((prev) => [...prev, { ...initialCondition }])}>Add condition</Button>
              {conditions.length > 1 && (
                <Button variant="outline" onClick={() => setConditions((prev) => prev.slice(0, -1))}>Remove last</Button>
              )}
            </div>

            {(action === "CRM" || action === "Invoice") && (
              <div>
                <Label>Sub Action</Label>
                <Input value={subAction} disabled />
              </div>
            )}

            {requiresMailTemplate && (
              <div>
                <Label>Mail Template</Label>
                <Select value={mailTemplateId || undefined} onValueChange={setMailTemplateId}>
                  <SelectTrigger><SelectValue placeholder="Select a mail template" /></SelectTrigger>
                  <SelectContent>
                    {metadata?.mailTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button onClick={() => { void handleSave(); }}>Save Automation</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Saved Automations</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {automations.length === 0 && <p className="text-sm text-muted-foreground">No automations yet.</p>}
            {automations.map((item) => (
              <div key={item.id} className="rounded border p-3 text-sm">
                <p className="font-medium">{item.name}</p>
                <p className="text-muted-foreground">Trigger: {item.trigger} • Action: {item.action}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
