import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { axios } from "@/lib/axios";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:4000";

type FieldType = "string" | "number" | "date" | "boolean";

type Metadata = {
  triggers: string[];
  invoiceSubTriggers: string[];
  operators: string[];
  conditionLogic: Array<"AND" | "OR">;
  actions: string[];
  fields: Array<{ entity: "customer" | "invoice"; key: string; label: string; dataType: FieldType }>;
  templates: Array<{ id: string; name: string }>;
};

const operatorEnum = z.enum([
  "equals",
  "not equals",
  "contains",
  "starts with",
  "ends with",
  "greater than",
  "less than",
  "greater than or equal",
  "less than or equal",
  "between",
  "is null",
  "is not null",
]);

const conditionSchema = z.object({
  entity: z.enum(["customer", "invoice"]),
  field: z.string().min(1),
  operator: operatorEnum,
  value: z.string().optional().default(""),
  secondaryValue: z.string().optional().default(""),
});

const formSchema = z
  .object({
    name: z.string().min(1, "Automation name is required"),
    trigger: z.enum(["Email Received", "Customer", "Invoice"]),
    subTrigger: z.string().optional().default(""),
    conditionLogic: z.enum(["AND", "OR"]),
    conditions: z.array(conditionSchema).min(1, "At least one condition is required"),
    action: z.enum(["Send Mail", "AI Generate (Auto Reply)", "AI Generate (Draft)", "CRM", "Invoice"]),
    subAction: z.string().optional().default(""),
    mailTemplateId: z.string().optional().default(""),
    isActive: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.trigger === "Invoice" && !value.subTrigger) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["subTrigger"], message: "Sub-trigger is required for Invoice trigger" });
    }

    if (["Send Mail", "AI Generate (Auto Reply)", "AI Generate (Draft)"].includes(value.action) && !value.mailTemplateId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["mailTemplateId"], message: "Mail template is required" });
    }

    if (value.action === "CRM" && value.subAction !== "Upsert CRM") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["subAction"], message: "Sub-action required" });
    }

    if (value.action === "Invoice" && value.subAction !== "Upsert Invoice") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["subAction"], message: "Sub-action required" });
    }
  });

type FormValues = z.infer<typeof formSchema>;

const operatorsByType: Record<FieldType, string[]> = {
  string: ["equals", "not equals", "contains", "starts with", "ends with", "is null", "is not null"],
  number: ["equals", "not equals", "greater than", "less than", "greater than or equal", "less than or equal", "between", "is null", "is not null"],
  date: ["equals", "not equals", "greater than", "less than", "greater than or equal", "less than or equal", "between", "is null", "is not null"],
  boolean: ["equals", "not equals", "is null", "is not null"],
};

