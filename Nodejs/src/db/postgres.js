import pg from "pg";
import { DATABASE_URL } from "../config/constants.js";

const { Pool, types } = pg;

// Keep DATE columns as plain YYYY-MM-DD strings to avoid timezone day-shift issues.
types.setTypeParser(1082, (value) => value);

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required for Nodejs auth service");
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
});

export const initDatabase = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_verified BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL DEFAULT 'Active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_verification_tokens (
      token TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL REFERENCES auth_users(email) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_password_reset_tokens (
      token TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL REFERENCES auth_users(email) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_onboarding_details (
      user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
      industry TEXT,
      business_bio TEXT,
      organization_name TEXT,
      clients_count INTEGER,
      automation_use TEXT,
      selected_automations JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active';`);
  await pool.query(`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS platform_tier TEXT NOT NULL DEFAULT 'free';`);
  await pool.query(`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS subscription_plan TEXT NOT NULL DEFAULT 'Starter';`);
  await pool.query(`ALTER TABLE auth_onboarding_details ADD COLUMN IF NOT EXISTS industry TEXT;`);
  await pool.query(`ALTER TABLE auth_onboarding_details ADD COLUMN IF NOT EXISTS business_bio TEXT;`);
  await pool.query(`ALTER TABLE auth_onboarding_details ADD COLUMN IF NOT EXISTS selected_automations JSONB NOT NULL DEFAULT '[]'::jsonb;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_account_delete_otps (
      user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
      otp_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);


  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_customers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      client TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      contact TEXT NOT NULL,
      email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      value TEXT NOT NULL DEFAULT '$0',
      last_interaction TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, email)
    );
  `);

  await pool.query(`ALTER TABLE auth_customers ADD COLUMN IF NOT EXISTS client TEXT NOT NULL DEFAULT '';`);
  await pool.query(`UPDATE auth_customers SET client = name WHERE client = '';`);



  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_invoices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      customer_id TEXT REFERENCES auth_customers(id) ON DELETE SET NULL,
      invoice_number TEXT NOT NULL,
      client_name TEXT NOT NULL,
      issue_date DATE NOT NULL,
      due_date DATE NOT NULL,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      tax_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Unpaid',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, invoice_number)
    );
  `);

  await pool.query(`ALTER TABLE auth_invoices ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES auth_customers(id) ON DELETE SET NULL;`);
  await pool.query(`ALTER TABLE auth_invoices ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE auth_invoices ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(6,2) NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE auth_invoices ADD COLUMN IF NOT EXISTS line_items JSONB NOT NULL DEFAULT '[]'::jsonb;`);
  await pool.query(`ALTER TABLE auth_invoices ALTER COLUMN status SET DEFAULT 'Unpaid';`);
  await pool.query(`UPDATE auth_invoices SET status = 'Unpaid' WHERE status = 'Draft';`);
  await pool.query(`
    UPDATE auth_invoices i
    SET customer_id = c.id
    FROM auth_customers c
    WHERE i.customer_id IS NULL
      AND i.user_id = c.user_id
      AND i.client_name = c.client
  `);


  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_email_integrations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_expiry TIMESTAMPTZ,
      connected_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, provider)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_inbox_emails (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      external_id TEXT NOT NULL,
      from_name TEXT NOT NULL DEFAULT '',
      from_email TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      snippet TEXT NOT NULL DEFAULT '',
      category TEXT,
      confidence_score NUMERIC(5,4),
      replied_at TIMESTAMPTZ,
      received_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, provider, external_id)
    );
  `);

  await pool.query(`ALTER TABLE auth_inbox_emails ADD COLUMN IF NOT EXISTS category TEXT;`);
  await pool.query(`ALTER TABLE auth_inbox_emails ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,4);`);
  await pool.query(`ALTER TABLE auth_inbox_emails ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_automations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      sub_trigger TEXT,
      condition_logic TEXT NOT NULL DEFAULT 'AND',
      conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
      action_type TEXT NOT NULL,
      action_sub_type TEXT,
      mail_template_id TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE auth_automations ADD COLUMN IF NOT EXISTS sub_trigger TEXT;`);
  await pool.query(`ALTER TABLE auth_automations ADD COLUMN IF NOT EXISTS condition_logic TEXT NOT NULL DEFAULT 'AND';`);
  await pool.query(`ALTER TABLE auth_automations ADD COLUMN IF NOT EXISTS conditions JSONB NOT NULL DEFAULT '[]'::jsonb;`);
  await pool.query(`ALTER TABLE auth_automations ADD COLUMN IF NOT EXISTS mail_template_id TEXT;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_mail_templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`DO $$ BEGIN
    ALTER TABLE auth_automations
      ADD CONSTRAINT auth_automations_mail_template_fk
      FOREIGN KEY (mail_template_id) REFERENCES auth_mail_templates(id) ON DELETE SET NULL;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_draft_emails (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      automation_id TEXT NOT NULL REFERENCES auth_automations(id) ON DELETE CASCADE,
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    INSERT INTO auth_mail_templates (id, user_id, name, subject, body)
    SELECT
      md5(u.id || '-seed-template'),
      u.id,
      'Seed Invoice Reminder',
      'Invoice {{invoice.invoice_number}} due soon',
      'Hello {{customer.name}}, your invoice {{invoice.invoice_number}} is due on {{invoice.due_date}}.'
    FROM auth_users u
    WHERE u.is_verified = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM auth_mail_templates t
        WHERE t.user_id = u.id
          AND t.name = 'Seed Invoice Reminder'
      );
  `);

  await pool.query(`
    INSERT INTO auth_automations (
      id, user_id, name, trigger_type, sub_trigger, condition_logic, conditions, action_type, action_sub_type, mail_template_id, is_active
    )
    SELECT
      md5(u.id || '-seed-automation'),
      u.id,
      'Seed Day Before Overdue Reminder',
      'Invoice',
      'Day Before Overdue',
      'AND',
      '[{"entity":"invoice","field":"status","operator":"not equals","value":"Paid"}]'::jsonb,
      'Send Mail',
      NULL,
      md5(u.id || '-seed-template'),
      TRUE
    FROM auth_users u
    WHERE u.is_verified = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM auth_automations a
        WHERE a.user_id = u.id
          AND a.name = 'Seed Day Before Overdue Reminder'
      );
  `);

};

export const ensureDatabaseIndexes = async () => {
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS auth_password_reset_tokens_email_idx ON auth_password_reset_tokens(email);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS auth_customers_user_id_idx ON auth_customers(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS auth_invoices_user_id_idx ON auth_invoices(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS auth_invoices_customer_id_idx ON auth_invoices(customer_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS auth_email_integrations_user_id_idx ON auth_email_integrations(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS auth_inbox_emails_user_id_idx ON auth_inbox_emails(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS auth_inbox_emails_category_idx ON auth_inbox_emails(category);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS auth_mail_templates_user_id_idx ON auth_mail_templates(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS auth_account_delete_otps_expires_idx ON auth_account_delete_otps(expires_at);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS auth_automations_user_id_idx ON auth_automations(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS auth_automations_trigger_type_idx ON auth_automations(trigger_type);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS auth_draft_emails_user_id_idx ON auth_draft_emails(user_id);`);
};
