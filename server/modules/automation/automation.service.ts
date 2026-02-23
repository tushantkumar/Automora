import type { EntityField } from "./automation.types";
import { AutomationRepository } from "./automation.repository";
import type { CreateAutomationDTO } from "./automation.validation";

const customerFields: EntityField[] = [
  { key: "name", label: "Customer Name", dataType: "string", source: "customer" },
  { key: "client", label: "Client", dataType: "string", source: "customer" },
  { key: "contact", label: "Contact", dataType: "string", source: "customer" },
  { key: "email", label: "Email", dataType: "string", source: "customer" },
  { key: "status", label: "Status", dataType: "string", source: "customer" },
  { key: "value", label: "Value", dataType: "number", source: "customer" },
  { key: "createdAt", label: "Created At", dataType: "date", source: "customer" },
];

const invoiceFields: EntityField[] = [
  { key: "invoiceNumber", label: "Invoice Number", dataType: "string", source: "invoice" },
  { key: "customerId", label: "Customer ID", dataType: "string", source: "invoice" },
  { key: "amount", label: "Amount", dataType: "number", source: "invoice" },
  { key: "status", label: "Status", dataType: "string", source: "invoice" },
  { key: "dueDate", label: "Due Date", dataType: "date", source: "invoice" },
  { key: "createdAt", label: "Created At", dataType: "date", source: "invoice" },
];

export class AutomationService {
  constructor(private readonly repository: AutomationRepository) {}

  async initialize() {
    await this.repository.init();
  }

  getConditionFields() {
    return {
      customer: customerFields,
      invoice: invoiceFields,
      all: [...customerFields, ...invoiceFields],
    };
  }

  async getMailTemplates() {
    return this.repository.getMailTemplates();
  }

  async createAutomation(data: CreateAutomationDTO) {
    return this.repository.createAutomation(data);
  }

  async listAutomations() {
    return this.repository.listAutomations();
  }
}
