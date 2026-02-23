import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:4000";

type FieldType = "string" | "number" | "date";

type Condition = {
  entity: "customer" | "invoice";
  field: string;
  operator: string;
  value: string;
  secondaryValue?: string;
};

type Metadata = {
  triggers: string[];
  invoiceSubTriggers: string[];
  operators: string[];
  conditionLogic: Array<"AND" | "OR">;
  actions: string[];
  fields: Array<{ entity: "customer" | "invoice"; key: string; label: string; dataType: FieldType }>;
  templates: Array<{ id: string; name: string }>;
};

const defaultCondition: Condition = {
  entity: "customer",
  field: "",
  operator: "equals",
  value: "",
};

const operatorsByType: Record<FieldType, string[]> = {
  string: ["equals", "not equals", "contains", "starts with", "ends with", "is null", "is not null"],
  number: ["equals", "not equals", "greater than", "less than", "greater than or equal", "less than or equal", "between", "is null", "is not null"],
  date: ["equals", "not equals", "greater than", "less than", "greater than or equal", "less than or equal", "between", "is null", "is not null"],
};

export default function Automation() {
  const { toast } = useToast();
  const token = localStorage.getItem("authToken");

  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [automations, setAutomations] = useState<Array<{ id: string; name: string; trigger_type: string; action_type: string; sub_trigger: string | null }>>([]);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("Email Received");
  const [subTrigger, setSubTrigger] = useState("");
  const [conditionLogic, setConditionLogic] = useState<"AND" | "OR">("AND");
  const [conditions, setConditions] = useState<Condition[]>([defaultCondition]);
  const [action, setAction] = useState("Send Mail");
  const [mailTemplateId, setMailTemplateId] = useState("");
  const [subAction, setSubAction] = useState("");

  const load = async () => {
    if (!token) return;

    const [metaResponse, automationsResponse] = await Promise.all([
      fetch(`${AUTH_API_URL}/automations/metadata`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${AUTH_API_URL}/automations`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    const metaData = await metaResponse.json();
    const automationData = await automationsResponse.json();

    if (!metaResponse.ok || !automationsResponse.ok) {
      throw new Error(metaData.message || automationData.message || "Unable to load automation data");
    }

    setMetadata(metaData);
    setAutomations(Array.isArray(automationData.automations) ? automationData.automations : []);

    const firstCustomerField = metaData.fields.find((field: Metadata["fields"][number]) => field.entity === "customer")?.key || "";
    setConditions([{ ...defaultCondition, field: firstCustomerField }]);
  };

  useEffect(() => {
    load().catch(() => {
      toast({ title: "Unable to load automation module", description: "Please try again." });
    });
  }, []);

  const requiresMailTemplate = useMemo(
    () => ["Send Mail", "AI Generate (Auto Reply)", "AI Generate (Draft)"].includes(action),
    [action],
  );

  const fieldsByEntity = (entity: "customer" | "invoice") =>
    metadata?.fields.filter((field) => field.entity === entity) || [];

  const getFieldType = (entity: "customer" | "invoice", fieldKey: string): FieldType =>
    fieldsByEntity(entity).find((field) => field.key === fieldKey)?.dataType || "string";

  const updateCondition = (index: number, patch: Partial<Condition>) => {
    setConditions((prev) =>
      prev.map((condition, i) => {
        if (i !== index) return condition;

        const next = { ...condition, ...patch };
        if (patch.entity) {
          const firstField = fieldsByEntity(patch.entity)[0]?.key || "";
          next.field = firstField;
        }

        const type = getFieldType(next.entity, next.field);
        const allowedOps = operatorsByType[type];
        if (!allowedOps.includes(next.operator)) {
          next.operator = allowedOps[0];
        }

        if (["is null", "is not null"].includes(next.operator)) {
          next.value = "";
          next.secondaryValue = "";
        }

        return next;
      }),
    );
  };

  const validateClient = () => {
    if (!name.trim()) return "Automation name is required";

    if (trigger === "Invoice" && !subTrigger) {
      return "Invoice trigger requires sub-trigger";
    }

    if (trigger !== "Invoice" && subTrigger) {
      return "Sub-trigger is only valid for Invoice trigger";
    }

    if (requiresMailTemplate && !mailTemplateId) {
      return "Mail template is required for selected action";
    }

    if ((action === "CRM" && subAction !== "Upsert CRM") || (action === "Invoice" && subAction !== "Upsert Invoice")) {
      return "Please select a valid sub-action";
    }

    if (conditions.length === 0) return "At least one condition is required";

    for (const condition of conditions) {
      const fieldDef = metadata?.fields.find((field) => field.entity === condition.entity && field.key === condition.field);
      if (!fieldDef) return `Field ${condition.field} is invalid for ${condition.entity}`;

      const allowed = operatorsByType[fieldDef.dataType];
      if (!allowed.includes(condition.operator)) {
        return `Operator ${condition.operator} is invalid for ${fieldDef.dataType} fields`;
      }

      if (!["is null", "is not null"].includes(condition.operator) && !condition.value.trim()) {
        return `Condition value is required for ${fieldDef.label}`;
      }

      if (condition.operator === "between" && !String(condition.secondaryValue || "").trim()) {
        return `Between operator requires two values for ${fieldDef.label}`;
      }
    }

    return null;
  };

  const handleSave = async () => {
    if (!token || !metadata) {
      toast({ title: "Unauthorized" });
      return;
    }

    const clientError = validateClient();
    if (clientError) {
      toast({ title: "Validation failed", description: clientError });
      return;
    }

    const normalizedConditions = conditions.map((condition) => ({
      entity: condition.entity,
      field: condition.field,
      operator: condition.operator,
      value: condition.operator === "between"
        ? [condition.value.trim(), String(condition.secondaryValue || "").trim()]
        : ["is null", "is not null"].includes(condition.operator)
          ? null
          : condition.value.trim(),
    }));

    const response = await fetch(`${AUTH_API_URL}/automations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name,
        trigger,
        subTrigger: trigger === "Invoice" ? subTrigger : undefined,
        conditionLogic,
        conditions: normalizedConditions,
        action,
        subAction: action === "CRM" ? "Upsert CRM" : action === "Invoice" ? "Upsert Invoice" : undefined,
        mailTemplateId: requiresMailTemplate ? mailTemplateId : undefined,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      toast({ title: "Validation failed", description: data.message || "Please check your input" });
      return;
    }

    toast({ title: "Automation created" });
    setName("");
    setSubTrigger("");
    setMailTemplateId("");
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
          <p className="text-muted-foreground">Build dynamic workflows using all Customer and Invoice fields.</p>
        </div>

        <Card>
          <CardHeader><CardTitle>Create Automation</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Overdue invoice reminder" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Trigger</Label>
                <Select value={trigger} onValueChange={setTrigger}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{metadata?.triggers.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {trigger === "Invoice" && (
                <div>
                  <Label>Sub Trigger</Label>
                  <Select value={subTrigger} onValueChange={setSubTrigger}>
                    <SelectTrigger><SelectValue placeholder="Select invoice sub-trigger" /></SelectTrigger>
                    <SelectContent>{metadata?.invoiceSubTriggers.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}

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

            {conditions.map((condition, index) => {
              const fieldType = getFieldType(condition.entity, condition.field);
              const allowedOperators = operatorsByType[fieldType];
              return (
                <div key={index} className="grid grid-cols-1 md:grid-cols-6 gap-3 border rounded-md p-3">
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
                      {fieldsByEntity(condition.entity).map((field) => (
                        <SelectItem key={`${field.entity}-${field.key}`} value={field.key}>{field.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={condition.operator} onValueChange={(value) => updateCondition(index, { operator: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {allowedOperators.map((item) => <SelectItem key={`${condition.field}-${item}`} value={item}>{item}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  {condition.operator !== "between" && !["is null", "is not null"].includes(condition.operator) && (
                    <Input value={condition.value} placeholder="Value" onChange={(event) => updateCondition(index, { value: event.target.value })} />
                  )}

                  {condition.operator === "between" && (
                    <>
                      <Input value={condition.value} placeholder="From" onChange={(event) => updateCondition(index, { value: event.target.value })} />
                      <Input value={condition.secondaryValue || ""} placeholder="To" onChange={(event) => updateCondition(index, { secondaryValue: event.target.value })} />
                    </>
                  )}
                </div>
              );
            })}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const firstField = fieldsByEntity("customer")[0]?.key || "";
                  setConditions((prev) => [...prev, { ...defaultCondition, field: firstField }]);
                }}
              >
                Add condition
              </Button>
              {conditions.length > 1 && (
                <Button variant="outline" onClick={() => setConditions((prev) => prev.slice(0, -1))}>Remove last</Button>
              )}
            </div>

            {(action === "CRM" || action === "Invoice") && (
              <div>
                <Label>Sub Action</Label>
                <Select value={subAction} onValueChange={setSubAction}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {action === "CRM" && <SelectItem value="Upsert CRM">Upsert CRM</SelectItem>}
                    {action === "Invoice" && <SelectItem value="Upsert Invoice">Upsert Invoice</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            )}

            {requiresMailTemplate && (
              <div>
                <Label>Mail Template</Label>
                <Select value={mailTemplateId || undefined} onValueChange={setMailTemplateId}>
                  <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                  <SelectContent>
                    {metadata?.templates.map((template) => (
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
              <div key={item.id} className="rounded border p-3">
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-muted-foreground">
                  Trigger: {item.trigger_type}{item.sub_trigger ? ` (${item.sub_trigger})` : ""} • Action: {item.action_type}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
