import fs from 'fs';
import path from 'path';
import initSqlJs, { Database as SqlDatabase } from 'sql.js';

let dbInstance: SqlDatabase | null = null;
const dbFilePath = path.join(__dirname, '..', '..', '..', 'DB', 'retail_operations.sqlite');
const outboxDir = path.join(__dirname, '..', '..', 'outbox');

export async function getDatabase(): Promise<SqlDatabase> {
  if (dbInstance) return dbInstance;
  const SQL = await initSqlJs();
  if (fs.existsSync(dbFilePath)) {
    const fileBuffer = fs.readFileSync(dbFilePath);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
  }
  return dbInstance;
}

export function saveDatabase(): void {
  if (!dbInstance) return;
  const data = dbInstance.export();
  fs.writeFileSync(dbFilePath, Buffer.from(data));
}

export async function queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const db = await getDatabase();
  const stmt = db.prepare(sql);
  if (params && params.length > 0) {
    stmt.bind(params);
  }
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as unknown as T);
  }
  stmt.free();
  return results;
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await queryAll<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function execute(sql: string, params: any[] = []): Promise<void> {
  const db = await getDatabase();
  db.run(sql, params);
  saveDatabase();
}

// ----------------- High Level Domain Queries -----------------

export interface InventoryRecord {
  store_id: string;
  sku: string;
  on_hand: number;
  system_qty: number;
  reorder_point: number;
  last_count_date: string;
  shelf_capacity: number;
  product_name?: string;
  vendor_id?: string;
  high_demand?: string;
}

export async function getInventory(storeId: string, sku: string): Promise<InventoryRecord | null> {
  const sql = `
    SELECT i.*, p.name as product_name, p.vendor_id, p.high_demand
    FROM inventory i
    LEFT JOIN product_master p ON i.sku = p.sku
    WHERE i.store_id = ? AND i.sku = ?
  `;
  return queryOne<InventoryRecord>(sql, [storeId, sku]);
}

export async function getWarehouseStock(sku: string): Promise<InventoryRecord | null> {
  const sql = `
    SELECT i.*, p.name as product_name, p.vendor_id, p.high_demand
    FROM inventory i
    LEFT JOIN product_master p ON i.sku = p.sku
    WHERE i.store_id = 'WH001' AND i.sku = ?
  `;
  return queryOne<InventoryRecord>(sql, [sku]);
}

export interface ReceiptRecord {
  receipt_id: string;
  store_id: string;
  sku: string;
  vendor_id: string;
  po_qty: number;
  received_qty: number;
  receipt_date: string;
  quality_check_ok: string;
  damage_notes?: string;
}

export async function getReceipts(storeId?: string, sku?: string, limit = 5): Promise<ReceiptRecord[]> {
  let sql = `SELECT * FROM receipts WHERE 1=1`;
  const params: any[] = [];
  if (storeId) {
    sql += ` AND store_id = ?`;
    params.push(storeId);
  }
  if (sku) {
    sql += ` AND sku = ?`;
    params.push(sku);
  }
  sql += ` ORDER BY receipt_date DESC LIMIT ?`;
  params.push(limit);
  return queryAll<ReceiptRecord>(sql, params);
}

export interface VendorRecord {
  vendor_id: string;
  name: string;
  on_time_rate: number;
  fill_rate: number;
  effective_from: string;
  status: string;
  primary_category: string;
}

export async function getVendor(vendorId: string): Promise<VendorRecord | null> {
  return queryOne<VendorRecord>(`SELECT * FROM vendor_master WHERE vendor_id = ?`, [vendorId]);
}

export interface ProductRecord {
  sku: string;
  name: string;
  category: string;
  vendor_id: string;
  list_price: number;
  shelf_life_days: number;
  storage_type: string;
  high_demand: string;
  warranty_days: number;
}

export async function getProduct(sku: string): Promise<ProductRecord | null> {
  return queryOne<ProductRecord>(`SELECT * FROM product_master WHERE sku = ?`, [sku]);
}

export async function searchProducts(queryText: string): Promise<ProductRecord[]> {
  const q = `%${queryText}%`;
  return queryAll<ProductRecord>(`SELECT * FROM product_master WHERE name LIKE ? OR sku LIKE ? LIMIT 10`, [q, q]);
}

export interface StoreRecord {
  store_id: string;
  store_name: string;
  city: string;
  region: string;
  pos_registers: number;
  avg_daily_traffic: number;
  nearby_store_id?: string;
}

export async function getStore(storeId: string): Promise<StoreRecord | null> {
  return queryOne<StoreRecord>(`SELECT * FROM store_master WHERE store_id = ?`, [storeId]);
}

export interface SupportCaseRecord {
  case_id: string;
  created_ts: string;
  store_id: string;
  employee_id: string;
  role: string;
  issue_text: string;
  sku?: string;
  category_label: string;
  priority_label: string;
  status: string;
  register_id?: string;
  root_cause_hint?: string;
}

