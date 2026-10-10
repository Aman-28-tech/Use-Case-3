import os
import sys
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import time
import random

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.orchestrator import orchestrator
from app.data_engine import data_engine
from app.workflow import workflow_agent
from app.evaluate import run_evaluation

app = FastAPI(
    title="Punjab Sports Mart — Retail Operations Copilot API",
    version="1.0.0",
    description="FastAPI service for local RAG triage, pandas analytics, and workflow escalation per architecture.md"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    trace_id = f"err_{int(time.time())}_{random.randint(100, 999)}"
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "type": "https://tools.ietf.org/html/rfc7807",
            "title": "API Request Error",
            "status": exc.status_code,
            "detail": exc.detail,
            "instance": str(request.url.path),
            "traceId": trace_id
        }
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    trace_id = f"err_{int(time.time())}_{random.randint(100, 999)}"
    return JSONResponse(
        status_code=500,
        content={
            "type": "https://tools.ietf.org/html/rfc7807",
            "title": "Internal Server Error",
            "status": 500,
            "detail": str(exc),
            "instance": str(request.url.path),
            "traceId": trace_id
        }
    )

class TriageRequest(BaseModel):
    issue_text: str
    persona: Optional[str] = None
    store_id: Optional[str] = None
    sku: Optional[str] = None
    test_id: Optional[str] = None

class AnalyticsRequest(BaseModel):
    question: str
    store_id: Optional[str] = None
    sku: Optional[str] = None

class ActionStatusRequest(BaseModel):
    id: int
    status: str

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "Punjab Sports Mart AI Operations Copilot (FastAPI)",
        "timestamp": "2026-10-10 12:00:00 IST",
        "stack": "FastAPI + pandas + TF-IDF RAG (Python 3.14)",
        "architecture_reference": "architecture.md"
    }

@app.post("/api/v1/triage")
def triage_issue(req: TriageRequest):
    try:
        res = orchestrator.process_request(
            issue_text=req.issue_text,
            persona=req.persona,
            store_id=req.store_id,
            sku=req.sku,
            test_id=req.test_id
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/analytics")
def analytics_query(req: AnalyticsRequest):
    try:
        res = orchestrator.process_request(
            issue_text=req.question,
            persona="Regional Manager",
            store_id=req.store_id,
            sku=req.sku
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/eval/run")
def trigger_evaluation():
    try:
        results = run_evaluation()
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/stats/dashboard")
def dashboard_stats():
    return data_engine.get_dashboard_stats()

@app.get("/api/v1/stats/open")
def stats_open():
    st = data_engine.get_dashboard_stats()
    return {"openCases": st["openCases"], "totalCases": st["totalCases"]}

@app.get("/api/v1/stats/by-priority")
def stats_by_priority():
    st = data_engine.get_dashboard_stats()
    return {
        "P1": st["p1Count"],
        "P2": st["p2Count"],
        "P3": st["p3Count"],
        "P4": st["p4Count"]
    }

@app.get("/api/v1/stats/by-category")
def stats_by_category():
    st = data_engine.get_dashboard_stats()
    return {"byCategory": st["byCategory"]}

@app.get("/api/v1/stats/by-region")
def stats_by_region():
    st = data_engine.get_dashboard_stats()
    return {"byRegion": st["byRegion"]}

@app.get("/api/v1/kb/docs")
def list_kb_docs():
    from app.retrieval import retrieval_agent
    doc_map = {
        "01_retail_operations_sop.md": {"source_id": "RETAIL-SOP-01", "title": "Retail Operations SOP", "category": "Priority & Escalation Rules"},
        "02_pos_pricing_returns_policy.md": {"source_id": "POS-PRICE-RETURNS-02", "title": "POS, Pricing & Returns Policy", "category": "POS, Pricing, Returns"},
        "03_inventory_replenishment_policy.md": {"source_id": "INV-REPLEN-03", "title": "Inventory & Replenishment Policy", "category": "Stock & Replenishment"},
        "04_vendor_quality_policy.md": {"source_id": "VENDOR-QUALITY-04", "title": "Vendor & Quality Policy", "category": "Vendor & Quality"},
        "05_responsible_ai_policy.md": {"source_id": "RAI-05", "title": "Responsible AI Policy", "category": "Safety & Compliance"}
    }
    docs = []
    for fname, meta in doc_map.items():
        sections = [s["citation"] for s in retrieval_agent.sections if s["file_name"] == fname]
        docs.append({
            "file": fname,
            "source_id": meta["source_id"],
            "title": meta["title"],
            "category": meta["category"],
            "sections_indexed": len(sections),
            "citations": sections
        })
    return {"total_documents": len(docs), "total_sections": len(retrieval_agent.sections), "documents": docs}

class ActionPayload(BaseModel):
    action_type: Optional[str] = "ticket"
    store_id: Optional[str] = None
    sku: Optional[str] = None
    priority: Optional[str] = "P3"
    team: Optional[str] = "POS Support"
    details: Optional[Dict[str, Any]] = None

@app.post("/api/v1/actions/ticket")
def action_ticket(req: ActionPayload):
    import time
    trace_id = f"act_{int(time.time())}"
    wf = workflow_agent.evaluate(
        trace_id=trace_id,
        category="POS and Payments",
        priority=req.priority or "P3",
        confidence=0.90,
        issue_text="Manual ticket submission",
        store_id=req.store_id,
        sku=req.sku,
        details=req.details
    )
    return {"status": "created", "outbox_action": wf["payload"], "trace_id": trace_id}

@app.post("/api/v1/actions/notify")
def action_notify(req: ActionPayload):
    import time
    trace_id = f"notif_{int(time.time())}"
    return {
        "status": "notified",
        "channel": "slack/email_alert",
        "target_team": req.team or "Store Manager",
        "trace_id": trace_id
    }

@app.post("/api/v1/actions/vendor-claim")
def action_vendor_claim(req: ActionPayload):
    import time
    trace_id = f"claim_{int(time.time())}"
    wf = workflow_agent.evaluate(
        trace_id=trace_id,
        category="Inventory and Replenishment",
        priority="P2",
        confidence=0.92,
        issue_text="Manual vendor claim submission",
        store_id=req.store_id or "ST002",
        sku=req.sku or "SKU1001",
        details=req.details
    )
    return {"status": "claim_drafted", "outbox_action": wf["payload"], "trace_id": trace_id}

@app.post("/api/v1/actions/escalate")
def action_escalate(req: ActionPayload):
    import time
    trace_id = f"esc_{int(time.time())}"
    wf = workflow_agent.evaluate(
        trace_id=trace_id,
        category="Other or Security",
        priority="P1",
        confidence=0.95,
        issue_text="Manual emergency escalation",
        store_id=req.store_id,
        sku=req.sku,
        details=req.details
    )
    return {"status": "escalated", "team": wf["escalation_team"], "sla_minutes": wf["sla_minutes"], "trace_id": trace_id}

@app.get("/api/v1/actions/outbox")
def list_outbox():
    return {"outbox": workflow_agent.list_outbox()}

@app.post("/api/v1/actions/approve")
def update_action_status(req: ActionStatusRequest):
    success = workflow_agent.update_status(req.id, req.status)
    return {"success": success, "id": req.id, "status": req.status}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
