"""Reference data (demo JSON) and record enrichment.

Everything the dashboard derives from a record lives here: therapeutic area(s), activity level,
internal/external stakeholder flags, safety hot topics and the data quality score.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime
from functools import lru_cache
from typing import Any, Dict, List

from settings import settings

GENERAL_TA = "Cross-TA (General)"

DROPDOWNS_STATIC = {
    "title": ["PV Insights"],
    "quarter": ["Q1", "Q2", "Q3", "Q4"],
    "activity_type": ["Discussion", "Presentation", "Material"],
    "content": [
        "Safety Views", "RMP & (C)ARMAs", "Other Safety Insights", "Core LMS Material", "LMS Education",
        "Aggreg. Reports", "ICSR/AE/SS/Signal", "Clinical Trials & Other Studies", "External Safety Data",
    ],
    "yes_no": ["Yes", "No"],
    "stakeholder_request": ["Yes", "No", "N/A"],
}


class Reference:
    def __init__(self) -> None:
        self.demo: Dict[str, Any] = json.loads(settings.demo_file.read_text(encoding="utf-8"))
        seed = json.loads(settings.seed_file.read_text(encoding="utf-8"))["records"]
        self.product_ta: Dict[str, str] = self.demo["product_ta"]
        self.stakeholders: Dict[str, dict] = {s["code"]: s for s in self.demo["stakeholders"]}
        self.materials: List[dict] = self.demo["materials"]
        self.materials_by_id = {m["id"]: m for m in self.materials}
        self.topics = [(t["topic"], [re.compile(p, re.IGNORECASE) for p in t["patterns"]])
                       for t in self.demo["safety_topic_taxonomy"]]
        self.quality = self.demo["quality_weights"]
        self.kpi_options = self.demo["kpi_options"]
        self.help_text = self.demo["help_text"]
        self.workflow = self.demo["workflow"]
        # Region -> cluster -> countries hierarchy, built from the data itself
        hierarchy: Dict[str, Dict[str, List[str]]] = {}
        for r in seed:
            if r["region"] and r["cluster"] and r["country"]:
                countries = hierarchy.setdefault(r["region"], {}).setdefault(r["cluster"], [])
                if r["country"] not in countries:
                    countries.append(r["country"])
        for region in hierarchy.values():
            for cluster in region:
                region[cluster].sort()
        self.hierarchy = hierarchy

    # ---- dates ---------------------------------------------------------------------
    def reference_date(self) -> date:
        mode = settings.reference_date.strip().lower()
        if mode == "today":
            return date.today()
        if mode == "demo":
            return date.fromisoformat(self.demo["reference_date"])
        return date.fromisoformat(mode)

    # ---- derived fields --------------------------------------------------------------
    def tas_for(self, products: List[str]) -> List[str]:
        tas = [self.product_ta.get(p, GENERAL_TA) for p in products]
        return list(dict.fromkeys(tas)) or [GENERAL_TA]

    def activity_level(self, rec: dict) -> str:
        for rule in self.demo["activity_level_rules"]:
            w = rule["when"]
            if "region" in w and rec.get("region") not in w["region"]:
                continue
            if "cluster" in w and rec.get("cluster") not in w["cluster"]:
                continue
            if "country_contains" in w and not any(s.lower() in rec.get("country", "").lower() for s in w["country_contains"]):
                continue
            return rule["level"]
        return "Local"

    def stakeholder_type(self, code: str) -> str:
        return self.stakeholders.get(code, {}).get("type", "Internal")

    def topics_for(self, rec: dict) -> List[str]:
        text = f"{rec.get('comments', '')} {rec.get('specific_icsr', '')}"
        return [name for name, pats in self.topics if any(p.search(text) for p in pats)]

    def dropdowns(self) -> Dict[str, Any]:
        years = [str(y) for y in range(2021, max(2026, self.reference_date().year, date.today().year) + 1)]
        return {
            **DROPDOWNS_STATIC,
            "year": years,
            "products": sorted(self.product_ta),
            "tas": sorted(set(self.product_ta.values())),
            "stakeholders": [{"code": s["code"], "name": s["name"], "type": s["type"]} for s in self.demo["stakeholders"]],
            "activity_level": ["Global", "Regional", "Local"],
            "hierarchy": self.hierarchy,
            "kpi": self.kpi_options,
            "topics": [t for t, _ in self.topics],
        }


@lru_cache(maxsize=1)
def ref() -> Reference:
    return Reference()


# ---- quality score ---------------------------------------------------------------------

def _filled(v: Any) -> bool:
    return bool(v) if not isinstance(v, str) else bool(v.strip())


def quality_score(rec: dict) -> Dict[str, Any]:
    """0-100 score + band + tips. Weights come from the demo JSON (quality_weights)."""
    w = ref().quality
    tips: List[str] = []
    req = w["required"]
    missing = [f for f in req if not _filled(rec.get(f))]
    score = w["required_fields"] * (len(req) - len(missing)) / len(req)
    if missing:
        tips.append("Complete the required fields: " + ", ".join(m.replace("_", " ") for m in missing))

    comments = (rec.get("comments") or "").strip()
    detail = 0.0
    if len(comments) >= 150:
        detail += 0.6
    elif len(comments) >= 80:
        detail += 0.4
    elif len(comments) >= 30:
        detail += 0.15
    if re.search(r"\b(maf|medical|regulatory|\bra\b|marketing|sales|hcp|msl|manager|team|colleague|lead|director|ha)\b", comments, re.I):
        detail += 0.2
    else:
        tips.append("Say who was involved in the comments")
    if re.search(r"\b(request|asked|because|to support|due to|in order|impact|so that|to give|for the|prepar|launch)\w*", comments, re.I):
        detail += 0.2
    else:
        tips.append("Say why the interaction happened")
    if len(comments) < 80:
        tips.append("Add more detail to the comments (what was provided)")
    score += w["comment_detail"] * min(detail, 1.0)

    if _filled(rec.get("feedback")):
        score += w["feedback"]
    else:
        tips.append("Add any feedback received or the impact of the interaction")

    kpis = [rec.get("stakeholder_status"), rec.get("follow_up"), rec.get("impact_category")]
    score += w["kpi_fields"] * sum(1 for k in kpis if _filled(k)) / 3
    if not all(_filled(k) for k in kpis):
        tips.append("Fill in the value fields (new/established, follow-up, impact)")

    if rec.get("activity_type") == "Material":
        if rec.get("materials"):
            score += w["material_link"]
        else:
            tips.append("Pick the Local Medical Safety material you shared")
    else:
        score += w["material_link"]

    if "ICSR/AE/SS/Signal" in (rec.get("content") or []):
        if _filled(rec.get("specific_icsr")):
            score += w["icsr_detail"]
        else:
            tips.append("Name the specific ICSR / AE / signal")
    else:
        score += w["icsr_detail"]

    score = round(score)
    bands = w["bands"]
    band = "High" if score >= bands["High"] else "Medium" if score >= bands["Medium"] else "Low"
    return {"score": score, "band": band, "tips": tips}


def enrich(rec: dict) -> dict:
    """Recompute every derived field. Called on seed and on every save."""
    r = ref()
    rec["tas"] = r.tas_for(rec.get("products") or [])
    rec["activity_level"] = r.activity_level(rec)
    types = {r.stakeholder_type(s) for s in rec.get("stakeholders") or []}
    rec["has_internal"] = "Internal" in types
    rec["has_external"] = "External" in types
    rec["topics"] = r.topics_for(rec)
    rec["quality"] = quality_score(rec)
    created = rec.get("created") or ""
    rec["created_date"] = created[:10]
    return rec


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")
