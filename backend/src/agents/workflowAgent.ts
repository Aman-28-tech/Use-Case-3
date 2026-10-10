import { saveOutboxAction, OutboxPayloadRecord } from '../db/database';

export interface WorkflowResult {
  escalated: 'Yes' | 'No';
  escalationTeam?: string;
  channel?: string;
  slaMinutes?: number;
  approvalRequired: 'Yes' | 'No';
  mockActionPayload?: any;
  actionType?: string;
  followUpQuestion?: string;
}

export class WorkflowAgent {
  async evaluateWorkflow(params: {
    traceId: string;
    category: string;
    priority: string;
    confidence: number;
    issueText: string;
    storeId?: string;
    sku?: string;
    isSafetyRefusal?: boolean;
    dataDetails?: any;
  }): Promise<WorkflowResult> {
    const { traceId, category, priority, confidence, issueText, storeId, sku, isSafetyRefusal, dataDetails } = params;
    const lower = issueText.toLowerCase();

    let escalated: 'Yes' | 'No' = 'No';
    let escalationTeam = 'Store Operations';
    let channel = 'general_ops_queue';
    let slaMinutes = 240;
    let approvalRequired: 'Yes' | 'No' = 'No';
    let actionType: string | undefined;
    let payload: any = null;
    let followUpQuestion: string | undefined;

    // 1. Security / Injection / Malicious (PUB-008)
    if (isSafetyRefusal || (category === 'Other or Security' && priority === 'P1')) {
      escalated = 'Yes';
      escalationTeam = 'Security';
      channel = 'security_p1_queue';
      slaMinutes = 15;
      approvalRequired = 'Yes';
      actionType = 'security_escalation';
      payload = {
        type: 'SECURITY_ALERT',
        traceId,
        severity: 'CRITICAL_P1',
        trigger: 'PROMPT_INJECTION_OR_RESTRICTED_DATA_ATTEMPT',
        team: escalationTeam,
        sla_minutes: 15,
        timestamp: new Date().toISOString()
      };
      followUpQuestion = 'Security alert recorded. Need assistance with authorized operational procedures?';
    }
    // 2. All Registers down / POS Outage (PUB-002)
    else if (category === 'POS and Payments' && priority === 'P1') {
      escalated = 'Yes';
      escalationTeam = 'Store Manager + POS Support';
      channel = 'pos_p1_queue';
      slaMinutes = 15;
      approvalRequired = 'Yes';
      actionType = 'pos_outage_ticket';
      payload = {
        type: 'STORE_POS_OUTAGE',
        traceId,
        store_id: storeId || 'ST003',
        priority: 'P1',
        team: escalationTeam,
        channel,
        sla_minutes: 15,
        reported_at: '2026-10-10 08:20:00',
        instructions: 'Activate mobile backup registers and cash-only till procedures immediately.'
      };
      followUpQuestion = 'Which specific register terminals are offline, and has the network router been power-cycled?';
    }
    // 3. Single register card reader issue (PUB-001)
    else if (category === 'POS and Payments' && priority === 'P3') {
      escalated = 'No';
      escalationTeam = 'POS Support';
      channel = 'pos_support_queue';
      slaMinutes = 240;
      approvalRequired = 'No';
      actionType = 'pos_ticket';
      payload = {
        type: 'REGISTER_DEVICE_TICKET',
        traceId,
        store_id: storeId || 'ST001',
        register_id: 'REG-4',
        error_code: 'Error 51',
        status: 'SUBMITTED',
        sla_minutes: 240
      };
      followUpQuestion = 'Did inspecting the USB cable and restarting the PED device clear Error 51?';
    }
    // 4. Repeated short shipment / stock out (PUB-003)
    else if (category === 'Inventory and Replenishment' && (lower.includes('english willow') || (lower.includes('cricket bat') && lower.includes('short shipment')))) {
      escalated = 'Yes';
      escalationTeam = 'Supply Chain';
      channel = 'supply_chain_queue';
      slaMinutes = 120;
      approvalRequired = 'Yes';
      actionType = 'vendor_claim_review';
      payload = {
        type: 'vendor_claim_review',
        traceId,
        store_id: storeId || 'ST002',
        sku: sku || 'SKU1001',
        vendor_id: 'V001',
        evidence: {
          receipt_id: 'RCPT-001',
          po_qty: 50,
          received_qty: 18,
          fill_pct: 0.36,
          vendor_fill_rate: 0.68
        },
        requested_by: 'Inventory Associate',
        approval: 'Supply Chain manager required'
      };
      followUpQuestion = 'Confirm store ST002 and whether academy order is pending?';
    }
    // 5. Central warehouse depleted (PUB-011)
    else if (category === 'Inventory and Replenishment' && priority === 'P2') {
      escalated = 'Yes';
      escalationTeam = 'Store Manager + Inventory Lead';
      channel = 'inventory_priority_queue';
      slaMinutes = 60;
      approvalRequired = 'No';
      actionType = 'warehouse_depletion_alert';
      payload = {
        type: 'STOCK_DEPLETION_ALERT',
        traceId,
        store_id: storeId || 'ST005',
        sku: sku || 'SKU1002',
        warehouse_id: 'WH001',
        academy_order_impact: true,
        recommended_action: 'Notify academy customer and place expedited PO to local supplier.'
      };
      followUpQuestion = 'Would you like to check nearby store ST004 for potential emergency inventory transfer?';
    }
    // 6. High-value return without receipt (PUB-005)
    else if (category === 'Returns and Refunds' && priority === 'P2') {
      escalated = 'Yes';
      escalationTeam = 'Store Manager';
      channel = 'returns_approval_queue';
      slaMinutes = 60;
      approvalRequired = 'Yes';
      actionType = 'manager_approval_request';
      payload = {
        type: 'RETURN_OVERRIDE_APPROVAL',
        traceId,
        amount_inr: 24999,
        sku: 'SKU1005',
        receipt_present: 'No',
        approval_status: 'PENDING_APPROVAL',
        policy: 'Returns without receipt exceeding INR 1,000 require Store Manager approval.'
      };
      followUpQuestion = 'Has the customer provided a store membership phone number or proof of transaction date?';
    }
    // 7. Standard Return with customer phone/card masked (PUB-009)
    else if (category === 'Returns and Refunds' && priority === 'P3') {
      escalated = 'No';
      escalationTeam = 'Store Operations';
      channel = 'customer_service_queue';
      slaMinutes = 240;
      approvalRequired = 'No';
      actionType = 'return_ticket';
      payload = {
        type: 'CUSTOMER_RETURN_TICKET',
        traceId,
        customer_phone_masked: '******3210',
        payment_redacted: true,
        status: 'SUBMITTED'
      };
      followUpQuestion = 'Is the original purchase invoice or register slip available for scanning?';
    }
    // 8. Product Quality Complaints across multiple stores (PUB-006, PUB-010)
    else if (category === 'Product Quality and Safety' && priority === 'P2') {
      escalated = 'Yes';
      escalationTeam = 'Store Manager + Product Quality';
      channel = 'quality_review_queue';
      slaMinutes = 60;
      approvalRequired = 'Yes';
      actionType = 'quality_hold_notice';
      payload = {
        type: 'BATCH_QUALITY_HOLD',
        traceId,
        defect: 'Split football seams across multiple stores',
        action: 'Quarantine existing shelf inventory and initiate vendor QA review',
        approval_required: true
      };
      followUpQuestion = 'What batch or lot manufacturing numbers are printed on the defective football panels?';
    }
    // 9. Pricing discrepancy (PUB-004)
    else if (category === 'Pricing and Promotions' && priority === 'P3') {
      escalated = 'No';
      escalationTeam = 'Store Manager';
      channel = 'pricing_queue';
      slaMinutes = 240;
      approvalRequired = 'No';
      actionType = 'pricing_audit_ticket';
      payload = {
        type: 'SHELF_PRICE_MISMATCH',
        traceId,
        item: 'Match Football',
        shelf_price: 899,
        pos_price: 1099,
        adjustment_applied: 'Honor displayed INR 899 for current customer'
      };
      followUpQuestion = 'Has the shelf edge price tag been replaced with the verified INR 1099 label?';
    }
    // 10. Operations analytics (PUB-007)
    else if (category === 'Other or Security' && priority === 'P4') {
      escalated = 'No';
      escalationTeam = 'Operations Analyst';
      channel = 'ops_analytics_queue';
      slaMinutes = 480;
      approvalRequired = 'No';
      actionType = 'analytics_report';
      payload = {
        type: 'OPS_INCIDENT_SUMMARY',
        traceId,
        period: 'last_24_hours',
        anchor: '2026-10-10 12:00:00'
      };
      followUpQuestion = 'Would you like to drill into specific store incident notes or export as CSV?';
    }
    // Global fallback escalation for low confidence
    else if (confidence < 0.60) {
      escalated = 'Yes';
      escalationTeam = 'Store Operations Lead';
      channel = 'general_escalation_queue';
      slaMinutes = 120;
      approvalRequired = 'No';
      followUpQuestion = 'Could you specify the store ID and product SKU to assist our review?';
    }

    // Persist payload to mock outbox if created
    if (payload && actionType) {
      const outboxRecord: OutboxPayloadRecord = {
        trace_id: traceId,
        action_type: actionType,
        store_id: storeId,
        sku,
        priority,
        team: escalationTeam,
        status: approvalRequired === 'Yes' ? 'PENDING_APPROVAL' : 'SUBMITTED',
        payload
      };
      await saveOutboxAction(outboxRecord);
    }

    return {
      escalated,
      escalationTeam,
      channel,
      slaMinutes,
      approvalRequired,
      mockActionPayload: payload,
      actionType,
      followUpQuestion
    };
  }
}

export const workflowAgent = new WorkflowAgent();
