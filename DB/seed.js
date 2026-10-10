const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.join(__dirname, '..', 'backend', 'node_modules', 'sql.js'));

function parseCSV(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];
  
  function parseLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur.trim());
    return result;
  }

  const headers = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.length === headers.length) {
      const row = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = values[j];
      }
      rows.push(row);
    }
  }
  return rows;
}

async function runSeed() {
  console.log('[Seed] Initializing SQLite via WebAssembly (sql.js)...');
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  
  // Read and execute schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.run(schema);
  console.log('[Seed] Schema applied successfully.');

  const dataDir = path.join(__dirname, '..', 'Use Case 3', 'data');
  if (!fs.existsSync(dataDir)) {
    console.error(`[Seed] Data directory not found at: ${dataDir}`);
    process.exit(1);
  }

  function loadRows(filename) {
    const p = path.join(dataDir, filename);
    const content = fs.readFileSync(p, 'utf-8');
    return parseCSV(content);
  }

  // 1. store_master
  const stores = loadRows('store_master.csv');
  const stmtStore = db.prepare(`
    INSERT INTO store_master (store_id, store_name, city, region, pos_registers, avg_daily_traffic, nearby_store_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of stores) {
    stmtStore.run([
      r.store_id,
      r.store_name,
      r.city,
      r.region,
      parseInt(r.pos_registers || '0', 10),
      parseInt(r.avg_daily_traffic || '0', 10),
      r.nearby_store_id || null
    ]);
  }
  stmtStore.free();
  console.log(`[Seed] Loaded ${stores.length} store_master rows.`);

  // 2. vendor_master
  const vendors = loadRows('vendor_master.csv');
  const stmtVendor = db.prepare(`
    INSERT INTO vendor_master (vendor_id, name, on_time_rate, fill_rate, effective_from, status, primary_category)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of vendors) {
    stmtVendor.run([
      r.vendor_id,
      r.name,
      parseFloat(r.on_time_rate || '0'),
      parseFloat(r.fill_rate || '0'),
      r.effective_from,
      r.status,
      r.primary_category
    ]);
  }
  stmtVendor.free();
  console.log(`[Seed] Loaded ${vendors.length} vendor_master rows.`);

  // 3. product_master
  const products = loadRows('product_master.csv');
  const stmtProd = db.prepare(`
    INSERT INTO product_master (sku, name, category, vendor_id, list_price, shelf_life_days, storage_type, high_demand, warranty_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of products) {
    stmtProd.run([
      r.sku,
      r.name,
      r.category,
      r.vendor_id,
      parseFloat(r.list_price || '0'),
      parseInt(r.shelf_life_days || '0', 10),
      r.storage_type,
      r.high_demand,
      parseInt(r.warranty_days || '0', 10)
    ]);
  }
  stmtProd.free();
  console.log(`[Seed] Loaded ${products.length} product_master rows.`);

  // 4. employee_master
  const employees = loadRows('employee_master.csv');
  const stmtEmp = db.prepare(`
    INSERT INTO employee_master (employee_id, employee_name, role, store_id, escalation_level)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const r of employees) {
    stmtEmp.run([
      r.employee_id,
      r.employee_name,
      r.role,
      r.store_id,
      parseInt(r.escalation_level || '1', 10)
    ]);
  }
  stmtEmp.free();
  console.log(`[Seed] Loaded ${employees.length} employee_master rows.`);

  // 5. inventory
  const inventory = loadRows('inventory.csv');
  const stmtInv = db.prepare(`
    INSERT INTO inventory (store_id, sku, on_hand, system_qty, reorder_point, last_count_date, shelf_capacity)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of inventory) {
    stmtInv.run([
      r.store_id,
      r.sku,
      parseInt(r.on_hand || '0', 10),
      parseInt(r.system_qty || '0', 10),
      parseInt(r.reorder_point || '0', 10),
      r.last_count_date,
      parseInt(r.shelf_capacity || '0', 10)
    ]);
  }
  stmtInv.free();
  console.log(`[Seed] Loaded ${inventory.length} inventory rows.`);

  // 6. receipts
  const receipts = loadRows('receipts.csv');
  const stmtRcpt = db.prepare(`
    INSERT INTO receipts (receipt_id, store_id, sku, vendor_id, po_qty, received_qty, receipt_date, quality_check_ok, damage_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of receipts) {
    stmtRcpt.run([
      r.receipt_id,
      r.store_id,
      r.sku,
      r.vendor_id,
      parseInt(r.po_qty || '0', 10),
      parseInt(r.received_qty || '0', 10),
      r.receipt_date,
      r.quality_check_ok,
      r.damage_notes || null
    ]);
  }
  stmtRcpt.free();
  console.log(`[Seed] Loaded ${receipts.length} receipts rows.`);

  // 7. returns_quality
  const returns = loadRows('returns_quality.csv');
  const stmtRet = db.prepare(`
    INSERT INTO returns_quality (return_id, created_ts, store_id, sku, reason, refund_amount_inr, receipt_present, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of returns) {
    stmtRet.run([
      r.return_id,
      r.created_ts,
      r.store_id,
      r.sku,
      r.reason,
      parseFloat(r.refund_amount_inr || '0'),
      r.receipt_present,
      r.status,
      r.notes || null
    ]);
  }
  stmtRet.free();
  console.log(`[Seed] Loaded ${returns.length} returns_quality rows.`);

  // 8. support_cases
  const cases = loadRows('support_cases.csv');
  const stmtCase = db.prepare(`
    INSERT INTO support_cases (case_id, created_ts, store_id, employee_id, role, issue_text, sku, category_label, priority_label, status, register_id, root_cause_hint)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of cases) {
    stmtCase.run([
      r.case_id,
      r.created_ts,
      r.store_id,
      r.employee_id,
      r.role,
      r.issue_text,
      r.sku || null,
      r.category_label,
      r.priority_label,
      r.status,
      r.register_id || null,
      r.root_cause_hint || null
    ]);
  }
  stmtCase.free();
  console.log(`[Seed] Loaded ${cases.length} support_cases rows.`);

  // 9. escalation_matrix
  const escMatrix = loadRows('escalation_matrix.csv');
  const stmtEsc = db.prepare(`
    INSERT INTO escalation_matrix (category, trigger_rule, priority, team, channel, sla_minutes, human_approval_required, policy_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of escMatrix) {
    stmtEsc.run([
      r.category,
      r.trigger,
      r.priority,
      r.team,
      r.channel,
      parseInt(r.sla_minutes || '60', 10),
      r.human_approval_required,
      r.policy_source
    ]);
  }
  stmtEsc.free();
  console.log(`[Seed] Loaded ${escMatrix.length} escalation_matrix rows.`);

  // Save database to binary file
  const binaryArray = db.export();
  const dbPath = path.join(__dirname, 'retail_operations.sqlite');
  fs.writeFileSync(dbPath, Buffer.from(binaryArray));
  const dbPathDb = path.join(__dirname, 'retail_operations.db');
  fs.writeFileSync(dbPathDb, Buffer.from(binaryArray));
  console.log(`[Seed] Exported SQLite database (${binaryArray.length} bytes) to ${dbPath}`);
  
  db.close();
  console.log('[Seed] Seeding completed 100% successfully!');
}

if (require.main === module) {
  runSeed().catch(err => {
    console.error('[Seed Error]:', err);
    process.exit(1);
  });
}

module.exports = { runSeed };
