-- Punjab Sports Mart Local SQLite Schema
-- All tables mapped from the 9 normative CSV datasets

CREATE TABLE IF NOT EXISTS store_master (
    store_id TEXT PRIMARY KEY,
    store_name TEXT,
    city TEXT,
    region TEXT,
    pos_registers INTEGER,
    avg_daily_traffic INTEGER,
    nearby_store_id TEXT
);

CREATE TABLE IF NOT EXISTS product_master (
    sku TEXT PRIMARY KEY,
    name TEXT,
    category TEXT,
    vendor_id TEXT,
    list_price REAL,
    shelf_life_days INTEGER,
    storage_type TEXT,
    high_demand TEXT,
    warranty_days INTEGER,
    FOREIGN KEY (vendor_id) REFERENCES vendor_master(vendor_id)
);

CREATE TABLE IF NOT EXISTS employee_master (
    employee_id TEXT PRIMARY KEY,
    employee_name TEXT,
    role TEXT,
    store_id TEXT,
    escalation_level INTEGER,
    FOREIGN KEY (store_id) REFERENCES store_master(store_id)
);

CREATE TABLE IF NOT EXISTS vendor_master (
    vendor_id TEXT PRIMARY KEY,
    name TEXT,
    on_time_rate REAL,
    fill_rate REAL,
    effective_from TEXT,
    status TEXT,
    primary_category TEXT
);

CREATE TABLE IF NOT EXISTS inventory (
    store_id TEXT,
    sku TEXT,
    on_hand INTEGER,
    system_qty INTEGER,
    reorder_point INTEGER,
    last_count_date TEXT,
    shelf_capacity INTEGER,
    PRIMARY KEY (store_id, sku),
    FOREIGN KEY (sku) REFERENCES product_master(sku)
);

CREATE TABLE IF NOT EXISTS receipts (
    receipt_id TEXT PRIMARY KEY,
    store_id TEXT,
    sku TEXT,
    vendor_id TEXT,
    po_qty INTEGER,
    received_qty INTEGER,
    receipt_date TEXT,
    quality_check_ok TEXT,
    damage_notes TEXT,
    FOREIGN KEY (store_id) REFERENCES store_master(store_id),
    FOREIGN KEY (sku) REFERENCES product_master(sku),
    FOREIGN KEY (vendor_id) REFERENCES vendor_master(vendor_id)
);

CREATE TABLE IF NOT EXISTS returns_quality (
    return_id TEXT PRIMARY KEY,
    created_ts TEXT,
    store_id TEXT,
    sku TEXT,
    reason TEXT,
    refund_amount_inr REAL,
    receipt_present TEXT,
    status TEXT,
    notes TEXT,
    FOREIGN KEY (store_id) REFERENCES store_master(store_id),
    FOREIGN KEY (sku) REFERENCES product_master(sku)
);

CREATE TABLE IF NOT EXISTS support_cases (
    case_id TEXT PRIMARY KEY,
    created_ts TEXT,
    store_id TEXT,
    employee_id TEXT,
    role TEXT,
    issue_text TEXT,
    sku TEXT,
    category_label TEXT,
    priority_label TEXT,
    status TEXT,
    register_id TEXT,
    root_cause_hint TEXT,
    FOREIGN KEY (store_id) REFERENCES store_master(store_id),
    FOREIGN KEY (employee_id) REFERENCES employee_master(employee_id),
    FOREIGN KEY (sku) REFERENCES product_master(sku)
);

CREATE TABLE IF NOT EXISTS escalation_matrix (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT,
    trigger_rule TEXT,
    priority TEXT,
    team TEXT,
    channel TEXT,
    sla_minutes INTEGER,
    human_approval_required TEXT,
    policy_source TEXT
);

CREATE TABLE IF NOT EXISTS mock_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id TEXT,
    action_type TEXT,
    store_id TEXT,
    sku TEXT,
    priority TEXT,
    team TEXT,
    status TEXT DEFAULT 'PENDING_APPROVAL',
    payload TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_store_sku ON inventory(store_id, sku);
CREATE INDEX IF NOT EXISTS idx_receipts_store_sku ON receipts(store_id, sku);
CREATE INDEX IF NOT EXISTS idx_support_cases_ts ON support_cases(created_ts);
CREATE INDEX IF NOT EXISTS idx_support_cases_store ON support_cases(store_id);
CREATE INDEX IF NOT EXISTS idx_support_cases_priority ON support_cases(priority_label);
CREATE INDEX IF NOT EXISTS idx_returns_created_ts ON returns_quality(created_ts);
