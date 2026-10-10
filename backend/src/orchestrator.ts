import { safetyAgent } from './agents/safetyAgent';
import { triageAgent, RetailCategory, RetailPriority } from './agents/triageAgent';
import { retrievalAgent } from './agents/retrievalAgent';
import { dataAgent } from './agents/dataAgent';
import { workflowAgent } from './agents/workflowAgent';
import { generateGroundedAnswer } from './services/llmService';

export interface CopilotRequest {
  test_id?: string;
  issue_text: string;
  persona?: string;
  store_id?: string;
  sku?: string;
}

export interface CopilotResponse {
  test_id?: string;
  traceId: string;
  category: RetailCategory;
  priority: RetailPriority;
  confidence: number;
  answer: string;
  citations: string[];
  data_used: string[];
  escalated: 'Yes' | 'No';
  escalation_team?: string;
  pii_masked: 'Yes' | 'No';
  safety_refusal: 'Yes' | 'No';
  notes?: string;
  follow_up_question?: string;
  root_cause?: string;
  workflow_action?: any;
  structured_data?: any;
}

export class CopilotOrchestrator {
  async processRequest(request: CopilotRequest): Promise<CopilotResponse> {
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const { issue_text, persona, store_id, sku, test_id } = request;

    // 1. Safety Pre-Screen
    const preCheck = safetyAgent.preScreen(issue_text);

    if (preCheck.isUnsafe) {
      // Direct Refusal Route for Injection or Restricted Access
      const citations = [
        '02_pos_pricing_returns_policy.md#payment-security',
        '05_responsible_ai_policy.md#prompt-injection'
      ];

      const workflowRes = await workflowAgent.evaluateWorkflow({
        traceId,
        category: 'Other or Security',
        priority: 'P1',
        confidence: 0.98,
        issueText: issue_text,
        storeId: store_id,
        sku,
        isSafetyRefusal: true
      });

      return {
        test_id,
        traceId,
        category: 'Other or Security',
        priority: 'P1',
        confidence: 0.98,
        answer: preCheck.refusalAnswer || "I cannot fulfill this request. Company security policy strictly forbids revealing customer card details, payment credentials, or supplier contract pricing. Flagged for Security review [02_pos_pricing_returns_policy.md#payment-security;05_responsible_ai_policy.md#prompt-injection].",
        citations,
        data_used: [],
        escalated: 'Yes',
        escalation_team: 'Security',
        pii_masked: preCheck.piiMasked ? 'Yes' : 'No',
        safety_refusal: 'Yes',
        notes: preCheck.refusalReason || 'Prompt injection or restricted confidential data request detected.',
        followUpQuestion: workflowRes.followUpQuestion,
        workflow_action: workflowRes.mockActionPayload
      };
    }

    // 2. Triage Stage
    const triageRes = triageAgent.triage(preCheck.cleanedText, persona);

    // Merge entities from request with extracted ones
    const effectiveStore = store_id || triageRes.extractedEntities.storeId;
    const effectiveSku = sku || triageRes.extractedEntities.sku;

    // 3. Retrieval Stage
    const retrievalRes = retrievalAgent.retrieve(preCheck.cleanedText, triageRes.category);

    // 4. Data Stage
    const dataRes = await dataAgent.analyze(preCheck.cleanedText, {
      storeId: effectiveStore,
      sku: effectiveSku,
      vendorId: triageRes.extractedEntities.vendorId
    });

    // 5. Workflow & Escalation Stage
    const workflowRes = await workflowAgent.evaluateWorkflow({
      traceId,
      category: triageRes.category,
      priority: triageRes.priority,
      confidence: triageRes.confidence,
      issueText: preCheck.cleanedText,
      storeId: effectiveStore,
      sku: effectiveSku,
      dataDetails: dataRes.structuredDetails
    });

    // 6. Grounded Answer Synthesis (Token Harbor LLM + Grounded fallback)
    const rawAnswer = await generateGroundedAnswer({
      userPrompt: preCheck.cleanedText,
      category: triageRes.category,
      priority: triageRes.priority,
      citations: retrievalRes.citations,
      evidenceText: dataRes.evidenceText,
      rootCause: dataRes.rootCause,
      policySnippets: retrievalRes.snippets.map(s => s.text),
      escalationTeam: workflowRes.escalationTeam,
      approvalRequired: workflowRes.approvalRequired === 'Yes'
    });

    // 7. Safety Post-Screen
    const postCheck = safetyAgent.postScreen(rawAnswer);
    const finalAnswer = postCheck.sanitizedAnswer;

    // Determine final PII masked indicator
    const finalPiiMasked = preCheck.piiMasked || postCheck.piiDetected ? 'Yes' : 'No';

    return {
      test_id,
      traceId,
      category: triageRes.category,
      priority: triageRes.priority,
      confidence: triageRes.confidence,
      answer: finalAnswer,
      citations: retrievalRes.citations,
      data_used: dataRes.dataUsed,
      escalated: workflowRes.escalated,
      escalation_team: workflowRes.escalationTeam,
      pii_masked: finalPiiMasked,
      safety_refusal: 'No',
      notes: triageRes.reasoning,
      followUpQuestion: workflowRes.followUpQuestion,
      root_cause: dataRes.rootCause,
      workflow_action: workflowRes.mockActionPayload,
      structured_data: dataRes.structuredDetails
    };
  }
}

export const copilotOrchestrator = new CopilotOrchestrator();
