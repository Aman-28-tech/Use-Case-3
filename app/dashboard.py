from app.data_engine import data_engine

class DashboardAggregator:
    """
    Dashboard Aggregator Module (B2)
    Provides operational metrics, priority breakdowns, category distributions,
    and vendor risk alerts per architecture.md Section 2.4 and 3.8.
    """
    def __init__(self):
        self.engine = data_engine

    def get_summary_metrics(self):
        return self.engine.get_dashboard_stats()

    def get_open_incidents(self):
        stats = self.engine.get_dashboard_stats()
        return {"open": stats["openCases"], "total": stats["totalCases"]}

    def get_priority_distribution(self):
        stats = self.engine.get_dashboard_stats()
        return {
            "P1": stats["p1Count"],
            "P2": stats["p2Count"],
            "P3": stats["p3Count"],
            "P4": stats["p4Count"]
        }

    def get_category_distribution(self):
        return self.engine.get_dashboard_stats().get("byCategory", [])

    def get_regional_distribution(self):
        return self.engine.get_dashboard_stats().get("byRegion", [])

    def get_vendor_risk_alerts(self):
        return self.engine.get_dashboard_stats().get("vendorRisks", [])

dashboard_service = DashboardAggregator()
