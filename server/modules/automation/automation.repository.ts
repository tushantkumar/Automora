import { randomUUID } from "crypto";
import { pool } from "../../db";
import type { CreateAutomationDTO } from "./automation.validation";

export type AutomationRecord = {
  id: string;
  name: string;
  trigger: string;
  conditionLogic: string;
  conditions: unknown;
  action: string;
  subAction: string | null;
  mailTemplateId: string | null;
  createdAt: string;
};

export class AutomationRepository {
  async init(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mail_templates (
        id VARCHAR(64) PRIMARY KEY,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS automations (
        id VARCHAR(64) PRIMARY KEY,
        name TEXT NOT NULL,
        trigger TEXT NOT NULL,
        condition_logic TEXT NOT NULL,
        conditions JSONB NOT NULL,
        action TEXT NOT NULL,
        sub_action TEXT,
        mail_template_id VARCHAR(64),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }

  async getMailTemplates(): Promise<Array<{ id: string; name: string }>> {
    const result = await pool.query<{ id: string; name: string }>("SELECT id, name FROM mail_templates ORDER BY created_at DESC");
    return result.rows;
  }

  async createAutomation(data: CreateAutomationDTO): Promise<AutomationRecord> {
    const id = randomUUID();
    const result = await pool.query<AutomationRecord>(
      `INSERT INTO automations (id, name, trigger, condition_logic, conditions, action, sub_action, mail_template_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
       RETURNING id, name, trigger, condition_logic as "conditionLogic", conditions, action, sub_action as "subAction", mail_template_id as "mailTemplateId", created_at as "createdAt"`,
      [id, data.name, data.trigger, data.conditionLogic, JSON.stringify(data.conditions), data.action, data.subAction ?? null, data.mailTemplateId ?? null],
    );

    return result.rows[0];
  }

  async listAutomations(): Promise<AutomationRecord[]> {
    const result = await pool.query<AutomationRecord>(
      `SELECT id, name, trigger, condition_logic as "conditionLogic", conditions, action, sub_action as "subAction", mail_template_id as "mailTemplateId", created_at as "createdAt"
       FROM automations ORDER BY created_at DESC`,
    );

    return result.rows;
  }
}
