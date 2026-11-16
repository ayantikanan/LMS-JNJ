"""Filtering, access scope and every aggregate the dashboard shows."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, timedelta
from urllib.parse import quote
from typing import Any, Dict, Iterable, List, Optional

from reference import ref

# filter key -> record field. List-valued fields match on any overlap.
FILTER_FIELDS = {
    "year": "year", "quarter": "quarter", "region": "region", "cluster": "cluster", "country": "country",
    "products": "products", "ta": "tas", "title": "title", "activity_level": "activity_level",
    "stakeholder_request": "stakeholder_request", "material_external": "material_external",
    "product_launch": "product_launch", "activity_type": "activity_type", "content": "content",
    "stakeholders": "stakeholders", "topic": "topics", "impact_category": "impact_category",
    "stakeholder_status": "stakeholder_status", "follow_up": "follow_up", "quality_band": "quality.band",
    "stakeholder_type": "_stakeholder_type",
}

Filters = Dict[str, List[str]]


def parse_filters(params: Dict[str, Any]) -> Filters:
    out: Filters = {}
    for key in list(FILTER_FIELDS) + ["q"]:
        raw = params.get(key)
        if raw is None or raw == "":
            continue
        values = raw if isinstance(raw, list) else str(raw).split("|")
        values = [v for v in (str(x).strip() for x in values) if v]
        if values:
            out[key] = values
    return out


def _value(rec: dict, field: str) -> Any:
    if field == "_stakeholder_type":
        return [t for t, flag in (("Internal", rec.get("has_internal")), ("External", rec.get("has_external"))) if flag]
    if "." in field:
        a, b = field.split(".", 1)
        return (rec.get(a) or {}).get(b)
    return rec.get(field)


def matches(rec: dict, f: Filters) -> bool:
    for key, wanted in f.items():
        if key == "q":
            text = " ".join(str(rec.get(k, "")) for k in ("comments", "feedback", "specific_icsr", "country")).lower()
            text += " " + " ".join(rec.get("products", [])).lower()
            if not all(w.lower() in text for w in wanted):
                return False
            continue
        v = _value(rec, FILTER_FIELDS[key])
        values = v if isinstance(v, list) else [v]
        if not set(map(str, values)) & set(wanted):
            return False
    return True


def apply(records: Iterable[dict], f: Filters) -> List[dict]:
    return [r for r in records if matches(r, f)]


# ---- access scope -------------------------------------------------------------------------

def in_scope(user: dict, rec: dict) -> bool:
    level = user.get("scope_level", "Local")
    if user.get("is_admin") or level == "Global":
        return True
    if level == "Regional":
        if user.get("clusters"):
            return rec.get("cluster") in user["clusters"]
        return rec.get("region") in (user.get("regions") or [])
    return rec.get("country") in (user.get("countries") or [])


def visible(user: dict, records: Iterable[dict]) -> List[dict]:
    return [r for r in records if in_scope(user, r)]


def can_edit(user: dict, rec: dict) -> bool:
    mode = user.get("can_edit", "own_records")
    if user.get("is_admin") or mode == "all":
        return True
    if rec.get("owner") == user["id"]:
        return True
    return mode == "own_scope" and in_scope(user, rec)


def default_filters(user: dict) -> Filters:
    f: Filters = {}
    if user.get("tas"):
        f["ta"] = list(user["tas"])
    if user.get("products"):
        f["products"] = list(user["products"])
    return f


# ---- dashboard aggregates -----------------------------------------------------------------------

def _pct(n: int, d: int) -> float:
    return round(100.0 * n / d, 1) if d else 0.0


def period_key(rec: dict) -> str:
    return f"{rec.get('year', '')} - {rec.get('quarter', '')}"


def _sorted_periods(periods: Iterable[str]) -> List[str]:
    return sorted(set(periods), key=lambda p: (p.split(" - ")[0], p.split(" - ")[-1]))


def dashboard(records: List[dict], f: Filters) -> Dict[str, Any]:
    n = len(records)
    at = Counter(r.get("activity_type", "") for r in records)
    activity_types = ["Discussion", "Material", "Presentation"]

    # evolution: per year/quarter
    per_period = Counter(period_key(r) for r in records if r.get("year"))
    periods = _sorted_periods(per_period)
    years = sorted({r["year"] for r in records if r.get("year")})
    evolution = {
        "periods": periods,
        "counts": [per_period[p] for p in periods],
        "years": years,
        "by_year": [sum(1 for r in records if r.get("year") == y) for y in years],
        "by_period_activity": {a: [sum(1 for r in records if period_key(r) == p and r.get("activity_type") == a) for p in periods]
                               for a in activity_types},
    }

    # content per activity type (% of all records, like the current dashboard)
    content_counts: Dict[str, Counter] = defaultdict(Counter)
    for r in records:
        for c in r.get("content") or []:
            content_counts[c][r.get("activity_type", "")] += 1
    content_rows = sorted(content_counts.items(), key=lambda kv: -sum(kv[1].values()))
    content = {
        "categories": [c for c, _ in content_rows],
        "series": {a: [cnt[a] for _, cnt in content_rows] for a in activity_types},
        "pct": {a: [_pct(cnt[a], n) for _, cnt in content_rows] for a in activity_types},
        "total_pct": [_pct(sum(cnt.values()), n) for _, cnt in content_rows],
    }

    # focused product per activity type (top 12)
    prod_counts: Dict[str, Counter] = defaultdict(Counter)
    for r in records:
        for p in r.get("products") or []:
            prod_counts[p][r.get("activity_type", "")] += 1
    prod_rows = sorted(prod_counts.items(), key=lambda kv: -sum(kv[1].values()))[:12]
    products = {
        "categories": [p for p, _ in prod_rows],
        "series": {a: [cnt[a] for _, cnt in prod_rows] for a in activity_types},
    }

    # stakeholder split: % of records involving each function
    sh = Counter(s for r in records for s in r.get("stakeholders") or [])
    stakeholders = [
        {"code": code, "name": ref().stakeholders.get(code, {}).get("name", code), "type": ref().stakeholder_type(code),
         "count": cnt, "pct": _pct(cnt, n)}
        for code, cnt in sh.most_common()
    ]

    def split(field: str, values: List[str]) -> List[Dict[str, Any]]:
        c = Counter(r.get(field, "") for r in records)
        return [{"value": v, "count": c[v], "pct": _pct(c[v], n)} for v in values]

    # geography drill: region -> cluster -> country depending on the filter depth
    regions = {r.get("region") for r in records}
    clusters = {r.get("cluster") for r in records}
    if (f.get("cluster") and len(f["cluster"]) == 1) or len(clusters) == 1:
        geo_level, geo_field = "country", "country"
    elif (f.get("region") and len(f["region"]) == 1) or len(regions) == 1:
        geo_level, geo_field = "cluster", "cluster"
    else:
        geo_level, geo_field = "region", "region"
    geo_counts = Counter(r.get(geo_field, "") for r in records)
    geo_items = [k for k, _ in geo_counts.most_common()]
    geo = {
        "level": geo_level,
        "items": [{"name": k, "count": geo_counts[k]} for k in geo_items],
        "periods": periods,
        "series": {k: [sum(1 for r in records if r.get(geo_field) == k and period_key(r) == p) for p in periods]
                   for k in geo_items[:8]},
    }

    ta = Counter(t for r in records for t in r.get("tas") or [])
    impact = Counter(r.get("impact_category") or "Not set" for r in records)
    quality_bands = Counter((r.get("quality") or {}).get("band", "Low") for r in records)
    level = Counter(r.get("activity_level", "") for r in records)
    scores = [(r.get("quality") or {}).get("score", 0) for r in records]

    tiles = {
        "total": n,
        "discussion": at.get("Discussion", 0),
        "presentation": at.get("Presentation", 0),
        "material": at.get("Material", 0),
        "training": sum(1 for r in records if r.get("title") == "Training & Education") or None,
        "internal_pct": _pct(sum(1 for r in records if r.get("has_internal")), n),
        "external_pct": _pct(sum(1 for r in records if r.get("has_external")), n),
        "avg_quality": round(sum(scores) / len(scores)) if scores else 0,
        "follow_up_pct": _pct(sum(1 for r in records if r.get("follow_up") == "Yes"), n),
        "new_stakeholder_pct": _pct(sum(1 for r in records if r.get("stakeholder_status") == "New"), n),
        "stakeholder_requests": sum(1 for r in records if r.get("stakeholder_request") == "Yes"),
    }

    return {
        "tiles": tiles,
        "evolution": evolution,
        "activity_type": [{"name": a, "count": at.get(a, 0), "pct": _pct(at.get(a, 0), n)} for a in activity_types],
        "content": content,
        "products": products,
        "stakeholders": stakeholders,
        "additional": {
            "product_launch": split("product_launch", ["Yes", "No"]),
            "material_external": split("material_external", ["Yes", "No"]),
            "stakeholder_request": split("stakeholder_request", ["Yes", "No", "N/A"]),
        },
        "geo": geo,
        "ta": [{"name": k, "count": v} for k, v in ta.most_common()],
        "activity_level": [{"name": k, "count": v} for k, v in level.most_common()],
        "impact": [{"name": k, "count": v} for k, v in impact.most_common()],
        "quality_bands": [{"name": b, "count": quality_bands.get(b, 0)} for b in ("High", "Medium", "Low")],
        "outcomes": [{"name": o, "count": sum(1 for r in records if o in (r.get("outcomes") or []))}
                     for o in ref().kpi_options["outcomes"]],
    }


# ---- hot topics ---------------------------------------------------------------------------------

def hot_topics(records: List[dict], others: Optional[List[dict]] = None, limit: int = 15) -> Dict[str, Any]:
    counts = Counter(t for r in records for t in r.get("topics") or [])
    top = [t for t, _ in counts.most_common(limit)]
    per_period = defaultdict(Counter)
    for r in records:
        for t in r.get("topics") or []:
            per_period[t][period_key(r)] += 1
    periods = _sorted_periods(period_key(r) for r in records if r.get("year"))
    by_product: Dict[str, Counter] = defaultdict(Counter)
    for r in records:
        for t in r.get("topics") or []:
            for p in r.get("products") or []:
                by_product[t][p] += 1
    examples = {}
    for t in top:
        ex = [r for r in sorted(records, key=lambda r: r.get("created", ""), reverse=True) if t in (r.get("topics") or [])][:3]
        examples[t] = [{"id": r["id"], "country": r.get("country"), "products": r.get("products"),
                        "period": period_key(r), "text": (r.get("comments") or "")[:220]} for r in ex]
    result = {
        "topics": [{"name": t, "count": counts[t], "products": [p for p, _ in by_product[t].most_common(3)],
                    "countries": len({r.get("country") for r in records if t in (r.get("topics") or [])})}
                   for t in top],
        "trend": {"periods": periods, "series": {t: [per_period[t][p] for p in periods] for t in top[:6]}},
        "examples": examples,
        "untagged": sum(1 for r in records if not r.get("topics")),
    }
    if others is not None:
        oc = Counter(t for r in others for t in r.get("topics") or [])
        result["elsewhere"] = [{"name": t, "count": c,
                                "countries": len({r.get("country") for r in others if t in (r.get("topics") or [])})}
                               for t, c in oc.most_common(10)]
    return result


# ---- stakeholder pages -------------------------------------------------------------------------

def _days_since(iso_day: str, today: date) -> Optional[int]:
    if not iso_day:
        return None
    return max(0, (today - date.fromisoformat(iso_day[:10])).days)


def stakeholder_overview(records: List[dict]) -> List[Dict[str, Any]]:
    today = ref().reference_date()
    out = []
    for code, meta in ref().stakeholders.items():
        recs = [r for r in records if code in (r.get("stakeholders") or [])]
        if not recs:
            continue
        last = max(r.get("created_date", "") for r in recs)
        days = _days_since(last, today)
        out.append({
            "code": code, "name": meta["name"], "type": meta["type"], "count": len(recs),
            "last_interaction": last, "days_since": days, "gap_alert_days": meta["gap_alert_days"],
            "overdue": days is not None and days > meta["gap_alert_days"],
            "top_products": [p for p, _ in Counter(p for r in recs for p in r.get("products") or []).most_common(3)],
            "top_topics": [t for t, _ in Counter(t for r in recs for t in r.get("topics") or []).most_common(3)],
            "follow_ups": sum(1 for r in recs if r.get("follow_up") == "Yes"),
        })
    return sorted(out, key=lambda s: -s["count"])


def stakeholder_detail(code: str, records: List[dict], requests: List[dict]) -> Optional[Dict[str, Any]]:
    meta = ref().stakeholders.get(code)
    if not meta:
        return None
    recs = sorted([r for r in records if code in (r.get("stakeholders") or [])],
                  key=lambda r: r.get("created", ""), reverse=True)
    summary = next((s for s in stakeholder_overview(records) if s["code"] == code), None)
    mats = Counter(m for r in recs for m in r.get("materials") or [])
    return {
        **meta,
        "summary": summary,
        "recent": [record_brief(r) for r in recs[:25]],
        "materials": [{**ref().materials_by_id[m], "times_used": c} for m, c in mats.most_common() if m in ref().materials_by_id],
        "topics": [{"name": t, "count": c} for t, c in Counter(t for r in recs for t in r.get("topics") or []).most_common(10)],
        "follow_ups": [record_brief(r) for r in recs if r.get("follow_up") == "Yes"][:10],
        "requests": [q for q in requests if code in (q.get("stakeholders") or []) and q.get("stage") != "resolved"],
        "by_period": dict(Counter(period_key(r) for r in recs)),
    }


def record_brief(r: dict) -> Dict[str, Any]:
    return {k: r.get(k) for k in ("id", "year", "quarter", "country", "activity_type", "products", "stakeholders",
                                  "content", "comments", "follow_up", "impact_category", "created_date", "quality")}


# ---- materials ------------------------------------------------------------------------------------

def materials_for(user: dict, records: List[dict]) -> List[Dict[str, Any]]:
    r = ref()
    today = r.reference_date()
    window = timedelta(days=r.demo.get("new_material_window_days", 45))
    usage = Counter(m for rec in records for m in rec.get("materials") or [])
    tas, products = set(user.get("tas") or []), set(user.get("products") or [])
    out = []
    for m in r.materials:
        added = date.fromisoformat(m["date_added"])
        is_new = today - window <= added <= today
        relevant = (not tas and not products) or bool(set(m["ta"]) & tas) or bool(set(m["products"]) & products)
        score = (3 if relevant else 0) + (2 if is_new else 0) + min(usage[m["id"]], 5) * 0.3
        out.append({**{k: v for k, v in m.items() if k != "keywords"}, "is_new": is_new, "relevant": relevant,
                    "times_used": usage[m["id"]], "score": round(score, 2)})
    return sorted(out, key=lambda m: (-m["score"], m["title"]))


def recommend_materials(products: List[str], content: List[str], limit: int = 5) -> List[Dict[str, Any]]:
    """Suggestions on the data entry form: same product first, then same content type, newest first."""
    r = ref()
    prods, cont = set(products or []), set(content or [])
    scored = []
    for m in r.materials:
        s = 2 * len(prods & set(m["products"])) + (1 if m["content_type"] in cont else 0)
        if prods and not prods & set(m["products"]):
            continue
        scored.append((s, m["date_added"], m))
    scored.sort(key=lambda t: (-t[0], -int(t[1].replace("-", ""))))
    return [{k: v for k, v in m.items() if k != "keywords"} for _, _, m in scored[:limit]]


# ---- notifications ----------------------------------------------------------------------------------

def notifications(user: dict, records_visible: List[dict], requests: List[dict]) -> List[Dict[str, Any]]:
    r = ref()
    today = r.reference_date()
    mine = apply(records_visible, default_filters(user)) or records_visible
    out: List[Dict[str, Any]] = []

    gaps = [s for s in stakeholder_overview(mine) if s["overdue"] and s["count"] >= 2 and s["gap_alert_days"] <= 180]
    for s in gaps[:3]:  # the three functions you work with most
        months = round(s["days_since"] / 30)
        suggestion = f"share the latest {s['top_topics'][0].split(' (')[0]}" if s["top_topics"] else "plan a check-in"
        out.append({
            "id": f"gap:{s['code']}", "kind": "stakeholder_gap", "severity": "medium",
            "title": f"It's been {months} months since you connected with {s['code']}",
            "body": f"Last interaction with {s['name']} was on {s['last_interaction']}. Suggested next interaction: {suggestion}"
                    + (f" on {s['top_products'][0]}." if s["top_products"] else "."),
            "action": {"label": "Open stakeholder page", "href": f"/stakeholders?code={quote(s['code'])}"},
        })

    new_mats = sorted([m for m in materials_for(user, records_visible) if m["is_new"] and m["relevant"]],
                      key=lambda m: m["date_added"], reverse=True)
    if len(new_mats) > 3:
        out.append({
            "id": f"materials:{len(new_mats)}", "kind": "new_material", "severity": "info",
            "title": f"{len(new_mats) - 3} more new Local Medical Safety materials for your products",
            "body": "See everything added in the last weeks on the materials page.",
            "action": {"label": "View materials", "href": "/materials"},
        })
    for m in new_mats[:3]:
        out.append({
            "id": f"material:{m['id']}", "kind": "new_material", "severity": "info",
            "title": f"New material on {', '.join(m['products'][:2])} available",
            "body": f"\"{m['title']}\" was added to the LMS materials list on {m['date_added']}.",
            "action": {"label": "View materials", "href": "/materials"},
        })

    stages = {s["id"]: s for s in r.workflow["stages"]}
    order = [s["id"] for s in r.workflow["stages"]]
    waiting = []
    tas = set(user.get("tas") or [])
    for q in requests:
        if tas and q.get("ta") not in tas:
            continue
        if q["stage"] == "resolved":
            continue
        last = q["events"][-1]["at"][:10] if q.get("events") else ""
        days = _days_since(last, today) or 0
        nxt = order[order.index(q["stage"]) + 1]
        if days > stages[nxt]["sla_days"]:
            waiting.append((days, q, nxt))
    waiting.sort(key=lambda t: t[0])  # most recently stalled first: those are the ones still actionable
    for days, q, nxt in waiting[:3]:
        out.append({
            "id": f"request:{q['id']}:{q['stage']}", "kind": "workflow", "severity": "high",
            "title": f"Benefit-Risk request {q['id']} is waiting ({stages[q['stage']]['label']})",
            "body": f"{q['title'][:90]} - no update for {days} days. Next step: {stages[nxt]['label']}.",
            "action": {"label": "Open request", "href": f"/requests?id={q['id']}"},
        })
    if len(waiting) > 3:
        out.append({
            "id": f"requests:{len(waiting)}", "kind": "workflow", "severity": "medium",
            "title": f"{len(waiting) - 3} more Benefit-Risk requests are past their target date",
            "body": "Open the requests board to escalate, follow up or confirm resolution.",
            "action": {"label": "Open requests", "href": "/requests"},
        })

    low = [rec for rec in mine if (rec.get("quality") or {}).get("band") == "Low"]
    if low:
        out.append({
            "id": f"quality:{len(low)}", "kind": "quality", "severity": "info",
            "title": f"{len(low)} records in your view have a low data quality score",
            "body": "Adding feedback and the value fields raises the score and makes the insights more useful.",
            "action": {"label": "Review records", "href": "/records?quality_band=Low"},
        })
    rank = {"high": 0, "medium": 1, "info": 2}
    return sorted(out, key=lambda n: rank.get(n["severity"], 3))