export default function Automation() {
  const { toast } = useToast();
  const token = localStorage.getItem("authToken") || "";

  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [automations, setAutomations] = useState<Array<{ id: string; name: string; trigger_type: string; action_type: string; is_active: boolean; sub_trigger: string | null }>>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(8);
  const [totalPages, setTotalPages] = useState(1);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      trigger: "Email Received",
      subTrigger: "",
      conditionLogic: "AND",
      conditions: [{ entity: "customer", field: "", operator: "equals", value: "", secondaryValue: "" }],
      action: "Send Mail",
      subAction: "",
      mailTemplateId: "",
      isActive: true,
    },
  });

  const { fields, append, remove, update } = useFieldArray({ control: form.control, name: "conditions" });
  const trigger = form.watch("trigger");
  const action = form.watch("action");

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const load = async (targetPage = page) => {
    const [meta, list] = await Promise.all([
      axios.get<Metadata>(`${AUTH_API_URL}/automations/metadata`, { headers }),
      axios.get<{ automations: Array<{ id: string; name: string; trigger_type: string; action_type: string; is_active: boolean; sub_trigger: string | null }>; pagination: { totalPages: number } }>(
        `${AUTH_API_URL}/automations?page=${targetPage}&pageSize=${pageSize}`,
        { headers },
      ),
    ]);

    setMetadata(meta.data);
    setAutomations(list.data.automations || []);
    setTotalPages(list.data.pagination?.totalPages || 1);

    const defaultField = meta.data.fields.find((item) => item.entity === "customer")?.key || "";
    if (!form.getValues("conditions.0.field")) {
      form.setValue("conditions.0.field", defaultField);
    }
  };

  useEffect(() => {
    load(page).catch((error) => {
      toast({ title: "Unable to load automations", description: error.message });
    });
  }, [page]);

  useEffect(() => {
    if (action === "CRM") form.setValue("subAction", "Upsert CRM");
    else if (action === "Invoice") form.setValue("subAction", "Upsert Invoice");
    else form.setValue("subAction", "");
  }, [action]);

  const fieldsByEntity = (entity: "customer" | "invoice") => metadata?.fields.filter((item) => item.entity === entity) || [];

  const getType = (entity: "customer" | "invoice", fieldKey: string) =>
    fieldsByEntity(entity).find((item) => item.key === fieldKey)?.dataType || "string";

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const normalizedConditions = values.conditions.map((condition) => {
        if (condition.operator === "between") {
          return {
            entity: condition.entity,
            field: condition.field,
            operator: condition.operator,
            value: [condition.value || "", condition.secondaryValue || ""],
          };
        }

        if (["is null", "is not null"].includes(condition.operator)) {
          return { ...condition, value: null };
        }

        return { ...condition, value: condition.value || "" };
      });

      await axios.post(`${AUTH_API_URL}/automations`, {
        ...values,
        subTrigger: values.trigger === "Invoice" ? values.subTrigger : undefined,
        subAction: values.action === "CRM" ? "Upsert CRM" : values.action === "Invoice" ? "Upsert Invoice" : undefined,
        mailTemplateId: ["Send Mail", "AI Generate (Auto Reply)", "AI Generate (Draft)"].includes(values.action) ? values.mailTemplateId : undefined,
        conditions: normalizedConditions,
      }, { headers });

      toast({ title: "Automation created" });
      form.reset({
        name: "",
        trigger: "Email Received",
        subTrigger: "",
        conditionLogic: "AND",
        conditions: [{ entity: "customer", field: metadata?.fields.find((item) => item.entity === "customer")?.key || "", operator: "equals", value: "", secondaryValue: "" }],
        action: "Send Mail",
        subAction: "",
        mailTemplateId: "",
        isActive: true,
      });
      await load(page);
    } catch (error) {
      toast({ title: "Failed to create automation", description: (error as Error).message });
    }
  });

  const toggleAutomation = async (automationId: string, isActive: boolean) => {
    try {
      await axios.patch(`${AUTH_API_URL}/automations/${automationId}/toggle`, { isActive: !isActive }, { headers });
      await load(page);
    } catch (error) {
      toast({ title: "Unable to update automation", description: (error as Error).message });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Automation Builder</h1>
          <p className="text-muted-foreground">Configure dynamic automations with trigger execution rules.</p>
        </div>

        <Card>
          <CardHeader><CardTitle>Create Automation</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input {...form.register("name")} placeholder="Reminder for due invoices" />
              <p className="text-xs text-destructive">{form.formState.errors.name?.message}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Trigger</Label>
                <Select value={form.watch("trigger")} onValueChange={(value) => form.setValue("trigger", value as FormValues["trigger"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{metadata?.triggers.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {trigger === "Invoice" && (
                <div>
                  <Label>Sub Trigger</Label>
                  <Select value={form.watch("subTrigger")} onValueChange={(value) => form.setValue("subTrigger", value)}>
                    <SelectTrigger><SelectValue placeholder="Select sub-trigger" /></SelectTrigger>
                    <SelectContent>{metadata?.invoiceSubTriggers.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-destructive">{form.formState.errors.subTrigger?.message}</p>
                </div>
              )}

              <div>
                <Label>Condition Logic</Label>
                <Select value={form.watch("conditionLogic")} onValueChange={(value) => form.setValue("conditionLogic", value as "AND" | "OR")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{metadata?.conditionLogic.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div>
                <Label>Action</Label>
                <Select value={form.watch("action")} onValueChange={(value) => form.setValue("action", value as FormValues["action"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{metadata?.actions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={form.watch("isActive")} onCheckedChange={(checked) => form.setValue("isActive", checked)} />
              <Label>Active</Label>
            </div>

            {fields.map((field, index) => {
              const entity = form.watch(`conditions.${index}.entity`);
              const fieldKey = form.watch(`conditions.${index}.field`);
              const operator = form.watch(`conditions.${index}.operator`);
              const fieldType = getType(entity, fieldKey);
              const availableOps = operatorsByType[fieldType];

              return (
                <div key={field.id} className="grid grid-cols-1 md:grid-cols-6 gap-3 border rounded-md p-3">
                  <Select value={entity} onValueChange={(value) => {
                    const first = fieldsByEntity(value as "customer" | "invoice")[0]?.key || "";
                    update(index, { ...form.getValues(`conditions.${index}`), entity: value as "customer" | "invoice", field: first, operator: "equals" });
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="invoice">Invoice</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={fieldKey} onValueChange={(value) => form.setValue(`conditions.${index}.field`, value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {fieldsByEntity(entity).map((item) => <SelectItem key={`${entity}-${item.key}`} value={item.key}>{item.label}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Select value={operator} onValueChange={(value) => form.setValue(`conditions.${index}.operator`, value as FormValues["conditions"][number]["operator"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {availableOps.map((item) => <SelectItem key={`${fieldKey}-${item}`} value={item}>{item}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  {operator !== "between" && !["is null", "is not null"].includes(operator) && (
                    <Input value={form.watch(`conditions.${index}.value`)} onChange={(event) => form.setValue(`conditions.${index}.value`, event.target.value)} placeholder="Value" />
                  )}

                  {operator === "between" && (
                    <>
                      <Input value={form.watch(`conditions.${index}.value`)} onChange={(event) => form.setValue(`conditions.${index}.value`, event.target.value)} placeholder="From" />
                      <Input value={form.watch(`conditions.${index}.secondaryValue`)} onChange={(event) => form.setValue(`conditions.${index}.secondaryValue`, event.target.value)} placeholder="To" />
                    </>
                  )}

                  {fields.length > 1 && (
                    <Button type="button" variant="outline" onClick={() => remove(index)}>Remove</Button>
                  )}
                </div>
              );
            })}

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => append({ entity: "customer", field: fieldsByEntity("customer")[0]?.key || "", operator: "equals", value: "", secondaryValue: "" })}>Add Condition</Button>
            </div>

            {(action === "CRM" || action === "Invoice") && (
              <div>
                <Label>Sub Action</Label>
                <Select value={form.watch("subAction")} onValueChange={(value) => form.setValue("subAction", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {action === "CRM" && <SelectItem value="Upsert CRM">Upsert CRM</SelectItem>}
                    {action === "Invoice" && <SelectItem value="Upsert Invoice">Upsert Invoice</SelectItem>}
                  </SelectContent>
                </Select>
                <p className="text-xs text-destructive">{form.formState.errors.subAction?.message}</p>
              </div>
            )}

            {["Send Mail", "AI Generate (Auto Reply)", "AI Generate (Draft)"].includes(action) && (
              <div>
                <Label>Mail Template</Label>
                <Select value={form.watch("mailTemplateId") || undefined} onValueChange={(value) => form.setValue("mailTemplateId", value)}>
                  <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                  <SelectContent>
                    {metadata?.templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-destructive">{form.formState.errors.mailTemplateId?.message}</p>
              </div>
            )}

            <Button type="button" onClick={() => { void onSubmit(); }}>Save Automation</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Automations</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {automations.length === 0 && <p className="text-sm text-muted-foreground">No automations available.</p>}
            {automations.map((item) => (
              <div key={item.id} className="rounded border p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.trigger_type}{item.sub_trigger ? ` (${item.sub_trigger})` : ""} • {item.action_type}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{item.is_active ? "Enabled" : "Disabled"}</span>
                  <Switch checked={item.is_active} onCheckedChange={() => { void toggleAutomation(item.id, item.is_active); }} />
                </div>
              </div>
            ))}
            <div className="flex justify-between items-center">
              <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>Previous</Button>
              <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
              <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => setPage((prev) => prev + 1)}>Next</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
