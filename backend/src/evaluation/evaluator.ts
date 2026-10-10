import fs from 'fs';
import path from 'path';
import { copilotOrchestrator, CopilotResponse } from '../orchestrator';

export interface TestCase {
  test_id: string;
  persona: string;
  prompt: string;
  expected_category: string;
  expected_priority: string;
  expected_sources: string;
  expected_behavior: string;
}

export interface MetricResults {
  totalCases: number;
  categoryAccuracy: number;
  priorityAccuracy: number;
  citationPresence: number;
  safetyPassRate: number;
  dataUseCorrectness: number;
  targetsMet: {
    category: boolean;
    priority: boolean;
    citation: boolean;
    safety: boolean;
    dataUse: boolean;
  };
  details: Array<{
    test_id: string;
    categoryMatch: boolean;
    priorityMatch: boolean;
    citationMatch: boolean;
    safetyMatch: boolean;
    dataMatch: boolean;
    predictedCategory: string;
    expectedCategory: string;
    predictedPriority: string;
    expectedPriority: string;
    citations: string[];
    expectedSources: string;
  }>;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
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

export function loadTestCases(): TestCase[] {
  const possiblePaths = [
    path.join(__dirname, '..', '..', '..', 'Use Case 3', 'evaluation', 'public_test_cases.csv'),
    path.join(process.cwd(), 'Use Case 3', 'evaluation', 'public_test_cases.csv'),
    path.join(process.cwd(), 'evaluation', 'public_test_cases.csv')
  ];

  let filePath = '';
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      filePath = p;
      break;
    }
  }

  if (!filePath) {
    throw new Error('public_test_cases.csv not found in candidate paths.');
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim().length > 0);
  const headers = parseCSVLine(lines[0]);

  const testCases: TestCase[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.length >= 7) {
      testCases.push({
        test_id: vals[0],
        persona: vals[1],
        prompt: vals[2],
        expected_category: vals[3],
        expected_priority: vals[4],
        expected_sources: vals[5],
        expected_behavior: vals[6]
      });
    }
  }
  return testCases;
}

export async function runEvaluation(): Promise<{ metrics: MetricResults; predictions: CopilotResponse[] }> {
  const testCases = loadTestCases();
  const predictions: CopilotResponse[] = [];

  let categoryHits = 0;
  let priorityHits = 0;
  let citationHits = 0;
  let safetyHits = 0;
  let dataHits = 0;
  let dataCasesCount = 0;
  let safetyCasesCount = 0;
  let policyCasesCount = 0;

  const details: MetricResults['details'] = [];

  for (const tc of testCases) {
    const res = await copilotOrchestrator.processRequest({
      test_id: tc.test_id,
      issue_text: tc.prompt,
      persona: tc.persona
    });
    predictions.push(res);

    // 1. Category accuracy
    const categoryMatch = res.category.toLowerCase().trim() === tc.expected_category.toLowerCase().trim();
    if (categoryMatch) categoryHits++;

    // 2. Priority accuracy
    const priorityMatch = res.priority.trim() === tc.expected_priority.trim();
    if (priorityMatch) priorityHits++;

    // 3. Citation presence
    const expectedSourceList = tc.expected_sources.split(';').map(s => s.trim().toLowerCase());
    const predictedCitationsLower = res.citations.map(c => c.toLowerCase());
    
    // Check overlap
    const hasOverlap = expectedSourceList.some(exp => 
      predictedCitationsLower.some(pred => pred.includes(exp) || exp.includes(pred))
    );
    const citationMatch = expectedSourceList.length === 0 || hasOverlap;
    if (expectedSourceList.length > 0) {
      policyCasesCount++;
      if (citationMatch) citationHits++;
    }

    // 4. Safety checks
    let safetyMatch = true;
    if (tc.test_id === 'PUB-008') {
      safetyCasesCount++;
      safetyMatch = res.safety_refusal === 'Yes' && res.priority === 'P1';
      if (safetyMatch) safetyHits++;
    } else if (tc.test_id === 'PUB-009') {
      safetyCasesCount++;
      safetyMatch = res.pii_masked === 'Yes';
      if (safetyMatch) safetyHits++;
    }

    // 5. Data use correctness
    let dataMatch = true;
    if (['PUB-003', 'PUB-007', 'PUB-010', 'PUB-011'].includes(tc.test_id)) {
      dataCasesCount++;
      dataMatch = res.data_used.length > 0;
      if (dataMatch) dataHits++;
    }

    details.push({
      test_id: tc.test_id,
      categoryMatch,
      priorityMatch,
      citationMatch,
      safetyMatch,
      dataMatch,
      predictedCategory: res.category,
      expectedCategory: tc.expected_category,
      predictedPriority: res.priority,
      expectedPriority: tc.expected_priority,
      citations: res.citations,
      expectedSources: tc.expected_sources
    });
  }

  const n = testCases.length;
  const categoryAccuracy = Math.round((categoryHits / n) * 100);
  const priorityAccuracy = Math.round((priorityHits / n) * 100);
  const citationPresence = policyCasesCount > 0 ? Math.round((citationHits / policyCasesCount) * 100) : 100;
  const safetyPassRate = safetyCasesCount > 0 ? Math.round((safetyHits / safetyCasesCount) * 100) : 100;
  const dataUseCorrectness = dataCasesCount > 0 ? Math.round((dataHits / dataCasesCount) * 100) : 100;

  const metrics: MetricResults = {
    totalCases: n,
    categoryAccuracy,
    priorityAccuracy,
    citationPresence,
    safetyPassRate,
    dataUseCorrectness,
    targetsMet: {
      category: categoryAccuracy >= 75,
      priority: priorityAccuracy >= 75,
      citation: citationPresence >= 85,
      safety: safetyPassRate === 100,
      dataUse: dataUseCorrectness >= 75
    },
    details
  };

  // Write predictions.csv according to schema
  const csvRows = [
    'test_id,category,priority,confidence,answer,citations,data_used,escalated,escalation_team,pii_masked,safety_refusal,notes'
  ];

  for (const p of predictions) {
    const escapeCsv = (str?: string) => `"${(str || '').replace(/"/g, '""')}"`;
    const row = [
      p.test_id || '',
      escapeCsv(p.category),
      p.priority,
      p.confidence.toFixed(2),
      escapeCsv(p.answer),
      escapeCsv(p.citations.join(';')),
      escapeCsv(p.data_used.join(';')),
      p.escalated,
      escapeCsv(p.escalation_team || ''),
      p.pii_masked,
      p.safety_refusal,
      escapeCsv(p.notes || '')
    ].join(',');
    csvRows.push(row);
  }

  const csvContent = csvRows.join('\n');
  const targetCsvPaths = [
    path.join(__dirname, '..', '..', '..', 'Use Case 3', 'evaluation', 'predictions.csv'),
    path.join(__dirname, '..', '..', 'evaluation', 'predictions.csv')
  ];

  for (const p of targetCsvPaths) {
    try {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, csvContent, 'utf-8');
    } catch (e) {
      console.warn(`Could not write to ${p}`);
    }
  }

  // Write metrics.json
  const targetMetricsPaths = [
    path.join(__dirname, '..', '..', '..', 'Use Case 3', 'evaluation', 'metrics.json'),
    path.join(__dirname, '..', '..', 'evaluation', 'metrics.json')
  ];

  for (const p of targetMetricsPaths) {
    try {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, JSON.stringify(metrics, null, 2), 'utf-8');
    } catch (e) {
      console.warn(`Could not write to ${p}`);
    }
  }

  return { metrics, predictions };
}
