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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { axios } from "@/lib/axios";
import { Pencil, Plus, Trash2 } from "lucide-react";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:4000";

type FieldType = "string" | "number" | "date" | "boolean";

type Metadata = {
  triggers: string[];
  invoiceSubTriggers: string[];
  operators: string[];
  conditionLogic: Array<"AND" | "OR">;
  conditionJoiners: Array<"AND" | "OR">;
  actions: string[];
  fields: Array<{ entity: "customer" | "invoice"; key: string; label: string; dataType: FieldType }>;
  templates: Array<{ id: string; name: string }>;
};

type AutomationRow = {
  id: string;
  name: string;
  trigger_type: string;
  sub_trigger: string | null;
  action_type: string;
  is_active: boolean;
  created_at: string;
  condition_logic: "AND" | "OR";
  conditions: Array<{ entity: "customer" | "invoice"; field: string; operator: string; value: string | string[] | null; joiner?: "AND" | "OR" }>;
  action_sub_type: string | null;
  mail_template_id: string | null;
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
  joiner: z.enum(["AND", "OR"]).default("AND"),
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

const defaultFormValues: FormValues = {
  name: "",
  trigger: "Email Received",
  subTrigger: "",
  conditionLogic: "AND",
  conditions: [{ entity: "customer", field: "", operator: "equals", value: "", secondaryValue: "", joiner: "AND" }],
  action: "Send Mail",
  subAction: "",
  mailTemplateId: "",
  isActive: true,
};

export default function Automation() {
  const { toast } = useToast();
  const token = localStorage.getItem("authToken") || "";
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [automations, setAutomations] = useState<AutomationRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [editing, setEditing] = useState<AutomationRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AutomationRow | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultFormValues,
  });

  const { fields, append, remove, update } = useFieldArray({ control: form.control, name: "conditions" });
  const trigger = form.watch("trigger");
  const action = form.watch("action");

  const fieldsByEntity = (entity: "customer" | "invoice") => metadata?.fields.filter((item) => item.entity === entity) || [];

  const getFieldType = (entity: "customer" | "invoice", fieldKey: string): FieldType =>
    fieldsByEntity(entity).find((item) => item.key === fieldKey)?.dataType || "string";

  const loadMetadata = async () => {
    const response = await axios.get<Metadata>(`${AUTH_API_URL}/automations/metadata`, { headers });
    setMetadata(response.data);
    return response.data;
  };

  const loadAutomations = async (targetPage = page, targetSearch = appliedSearch) => {
    const response = await axios.get<{ automations: AutomationRow[]; pagination: { totalPages: number } }>(
      `${AUTH_API_URL}/automations?page=${targetPage}&pageSize=${pageSize}&search=${encodeURIComponent(targetSearch)}`,
      { headers },
    );

    setAutomations(response.data.automations || []);
    setTotalPages(response.data.pagination?.totalPages || 1);
  };

  const resetForCreate = async () => {
    const meta = metadata || (await loadMetadata());
    const customerDefaultField = meta.fields.find((item) => item.entity === "customer")?.key || "";

    form.reset({
      ...defaultFormValues,
      conditions: [{ entity: "customer", field: customerDefaultField, operator: "equals", value: "", secondaryValue: "", joiner: "AND" }],
    });
    setEditing(null);
    setOpenModal(true);
  };

  const openEdit = async (row: AutomationRow) => {
    const meta = metadata || (await loadMetadata());

    const mappedConditions = (row.conditions || []).map((condition) => {
      const between = Array.isArray(condition.value) ? condition.value : [];
      return {
        entity: condition.entity,
        field: condition.field,
        operator: condition.operator as FormValues["conditions"][number]["operator"],
        value: Array.isArray(condition.value) ? String(between[0] || "") : String(condition.value ?? ""),
        secondaryValue: Array.isArray(condition.value) ? String(between[1] || "") : "",
        joiner: condition.joiner || "AND",
      };
    });

    form.reset({
      name: row.name,
      trigger: row.trigger_type as FormValues["trigger"],
      subTrigger: row.sub_trigger || "",
      conditionLogic: row.condition_logic || "AND",
      conditions: mappedConditions.length
        ? mappedConditions
        : [{ entity: "customer", field: meta.fields.find((item) => item.entity === "customer")?.key || "", operator: "equals", value: "", secondaryValue: "", joiner: "AND" }],
      action: row.action_type as FormValues["action"],
      subAction: row.action_sub_type || "",
      mailTemplateId: row.mail_template_id || "",
      isActive: Boolean(row.is_active),
    });

    setEditing(row);
    setOpenModal(true);
  };

  useEffect(() => {
    Promise.all([loadMetadata(), loadAutomations(page, appliedSearch)]).catch((error) => {
      toast({ title: "Unable to load automation module", description: (error as Error).message });
    });
  }, [page, appliedSearch]);

  useEffect(() => {
    if (action === "CRM") form.setValue("subAction", "Upsert CRM");
    else if (action === "Invoice") form.setValue("subAction", "Upsert Invoice");
    else form.setValue("subAction", "");
  }, [action, form]);

  const submitForm = form.handleSubmit(async (values) => {
    try {
      const normalizedConditions = values.conditions.map((condition) => {
        const joiner = condition.joiner || values.conditionLogic;
        if (condition.operator === "between") {
          return {
            entity: condition.entity,
            field: condition.field,
            operator: condition.operator,
            value: [condition.value || "", condition.secondaryValue || ""],
            joiner,
          };
        }

        if (["is null", "is not null"].includes(condition.operator)) {
          return { ...condition, value: null, joiner };
        }

        return { ...condition, value: condition.value || "", joiner };
      });

      const payload = {
        ...values,
        subTrigger: values.trigger === "Invoice" ? values.subTrigger : undefined,
        subAction: values.action === "CRM" ? "Upsert CRM" : values.action === "Invoice" ? "Upsert Invoice" : undefined,
        mailTemplateId: ["Send Mail", "AI Generate (Auto Reply)", "AI Generate (Draft)"].includes(values.action) ? values.mailTemplateId : undefined,
        conditions: normalizedConditions,
      };

      if (editing) {
        await axios.put(`${AUTH_API_URL}/automations/${editing.id}`, payload, { headers });
        toast({ title: "Automation updated" });
      } else {
        await axios.post(`${AUTH_API_URL}/automations`, payload, { headers });
        toast({ title: "Automation created" });
      }

      setOpenModal(false);
      await loadAutomations(page, appliedSearch);
    } catch (error) {
      toast({ title: "Save failed", description: (error as Error).message });
    }
  });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axios.delete(`${AUTH_API_URL}/automations/${deleteTarget.id}`, { headers });
      setDeleteTarget(null);
      toast({ title: "Automation deleted" });
      await loadAutomations(page, appliedSearch);
    } catch (error) {
      toast({ title: "Delete failed", description: (error as Error).message });
    }
  };

  const toggleStatus = async (row: AutomationRow) => {
    try {
      await axios.patch(`${AUTH_API_URL}/automations/${row.id}/toggle`, { isActive: !row.is_active }, { headers });
      await loadAutomations(page, appliedSearch);
    } catch (error) {
      toast({ title: "Toggle failed", description: (error as Error).message });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Automations</h1>
            <p className="text-muted-foreground">Set up AI-powered workflows that run automatically.</p>
          </div>
          <Button onClick={() => { void resetForCreate(); }}><Plus className="w-4 h-4 mr-2" /> New Automation</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Automation Management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input placeholder="Search by name" value={search} onChange={(event) => setSearch(event.target.value)} />
              <Button
                variant="outline"
                onClick={() => {
                  setPage(1);
                  setAppliedSearch(search.trim());
                }}
              >
                Search
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Sub Trigger</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created Date</TableHead>
                  <TableHead className="w-44">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {automations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6">No automations found.</TableCell>
                  </TableRow>
                )}
                {automations.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.trigger_type}</TableCell>
                    <TableCell>{item.sub_trigger || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch checked={item.is_active} onCheckedChange={() => { void toggleStatus(item); }} />
                        <span className="text-xs">{item.is_active ? "Active" : "Inactive"}</span>
                      </div>
                    </TableCell>
                    <TableCell>{new Date(item.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => { void openEdit(item); }}><Pencil className="w-4 h-4 mr-1" />Edit</Button>
                        <Button variant="destructive" size="sm" onClick={() => setDeleteTarget(item)}><Trash2 className="w-4 h-4 mr-1" />Delete</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex justify-between items-center">
              <Button variant="outline" disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>Previous</Button>
              <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
              <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((prev) => prev + 1)}>Next</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Automation" : "Create Automation"}</DialogTitle>
            <DialogDescription>Configure basic info, conditions, and actions.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-3">
              <h3 className="font-semibold">1. Basic Info</h3>
              <div>
                <Label>Automation Name</Label>
                <Input {...form.register("name")} placeholder="Invoice request auto-response" />
                <p className="text-xs text-destructive">{form.formState.errors.name?.message}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                      <SelectTrigger><SelectValue placeholder="Select sub trigger" /></SelectTrigger>
                      <SelectContent>{metadata?.invoiceSubTriggers.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                    </Select>
                    <p className="text-xs text-destructive">{form.formState.errors.subTrigger?.message}</p>
                  </div>
                )}
                <div>
                  <Label>Status</Label>
                  <div className="h-10 flex items-center gap-2 border rounded-md px-3">
                    <Switch checked={form.watch("isActive")} onCheckedChange={(checked) => form.setValue("isActive", checked)} />
                    <span className="text-sm">{form.watch("isActive") ? "Active" : "Inactive"}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold">2. Conditions</h3>
              <div>
                <Label>Fallback Condition Logic</Label>
                <Select value={form.watch("conditionLogic")} onValueChange={(value) => form.setValue("conditionLogic", value as "AND" | "OR")}>
                  <SelectTrigger className="max-w-[220px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AND">AND</SelectItem>
                    <SelectItem value="OR">OR</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {fields.map((field, index) => {
                const entity = form.watch(`conditions.${index}.entity`);
                const fieldKey = form.watch(`conditions.${index}.field`);
                const operator = form.watch(`conditions.${index}.operator`);
                const fieldType = getFieldType(entity, fieldKey);
                const operators = operatorsByType[fieldType] || operatorsByType.string;

                return (
                  <div key={field.id} className="grid grid-cols-1 md:grid-cols-7 gap-2 border rounded-md p-3">
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
                      <SelectContent>{fieldsByEntity(entity).map((item) => <SelectItem key={`${entity}-${item.key}`} value={item.key}>{item.label}</SelectItem>)}</SelectContent>
                    </Select>

                    <Select value={operator} onValueChange={(value) => form.setValue(`conditions.${index}.operator`, value as FormValues["conditions"][number]["operator"])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{operators.map((item) => <SelectItem key={`${fieldKey}-${item}`} value={item}>{item}</SelectItem>)}</SelectContent>
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

                    <Select value={form.watch(`conditions.${index}.joiner`)} onValueChange={(value) => form.setValue(`conditions.${index}.joiner`, value as "AND" | "OR")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AND">AND</SelectItem>
                        <SelectItem value="OR">OR</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button type="button" variant="outline" onClick={() => remove(index)} disabled={fields.length <= 1}>Remove</Button>
                  </div>
                );
              })}

              <Button type="button" variant="outline" onClick={() => append({ entity: "customer", field: fieldsByEntity("customer")[0]?.key || "", operator: "equals", value: "", secondaryValue: "", joiner: "AND" })}>Add Condition</Button>
              <p className="text-xs text-destructive">{form.formState.errors.conditions?.message as string | undefined}</p>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold">3. Actions</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>Action</Label>
                  <Select value={form.watch("action")} onValueChange={(value) => form.setValue("action", value as FormValues["action"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{metadata?.actions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                  </Select>
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
                      <SelectContent>{metadata?.templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <p className="text-xs text-destructive">{form.formState.errors.mailTemplateId?.message}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpenModal(false)}>Cancel</Button>
              <Button onClick={() => { void submitForm(); }}>{editing ? "Update Automation" : "Create Automation"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(isOpen) => !isOpen && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete automation?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The automation "{deleteTarget?.name}" will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void handleDelete(); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
