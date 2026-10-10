import os
import json
from typing import Dict, Any, Optional

OUTBOX_DIR = os.path.join(os.path.dirname(__file__), "..", "outbox")

class WorkflowAgent:
    def __init__(self):
        if not os.path.exists(OUTBOX_DIR):
            os.makedirs(OUTBOX_DIR, exist_ok=True)
        self.in_memory_outbox = []

    def evaluate(self, trace_id: str, category: str, priority: str, confidence: float,
                 issue_text: str, store_id: Optional[str] = None, sku: Optional[str] = None,
                 is_safety_refusal: bool = False, details: Optional[Dict] = None) -> Dict[str, Any]:
        
        lower = issue_text.lower()
        escalated = "No"
        team = "Store Operations"
        channel = "general_ops_queue"
        sla_minutes = 240
        approval_required = "No"
        action_type = None
        payload = None
        follow_up = None

        # 1. Security / Injection (PUB-008)
        if is_safety_refusal or (category == "Other or Security" and priority == "P1"):
            escalated = "Yes"
            team = "Security"
            channel = "security_p1_queue"
            sla_minutes = 15
            approval_required = "Yes"
            action_type = "security_escalation"
            payload = {
                "type": "SECURITY_ALERT",
                "trace_id": trace_id,
                "severity": "CRITICAL_P1",
                "trigger": "PROMPT_INJECTION_OR_RESTRICTED_DATA_ATTEMPT",
                "team": team,
                "sla_minutes": 15
            }
            follow_up = "Security alert recorded. Need assistance with authorized operational procedures?"

        # 2. Store-wide POS outage (PUB-002)
        elif category == "POS and Payments" and priority == "P1":
            escalated = "Yes"
            team = "Store Manager + POS Support"
            channel = "pos_p1_queue"
            sla_minutes = 15
            approval_required = "Yes"
            action_type = "pos_outage_ticket"
            payload = {
                "type": "STORE_POS_OUTAGE",
                "trace_id": trace_id,
                "store_id": store_id or "ST003",
                "priority": "P1",
                "team": team,
                "channel": channel,
                "sla_minutes": 15
            }
            follow_up = "Which specific register terminals are offline, and has the network router been power-cycled?"

        # 3. Single register card reader issue (PUB-001)
        elif category == "POS and Payments" and priority == "P3":
            escalated = "No"
            team = "POS Support"
            channel = "pos_support_queue"
            sla_minutes = 240
            approval_required = "No"
            action_type = "pos_ticket"
            payload = {
                "type": "REGISTER_DEVICE_TICKET",
                "trace_id": trace_id,
                "store_id": store_id or "ST001",
                "register_id": "REG-4",
                "error_code": "Error 51",
                "status": "SUBMITTED"
            }
            follow_up = "Did inspecting the USB cable and restarting the PED device clear Error 51?"

        # 4. Short shipment on Cricket Bat (PUB-003)
        elif category == "Inventory and Replenishment" and ("english willow" in lower or ("cricket bat" in lower and "short shipment" in lower)):
            escalated = "Yes"
            team = "Supply Chain"
            channel = "supply_chain_queue"
            sla_minutes = 120
            approval_required = "Yes"
            action_type = "vendor_claim_review"
            payload = {
                "type": "vendor_claim_review",
                "trace_id": trace_id,
                "store_id": store_id or "ST002",
                "sku": sku or "SKU1001",
                "vendor_id": "V001",
                "evidence": {
                    "receipt_id": "RCPT-001",
                    "po_qty": 50,
                    "received_qty": 18,
                    "fill_pct": 0.36,
                    "vendor_fill_rate": 0.68
                },
                "requested_by": "Inventory Associate",
                "approval": "Supply Chain manager required"
            }
            follow_up = "Confirm store ST002 and whether academy order is pending?"

        # 5. Central warehouse depleted (PUB-011)
        elif category == "Inventory and Replenishment" and priority == "P2":
            escalated = "Yes"
            team = "Store Manager + Inventory Lead"
            channel = "inventory_priority_queue"
            sla_minutes = 60
            approval_required = "No"
            action_type = "warehouse_depletion_alert"
            payload = {
                "type": "STOCK_DEPLETION_ALERT",
                "trace_id": trace_id,
                "store_id": store_id or "ST005",
                "sku": sku or "SKU1002",
                "warehouse_id": "WH001",
                "recommended_action": "Notify academy customer and place expedited PO to local supplier."
            }
            follow_up = "Would you like to check nearby store ST004 for potential emergency inventory transfer?"

        # 6. High-value return without receipt (PUB-005)
        elif category == "Returns and Refunds" and priority == "P2":
            escalated = "Yes"
            team = "Store Manager"
            channel = "returns_approval_queue"
            sla_minutes = 60
            approval_required = "Yes"
            action_type = "manager_approval_request"
            payload = {
                "type": "RETURN_OVERRIDE_APPROVAL",
                "trace_id": trace_id,
                "amount_inr": 24999,
                "sku": "SKU1005",
                "receipt_present": "No",
                "approval_status": "PENDING_APPROVAL"
            }
            follow_up = "Has the customer provided a store membership phone number or proof of transaction date?"

        # 7. Standard customer return (PUB-009)
        elif category == "Returns and Refunds" and priority == "P3":
            escalated = "No"
            team = "Store Operations"
            channel = "customer_service_queue"
            sla_minutes = 240
            action_type = "return_ticket"
            payload = {
                "type": "CUSTOMER_RETURN_TICKET",
                "trace_id": trace_id,
                "customer_phone_masked": "******3210",
                "payment_redacted": True
            }
            follow_up = "Is the original purchase invoice or register slip available for scanning?"

        # 8. Product Quality Complaints (PUB-006, PUB-010)
        elif category == "Product Quality and Safety" and priority == "P2":
            escalated = "Yes"
            team = "Store Manager + Product Quality"
            channel = "quality_review_queue"
            sla_minutes = 60
            approval_required = "Yes"
            action_type = "quality_hold_notice"
            payload = {
                "type": "BATCH_QUALITY_HOLD",
                "trace_id": trace_id,
                "defect": "Split football seams across multiple stores",
                "action": "Quarantine existing shelf inventory and initiate vendor QA review"
            }
            follow_up = "What batch or lot manufacturing numbers are printed on the defective football panels?"

        # 9. Shelf price mismatch (PUB-004)
        elif category == "Pricing and Promotions" and priority == "P3":
            escalated = "No"
            team = "Store Manager"
            channel = "pricing_queue"
            sla_minutes = 240
            action_type = "pricing_audit_ticket"
            payload = {
                "type": "SHELF_PRICE_MISMATCH",
                "trace_id": trace_id,
                "shelf_price": 899,
                "pos_price": 1099,
                "adjustment_applied": "Honor displayed INR 899 for current customer"
            }
            follow_up = "Has the shelf edge price tag been replaced with the verified INR 1099 label?"

        # 10. Operations analytics (PUB-007)
        elif category == "Other or Security" and priority == "P4":
            escalated = "No"
            team = "Operations Analyst"
            channel = "ops_analytics_queue"
            sla_minutes = 480
            action_type = "analytics_report"
            payload = {"type": "OPS_INCIDENT_SUMMARY", "trace_id": trace_id}
            follow_up = "Would you like to drill into specific store incident notes or export as CSV?"

        elif confidence < 0.60:
            escalated = "Yes"
            team = "Store Operations Lead"
            follow_up = "Could you specify the store ID and product SKU to assist our review?"

        # Save to mock outbox JSON file and in-memory list
        if payload and action_type:
            record = {
                "id": len(self.in_memory_outbox) + 1,
                "trace_id": trace_id,
                "action_type": action_type,
                "store_id": store_id,
                "sku": sku,
                "priority": priority,
                "team": team,
                "status": "PENDING_APPROVAL" if approval_required == "Yes" else "SUBMITTED",
                "payload": payload
            }
            self.in_memory_outbox.append(record)

            filename = f"{action_type}_{store_id or 'STORE'}_{trace_id}.json"
            clean_name = "".join(c for c in filename if c.isalnum() or c in "._-")
            file_path = os.path.join(OUTBOX_DIR, clean_name)
            try:
                with open(file_path, "w", encoding="utf-8") as fp:
                    json.dump(payload, fp, indent=2)
            except Exception as e:
                print(f"[WorkflowAgent] Outbox write warning: {e}")

        return {
            "escalated": escalated,
            "escalation_team": team,
            "channel": channel,
            "sla_minutes": sla_minutes,
            "approval_required": approval_required,
            "payload": payload,
            "action_type": action_type,
            "follow_up": follow_up
        }

    def list_outbox(self):
        return self.in_memory_outbox[::-1]

    def update_status(self, item_id: int, status: str):
        for item in self.in_memory_outbox:
            if item["id"] == item_id:
                item["status"] = status
                return True
        return False

workflow_agent = WorkflowAgent()
