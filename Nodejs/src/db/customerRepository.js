import { pool } from "./postgres.js";

const CUSTOMER_SELECT = `id, user_id, name, client, contact, email, status, value, created_at, updated_at`;

export const createCustomer = async ({ id, userId, name, client, contact, email, status, value }) => {
  const result = await pool.query(
    `INSERT INTO auth_customers (id, user_id, name, client, contact, email, status, value)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${CUSTOMER_SELECT}`,
    [id, userId, name, client, contact, email, status, value],
  );

  return result.rows[0] ?? null;
};

export const listCustomersByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT ${CUSTOMER_SELECT}
     FROM auth_customers
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );

  return result.rows;
};

export const getCustomerById = async ({ customerId, userId }) => {
  const result = await pool.query(
    `SELECT ${CUSTOMER_SELECT}
     FROM auth_customers
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [customerId, userId],
  );

  return result.rows[0] ?? null;
};

export const updateCustomerById = async ({ customerId, userId, name, client, contact, email, status, value }) => {
  const result = await pool.query(
    `UPDATE auth_customers
     SET name = $1,
         client = $2,
         contact = $3,
         email = $4,
         status = $5,
         value = $6,
         updated_at = NOW()
     WHERE id = $7 AND user_id = $8
     RETURNING ${CUSTOMER_SELECT}`,
    [name, client, contact, email, status, value, customerId, userId],
  );

  return result.rows[0] ?? null;
};

export const deleteCustomerById = async ({ customerId, userId }) => {
  const result = await pool.query(
    `DELETE FROM auth_customers
     WHERE id = $1 AND user_id = $2`,
    [customerId, userId],
  );

  return result.rowCount > 0;
};

export const setCustomerRevenueByClient = async ({ userId, clientName, revenueValue }) => {
  await pool.query(
    `UPDATE auth_customers
     SET value = $1,
         updated_at = NOW()
     WHERE user_id = $2
       AND client = $3`,
    [revenueValue, userId, clientName],
  );
};

export const setCustomerRevenueById = async ({ userId, customerId, revenueValue }) => {
  await pool.query(
    `UPDATE auth_customers
     SET value = $1,
         updated_at = NOW()
     WHERE user_id = $2
       AND id = $3`,
    [revenueValue, userId, customerId],
  );
};
