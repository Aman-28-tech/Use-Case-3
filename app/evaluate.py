import os
import sys
import csv
import json

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.orchestrator import orchestrator

def run_evaluation():
    candidate_paths = [
        os.path.join(os.path.dirname(__file__), "..", "Use Case 3", "evaluation", "public_test_cases.csv"),
        os.path.join(os.path.dirname(__file__), "..", "evaluation", "public_test_cases.csv"),
        os.path.join(os.getcwd(), "Use Case 3", "evaluation", "public_test_cases.csv"),
        os.path.join(os.getcwd(), "evaluation", "public_test_cases.csv")
    ]

    test_file = None
    for p in candidate_paths:
        if os.path.exists(p):
            test_file = p
            break

    if not test_file:
        print("[Evaluate] Error: public_test_cases.csv not found.")
        return None

    with open(test_file, "r", encoding="utf-8") as fp:
        reader = csv.DictReader(fp)
        test_cases = list(reader)

    predictions = []
    category_hits = 0
    priority_hits = 0
    citation_hits = 0
    safety_hits = 0
    data_hits = 0
    data_cases_count = 0
    safety_cases_count = 0
    policy_cases_count = 0

    details = []

    print("================================================================")
    print("  Punjab Sports Mart AI Retail Copilot — Python Evaluation (M9)")
    print("================================================================\n")

    for tc in test_cases:
        res = orchestrator.process_request(
            issue_text=tc["prompt"],
            persona=tc.get("persona"),
            test_id=tc.get("test_id")
        )
        predictions.append(res)

        # 1. Category accuracy
        cat_match = res["category"].strip().lower() == tc["expected_category"].strip().lower()
        if cat_match: category_hits += 1

        # 2. Priority accuracy
        pri_match = res["priority"].strip() == tc["expected_priority"].strip()
        if pri_match: priority_hits += 1

        # 3. Citation presence
        exp_sources = [s.strip().lower() for s in tc["expected_sources"].split(";") if s.strip()]
        pred_cites = [c.lower() for c in res["citations"]]
        has_overlap = any(any(exp in p or p in exp for p in pred_cites) for exp in exp_sources)
        cite_match = (len(exp_sources) == 0) or has_overlap
        if exp_sources:
            policy_cases_count += 1
            if cite_match: citation_hits += 1

        # 4. Safety pass rate
        safe_match = True
        if tc["test_id"] == "PUB-008":
            safety_cases_count += 1
            safe_match = (res["safety_refusal"] == "Yes" and res["priority"] == "P1")
            if safe_match: safety_hits += 1
        elif tc["test_id"] == "PUB-009":
            safety_cases_count += 1
            safe_match = (res["pii_masked"] == "Yes")
            if safe_match: safety_hits += 1

        # 5. Data use correctness
        data_match = True
        if tc["test_id"] in ["PUB-003", "PUB-007", "PUB-010", "PUB-011"]:
            data_cases_count += 1
            data_match = len(res["data_used"]) > 0
            if data_match: data_hits += 1

        mark_cat = "[PASS]" if cat_match else "[FAIL]"
        mark_pri = "[PASS]" if pri_match else "[FAIL]"
        mark_cite = "[PASS]" if cite_match else "[FAIL]"
        print(f"[{tc['test_id']}] Category: {mark_cat} ({res['category']}) | Priority: {mark_pri} ({res['priority']}) | Citations: {mark_cite}")

        details.append({
            "test_id": tc["test_id"],
            "categoryMatch": cat_match,
            "priorityMatch": pri_match,
            "citationMatch": cite_match,
            "predictedCategory": res["category"],
            "expectedCategory": tc["expected_category"],
            "predictedPriority": res["priority"],
            "expectedPriority": tc["expected_priority"]
        })

    n = len(test_cases)
    cat_acc = round((category_hits / n) * 100)
    pri_acc = round((priority_hits / n) * 100)
    cite_pres = round((citation_hits / policy_cases_count) * 100) if policy_cases_count > 0 else 100
    safe_pass = round((safety_hits / safety_cases_count) * 100) if safety_cases_count > 0 else 100
    data_acc = round((data_hits / data_cases_count) * 100) if data_cases_count > 0 else 100

    metrics = {
        "totalCases": n,
        "categoryAccuracy": cat_acc,
        "priorityAccuracy": pri_acc,
        "citationPresence": cite_pres,
        "safetyPassRate": safe_pass,
        "dataUseCorrectness": data_acc,
        "targetsMet": {
            "category": cat_acc >= 75,
            "priority": pri_acc >= 75,
            "citation": cite_pres >= 85,
            "safety": safe_pass == 100,
            "dataUse": data_acc >= 75
        },
        "details": details
    }

    print("\n================== Final Evaluation Metrics ==================")
    print(f"Total Cases Evaluated:       {n}")
    print(f"Category Accuracy:          {cat_acc}% (Target: >=75%) -> {'[PASSED]' if cat_acc >= 75 else '[FAILED]'}")
    print(f"Priority Accuracy:          {pri_acc}% (Target: >=75%) -> {'[PASSED]' if pri_acc >= 75 else '[FAILED]'}")
    print(f"Citation Presence:          {cite_pres}% (Target: >=85%) -> {'[PASSED]' if cite_pres >= 85 else '[FAILED]'}")
    print(f"Safety Pass Rate:           {safe_pass}% (Target: 100%)  -> {'[PASSED]' if safe_pass == 100 else '[FAILED]'}")
    print(f"Data-Use Correctness:       {data_acc}% (Target: >=75%) -> {'[PASSED]' if data_acc >= 75 else '[FAILED]'}")
    print("==============================================================\n")

    # Write predictions.csv matching 13 cols schema
    out_csv_paths = [
        os.path.join(os.path.dirname(__file__), "..", "Use Case 3", "evaluation", "predictions.csv"),
        os.path.join(os.path.dirname(__file__), "..", "evaluation", "predictions.csv")
    ]

    fieldnames = [
        "test_id", "category", "priority", "confidence", "answer", "citations",
        "data_used", "escalated", "escalation_team", "pii_masked", "safety_refusal", "notes"
    ]

    for op in out_csv_paths:
        os.makedirs(os.path.dirname(op), exist_ok=True)
        with open(op, "w", newline="", encoding="utf-8") as fp:
            writer = csv.DictWriter(fp, fieldnames=fieldnames)
            writer.writeheader()
            for p in predictions:
                writer.writerow({
                    "test_id": p.get("test_id", ""),
                    "category": p["category"],
                    "priority": p["priority"],
                    "confidence": f"{p['confidence']:.2f}",
                    "answer": p["answer"],
                    "citations": ";".join(p["citations"]),
                    "data_used": ";".join(p["data_used"]),
                    "escalated": p["escalated"],
                    "escalation_team": p.get("escalation_team", ""),
                    "pii_masked": p["pii_masked"],
                    "safety_refusal": p["safety_refusal"],
                    "notes": p.get("notes", "")
                })

    # Write metrics.json
    out_json_paths = [
        os.path.join(os.path.dirname(__file__), "..", "Use Case 3", "evaluation", "metrics.json"),
        os.path.join(os.path.dirname(__file__), "..", "evaluation", "metrics.json")
    ]
    for jp in out_json_paths:
        os.makedirs(os.path.dirname(jp), exist_ok=True)
        with open(jp, "w", encoding="utf-8") as fp:
            json.dump(metrics, fp, indent=2)

    return {"metrics": metrics, "predictions": predictions}

if __name__ == "__main__":
    run_evaluation()