export async function getCasesInWindow(
  startTs: string,
  endTs: string,
  priorities?: string[],
  excludeClosed = true
): Promise<SupportCaseRecord[]> {
  let sql = `SELECT * FROM support_cases WHERE created_ts >= ? AND created_ts <= ?`;
  const params: any[] = [startTs, endTs];
  if (excludeClosed) {
    sql += ` AND status != 'Closed'`;
  }
  if (priorities && priorities.length > 0) {
    const placeholders = priorities.map(() => '?').join(',');
    sql += ` AND priority_label IN (${placeholders})`;
    params.push(...priorities);
  }
  sql += ` ORDER BY created_ts DESC`;
  return queryAll<SupportCaseRecord>(sql, params);
}

export interface EscalationMatrixRecord {
  id: number;
  category: string;
  trigger_rule: string;
  priority: string;
  team: string;
  channel: string;
  sla_minutes: number;
  human_approval_required: string;
  policy_source: string;
}

export async function getEscalationRules(): Promise<EscalationMatrixRecord[]> {
  return queryAll<EscalationMatrixRecord>(`SELECT * FROM escalation_matrix`);
}

export interface OutboxPayloadRecord {
  id?: number;
  trace_id: string;
  action_type: string;
  store_id?: string;
  sku?: string;
  priority: string;
  team: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'SUBMITTED' | 'REJECTED';
  payload: any;
  created_at?: string;
}

export async function saveOutboxAction(record: OutboxPayloadRecord): Promise<OutboxPayloadRecord> {
  const db = await getDatabase();
  const payloadStr = JSON.stringify(record.payload, null, 2);
  db.run(
    `INSERT INTO mock_outbox (trace_id, action_type, store_id, sku, priority, team, status, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.trace_id,
      record.action_type,
      record.store_id || null,
      record.sku || null,
      record.priority,
      record.team,
      record.status || 'PENDING_APPROVAL',
      payloadStr
    ]
  );
  saveDatabase();

  // Also write file to backend/outbox directory for B3 demo visibility
  if (!fs.existsSync(outboxDir)) {
    fs.mkdirSync(outboxDir, { recursive: true });
  }
  const filename = `${record.action_type}_${record.store_id || 'STORE'}_${record.trace_id.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
  const filePath = path.join(outboxDir, filename);
  fs.writeFileSync(filePath, payloadStr, 'utf-8');

  return record;
}

export async function getOutboxList(): Promise<any[]> {
  const rows = await queryAll<any>(`SELECT * FROM mock_outbox ORDER BY id DESC LIMIT 50`);
  return rows.map(r => ({
    ...r,
    payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload
  }));
}

export async function updateOutboxStatus(id: number, status: string): Promise<boolean> {
  await execute(`UPDATE mock_outbox SET status = ? WHERE id = ?`, [status, id]);
  return true;
}

export async function getDashboardStats() {
  const totalCasesRow = await queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM support_cases`);
  const openCasesRow = await queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM support_cases WHERE status != 'Closed'`);
  const p1Row = await queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM support_cases WHERE priority_label = 'P1' AND status != 'Closed'`);
  const p2Row = await queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM support_cases WHERE priority_label = 'P2' AND status != 'Closed'`);
  const p3Row = await queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM support_cases WHERE priority_label = 'P3' AND status != 'Closed'`);
  const p4Row = await queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM support_cases WHERE priority_label = 'P4' AND status != 'Closed'`);

  const byPriority = await queryAll<{ priority_label: string; count: number }>(
    `SELECT priority_label, COUNT(*) as count FROM support_cases GROUP BY priority_label ORDER BY priority_label`
  );

  const byCategory = await queryAll<{ category_label: string; count: number }>(
    `SELECT category_label, COUNT(*) as count FROM support_cases GROUP BY category_label ORDER BY count DESC`
  );

  const byRegion = await queryAll<{ region: string; count: number }>(
    `SELECT s.region, COUNT(c.case_id) as count
     FROM support_cases c
     JOIN store_master s ON c.store_id = s.store_id
     GROUP BY s.region
     ORDER BY count DESC`
  );

  const recentIncidents = await queryAll<any>(
    `SELECT c.*, s.store_name, s.region
     FROM support_cases c
     JOIN store_master s ON c.store_id = s.store_id
     ORDER BY c.created_ts DESC
     LIMIT 15`
  );

  const vendorRisks = await queryAll<any>(
    `SELECT * FROM vendor_master WHERE fill_rate < 0.80 OR on_time_rate < 0.85 ORDER BY fill_rate ASC`
  );

  return {
    totalCases: totalCasesRow?.count || 0,
    openCases: openCasesRow?.count || 0,
    p1Count: p1Row?.count || 0,
    p2Count: p2Row?.count || 0,
    p3Count: p3Row?.count || 0,
    p4Count: p4Row?.count || 0,
    byPriority,
    byCategory,
    byRegion,
    recentIncidents,
    vendorRisks
  };
}
