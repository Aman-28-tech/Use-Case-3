import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { copilotOrchestrator } from './orchestrator';
import { runEvaluation } from './evaluation/evaluator';
import {
  getDashboardStats,
  getOutboxList,
  updateOutboxStatus,
  searchProducts,
  getInventory,
  queryAll
} from './db/database';
import { retrievalAgent } from './agents/retrievalAgent';

// Load environment variables from root or local .env
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

app.use(cors());
app.use(express.json());

// Initialize knowledge base
retrievalAgent.loadKnowledgeBase();

// Health Check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Punjab Sports Mart AI Operations Copilot',
    timestamp: '2026-10-10 12:00:00 IST',
    model: process.env.LLM_MODEL || 'claude-haiku-5.5:free',
    database: 'Local SQLite (retail_operations.sqlite)'
  });
});

// 1. Triage Endpoint (M1, M4, M5, M7, M8)
app.post('/api/v1/triage', async (req: Request, res: Response) => {
  try {
    const { issue_text, persona, store_id, sku, test_id } = req.body;
    if (!issue_text || typeof issue_text !== 'string') {
      return res.status(400).json({ error: 'issue_text is required.' });
    }

    const result = await copilotOrchestrator.processRequest({
      issue_text,
      persona,
      store_id,
      sku,
      test_id
    });

    res.json(result);
  } catch (err: any) {
    console.error('[API Triage Error]:', err);
    res.status(500).json({ error: 'Internal triage error', detail: err.message });
  }
});

// 2. Analytics & Root Cause Endpoint (M6, B1)
app.post('/api/v1/analytics', async (req: Request, res: Response) => {
  try {
    const { question, store_id, sku } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'question is required.' });
    }

    const result = await copilotOrchestrator.processRequest({
      issue_text: question,
      persona: 'Regional Manager',
      store_id,
      sku
    });

    res.json(result);
  } catch (err: any) {
    console.error('[API Analytics Error]:', err);
    res.status(500).json({ error: 'Internal analytics error', detail: err.message });
  }
});

// 3. Evaluation Benchmark Endpoint (M9)
app.post('/api/v1/eval/run', async (req: Request, res: Response) => {
  try {
    console.log('[API Eval] Starting public benchmark evaluation run...');
    const results = await runEvaluation();
    res.json(results);
  } catch (err: any) {
    console.error('[API Eval Error]:', err);
    res.status(500).json({ error: 'Evaluation failed', detail: err.message });
  }
});

app.get('/api/v1/eval/latest', async (req: Request, res: Response) => {
  try {
    const results = await runEvaluation();
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load evaluation', detail: err.message });
  }
});

// 4. Dashboard Stats (B2 Bonus)
app.get('/api/v1/stats/dashboard', async (req: Request, res: Response) => {
  try {
    const stats = await getDashboardStats();
    res.json(stats);
  } catch (err: any) {
    console.error('[API Stats Error]:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard stats', detail: err.message });
  }
});

// 5. Store & Inventory Live Lookup
app.get('/api/v1/inventory', async (req: Request, res: Response) => {
  try {
    const { store_id, sku } = req.query;
    if (!store_id || !sku) {
      return res.status(400).json({ error: 'store_id and sku query params required.' });
    }
    const inv = await getInventory(String(store_id), String(sku));
    res.json({ inventory: inv });
  } catch (err: any) {
    res.status(500).json({ error: 'Inventory lookup error', detail: err.message });
  }
});

app.get('/api/v1/products', async (req: Request, res: Response) => {
  try {
    const q = req.query.q ? String(req.query.q) : '';
    const products = await searchProducts(q);
    res.json({ products });
  } catch (err: any) {
    res.status(500).json({ error: 'Product search error', detail: err.message });
  }
});

app.get('/api/v1/stores', async (req: Request, res: Response) => {
  try {
    const stores = await queryAll('SELECT * FROM store_master ORDER BY store_id ASC');
    res.json({ stores });
  } catch (err: any) {
    res.status(500).json({ error: 'Store list error', detail: err.message });
  }
});

// 6. Outbox Mock Payloads & Approvals (B3 Bonus)
app.get('/api/v1/actions/outbox', async (req: Request, res: Response) => {
  try {
    const items = await getOutboxList();
    res.json({ outbox: items });
  } catch (err: any) {
    res.status(500).json({ error: 'Outbox fetch error', detail: err.message });
  }
});

app.post('/api/v1/actions/approve', async (req: Request, res: Response) => {
  try {
    const { id, status } = req.body;
    if (!id || !status) {
      return res.status(400).json({ error: 'id and status required.' });
    }
    await updateOutboxStatus(Number(id), String(status));
    res.json({ success: true, id, status });
  } catch (err: any) {
    res.status(500).json({ error: 'Status update error', detail: err.message });
  }
});

// 7. Knowledge Base Document List
app.get('/api/v1/kb/sections', (req: Request, res: Response) => {
  res.json({
    message: 'Active Knowledge Base policies loaded',
    documents: [
      '01_retail_operations_sop.md',
      '02_pos_pricing_returns_policy.md',
      '03_inventory_replenishment_policy.md',
      '04_vendor_quality_policy.md',
      '05_responsible_ai_policy.md'
    ]
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`================================================================`);
  console.log(` Punjab Sports Mart AI Retail Copilot Backend running on:`);
  console.log(` Local:   http://localhost:${PORT}`);
  console.log(` Health:  http://localhost:${PORT}/health`);
  console.log(` Network: http://0.0.0.0:${PORT}`);
  console.log(` Model:   ${process.env.LLM_MODEL || 'claude-haiku-5.5:free'}`);
  console.log(`================================================================`);
});
