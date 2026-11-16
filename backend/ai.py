"""Ask AI, AI summaries and data-entry assistance.

Engine chain (same as the current MedPulse code): Gemini -> local Ollama -> rules-based text.
Every answer says which engine produced it. Numbers are always computed in Python from the
filtered records, so they match the dashboard; the model only writes the narrative around them.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

import analytics
from reference import ref
from settings import settings

PRODUCT_ALIASES = {
    "amivantamab": "Rybrevant", "ami": "Rybrevant", "lazcluze": "Lazertinib", "laz": "Lazertinib",
    "apalutamide": "Erleada", "abiraterone": "Zytiga", "teclistamab": "Tecvayli", "talvey": "Talquetamab",
    "darzalex": "Darzalex/ Dalinvi", "daratumumab": "Darzalex/ Dalinvi", "dara": "Darzalex/ Dalinvi",
    "ibrutinib": "Imbruvica", "guselkumab": "Tremfya", "ustekinumab": "Stelara", "esketamine": "Spravato",
    "erdafitinib": "Balversa/ Erfandel", "balversa": "Balversa/ Erfandel", "cilta-cel": "Carvykti", "car-t": "Carvykti",
    "cart": "Carvykti", "imaavy": "Nipocalimab", "golimumab": "Simponi", "macitentan": "Opsumit/ Zependo",
    "opsumit": "Opsumit/ Zependo", "selexipag": "Uptravi", "tracleer": "Bosentan", "canagliflozin": "Invokana",
    "invega": "Xeplion / Invega Sustenna (PP1M)", "xeplion": "Xeplion / Invega Sustenna (PP1M)",
    "trevicta": "Trevicta / Invega Trinza (PP3M)",
}
TA_ALIASES = {"oncology": "Oncology", "onco": "Oncology", "immunology": "Immunology", "neuroscience": "Neuroscience",
              "neurosciences": "Neuroscience", "pah": "Cardiopulmonary (PAH)", "pulmonary": "Cardiopulmonary (PAH)",
              "established products": "Established Products"}
STAKEHOLDER_ALIASES = {"maf": "MAF", "medical affairs": "MAF", "msl": "MAF", "regulatory": "Reg.", "reg.": "Reg.",
                       "marketing": "Marketing", "sales": "Sales", "health authority": "HA", "health authorities": "HA",
                       "hcp": "HCPs", "hcps": "HCPs", "hemar": "HEMAR", "market access": "HEMAR", "mso": "MSO",
                       "cvt": "CVT/IBVT", "compliance": "CQ"}
ACTIVITY_ALIASES = {"discussion": "Discussion", "discussions": "Discussion", "presentation": "Presentation",
                    "presentations": "Presentation", "material": "Material", "materials": "Material"}


# ---- engines ----------------------------------------------------------------------------------

_last_error: Dict[str, str] = {}


def _gemini(system: str, prompt: str, json_mode: bool = False) -> Optional[str]:
    if not settings.google_api_key:
        _last_error["gemini"] = "No GOOGLE_API_KEY / GEMINI_API_KEY set"
        return None
    try:
        from google import genai  # type: ignore
        from google.genai import types  # type: ignore
        # vertexai=False: use the Gemini API key directly even if GOOGLE_GENAI_USE_VERTEXAI is set in the env
        client = genai.Client(api_key=settings.google_api_key, vertexai=False)
        cfg = dict(system_instruction=system, temperature=0.2)
        if json_mode:
            cfg["response_mime_type"] = "application/json"
        resp = client.models.generate_content(model=settings.gemini_model, contents=prompt,
                                              config=types.GenerateContentConfig(**cfg))
        _last_error.pop("gemini", None)
        return (resp.text or "").strip() or None
    except Exception as e:  # invalid key, no quota, package missing, network...
        _last_error["gemini"] = f"{type(e).__name__}: {str(e)[:200]}"
        return None


def _ollama(system: str, prompt: str, json_mode: bool = False) -> Optional[str]:
    if not settings.ollama_enabled:
        _last_error["ollama"] = "Disabled (OLLAMA_FALLBACK_ENABLED=0)"
        return None
    try:
        import httpx
        body = {"model": settings.ollama_model, "system": system, "prompt": prompt, "stream": False,
                "options": {"temperature": 0.2}}
        if json_mode:
            body["format"] = "json"
        r = httpx.post(f"{settings.ollama_base_url}/api/generate", json=body, timeout=settings.ollama_timeout)
        r.raise_for_status()
        _last_error.pop("ollama", None)
        return (r.json().get("response") or "").strip() or None
    except Exception as e:
        _last_error["ollama"] = f"Not reachable at {settings.ollama_base_url} ({type(e).__name__})"
        return None


def generate(system: str, prompt: str, json_mode: bool = False) -> Tuple[Optional[str], str]:
    if settings.ai_disabled:
        _last_error["all"] = "BRIDGE_AI_DISABLED=1"
        return None, "rules"
    text = _gemini(system, prompt, json_mode)
    if text:
        return text, "gemini"
    text = _ollama(system, prompt, json_mode)
    if text:
        return text, "ollama"
    return None, "rules"


def status() -> Dict[str, Any]:
    """Which engines are configured, and why the last call fell back (shown in the UI)."""
    return {
        "disabled": settings.ai_disabled,
        "gemini_configured": bool(settings.google_api_key),
        "gemini_model": settings.gemini_model,
        "ollama_enabled": settings.ollama_enabled,
        "ollama_url": settings.ollama_base_url,
        "last_errors": dict(_last_error),
    }


def _parse_json(text: Optional[str]) -> Optional[dict]:
    if not text:
        return None
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        import json
        data = json.loads(m.group(0))
        return data if isinstance(data, dict) else None
    except Exception:
        return None


# ---- question understanding ---------------------------------------------------------------------

def _has(term: str, text: str) -> bool:
    return re.search(r"(?<![\w/])" + re.escape(term) + r"(?![\w/])", text, re.IGNORECASE) is not None


def extract_filters(question: str) -> analytics.Filters:
    r = ref()
    q = question
    f: analytics.Filters = {}

    def add(key: str, value: str) -> None:
        f.setdefault(key, [])
        if value not in f[key]:
            f[key].append(value)

    for p in r.product_ta:
        if p in TA_ALIASES.values() or p in ("General", "PAH", "Oncology", "Immunology", "Neurosciences", "Established Products"):
            continue
        name = p.split("/")[0].split("(")[0].strip()
        if name and _has(name, q):
            add("products", p)
    for alias, p in PRODUCT_ALIASES.items():
        if _has(alias, q):
            add("products", p)
    for alias, ta in TA_ALIASES.items():
        if _has(alias, q):
            add("ta", ta)
    for region in r.hierarchy:
        if _has(region, q):
            add("region", region)
    if re.search(r"\bamericas?\b", q, re.I):
        add("region", "AMERICAS")
    for region, clusters in r.hierarchy.items():
        for cluster, countries in clusters.items():
            if len(cluster) > 4 and cluster not in r.hierarchy and _has(cluster, q):
                add("cluster", cluster)
            for c in countries:
                if _has(c, q):
                    add("country", c)
    for y in re.findall(r"\b(20[2-3]\d)\b", q):
        add("year", y)
    for qt in re.findall(r"\bQ([1-4])\b", q, re.I):
        add("quarter", f"Q{qt}")
    for alias, code in STAKEHOLDER_ALIASES.items():
        if _has(alias, q):
            add("stakeholders", code)
    if re.search(r"\bHAs?\b", q):
        add("stakeholders", "HA")
    for alias, a in ACTIVITY_ALIASES.items():
        if _has(alias, q) and not re.search(r"materials? (list|library)", q, re.I):
            add("activity_type", a)
    for name, pats in r.topics:
        if name in ("Safety training & education",):
            continue
        if any(p.search(q) for p in pats):
            add("topic", name)
    return f


def merge(a: analytics.Filters, b: analytics.Filters) -> analytics.Filters:
    out = {k: list(v) for k, v in a.items()}
    for k, v in b.items():
        out[k] = list(v)  # the question is more specific than the dashboard filter
    return out


def describe(f: analytics.Filters) -> str:
    if not f:
        return "all records you can see"
    names = {"products": "product", "ta": "TA", "stakeholders": "stakeholder", "activity_type": "activity type"}
    return "; ".join(f"{names.get(k, k.replace('_', ' '))}: {', '.join(v)}" for k, v in f.items())


# ---- facts & context ---------------------------------------------------------------------------

def facts(records: List[dict]) -> Dict[str, Any]:
    n = len(records)
    c = lambda it: Counter(it).most_common(6)  # noqa: E731
    periods = Counter(analytics.period_key(r) for r in records)
    recent = sorted(periods.items(), key=lambda kv: kv[0])[-4:]
    return {
        "interactions": n,
        "by_activity_type": dict(Counter(r.get("activity_type") for r in records)),
        "top_products": c(p for r in records for p in r.get("products") or []),
        "top_stakeholders": c(s for r in records for s in r.get("stakeholders") or []),
        "top_topics": c(t for r in records for t in r.get("topics") or []),
        "top_countries": c(r.get("country") for r in records),
        "recent_periods": recent,
        "stakeholder_requests": sum(1 for r in records if r.get("stakeholder_request") == "Yes"),
        "follow_ups": sum(1 for r in records if r.get("follow_up") == "Yes"),
        "top_impact": c(r.get("impact_category") for r in records if r.get("impact_category")),
        "external_share_pct": round(100 * sum(1 for r in records if r.get("has_external")) / n, 1) if n else 0,
        "launch_related": sum(1 for r in records if r.get("product_launch") == "Yes"),
    }


def _fmt_facts(fx: Dict[str, Any]) -> str:
    def lst(items):
        return ", ".join(f"{k} ({v})" for k, v in items) or "none"
    return "\n".join([
        f"- Interactions: {fx['interactions']}",
        f"- By activity type: {', '.join(f'{k} {v}' for k, v in fx['by_activity_type'].items())}",
        f"- Top products: {lst(fx['top_products'])}",
        f"- Top stakeholder functions: {lst(fx['top_stakeholders'])}",
        f"- Top safety topics: {lst(fx['top_topics'])}",
        f"- Top countries: {lst(fx['top_countries'])}",
        f"- Most recent periods: {lst(fx['recent_periods'])}",
        f"- Stakeholder requests: {fx['stakeholder_requests']}; follow-ups planned: {fx['follow_ups']}; launch-related: {fx['launch_related']}",
        f"- Main value delivered: {lst(fx['top_impact'])}",
        f"- Share involving external stakeholders: {fx['external_share_pct']}%",
    ])


def _context(records: List[dict], limit: int = 40) -> str:
    rows = sorted(records, key=lambda r: r.get("created", ""), reverse=True)[:limit]
    lines = []
    for r in rows:
        fb = f" | feedback: {r['feedback'][:150]}" if r.get("feedback") else ""
        lines.append(f"[#{r['id']}] {analytics.period_key(r)} {r.get('country')} | {', '.join(r.get('products') or [])} | "
                     f"{', '.join(r.get('stakeholders') or [])} | {r.get('activity_type')} | {(r.get('comments') or '')[:300]}{fb}")
    return "\n".join(lines)


SYSTEM = (
    "You are the insights assistant for J&J Local Medical Safety (LMS) benefit-risk interactions. "
    "Answer only from the FACTS and RECORDS provided. Use the numbers in FACTS exactly; do not compute new totals. "
    "Cite records as [#id]. If the data cannot answer the question, say so plainly. "
    "Format: a one or two sentence answer, then 'Key insights' as 3-5 short bullets, then 'Suggested next steps' as 1-3 bullets. "
    "Never include patient-identifying details."
)


# ---- Ask AI -----------------------------------------------------------------------------------

def chat(question: str, scoped_records: List[dict], dashboard_filters: analytics.Filters) -> Dict[str, Any]:
    from_question = extract_filters(question)
    used = merge(dashboard_filters, from_question)
    recs = analytics.apply(scoped_records, used)
    if not recs and from_question:
        # the dashboard filters may contradict the question; fall back to the question alone
        used = from_question
        recs = analytics.apply(scoped_records, used)
    fx = facts(recs)
    prompt = (f"QUESTION: {question}\n\nFILTERS APPLIED: {describe(used)}\n\nFACTS:\n{_fmt_facts(fx)}\n\n"
              f"RECORDS (most recent first):\n{_context(recs)}")
    text, engine = generate(SYSTEM, prompt) if recs else (None, "rules")
    if not text:
        text, engine = _rules_answer(question, recs, fx, used), "rules"
    return {
        "answer": text, "engine": engine, "filters_used": used, "filters_text": describe(used), "facts": fx,
        "sources": [r["id"] for r in sorted(recs, key=lambda r: r.get("created", ""), reverse=True)[:8]],
    }


def _rules_answer(question: str, recs: List[dict], fx: Dict[str, Any], used: analytics.Filters) -> str:
    if not recs:
        return (f"I found no interactions for {describe(used)}. Try widening the filters "
                "(for example remove the year or the country).")
    n = fx["interactions"]
    act = ", ".join(f"{v} {k.lower()}{'s' if v != 1 else ''}" for k, v in fx["by_activity_type"].items())
    top = lambda items, k=3: ", ".join(f"{a} ({b})" for a, b in items[:k]) or "none"  # noqa: E731
    lines = [f"There are **{n} interactions** for {describe(used)}: {act}.", "", "**Key insights**"]
    if fx["top_topics"]:
        lines.append(f"- Main safety topics: {top(fx['top_topics'])}.")
    lines.append(f"- Stakeholders most engaged: {top(fx['top_stakeholders'])}.")
    if len(used.get("products", [])) != 1:
        lines.append(f"- Products most discussed: {top(fx['top_products'])}.")
    if len(used.get("country", [])) != 1:
        lines.append(f"- Most active countries: {top(fx['top_countries'])}.")
    if fx["recent_periods"]:
        lines.append(f"- Recent activity: {top(fx['recent_periods'][::-1], 3)}.")
    extra = []
    if fx["stakeholder_requests"]:
        extra.append(f"{fx['stakeholder_requests']} came from a stakeholder request")
    if fx["follow_ups"]:
        extra.append(f"{fx['follow_ups']} have a follow-up planned")
    if extra:
        lines.append("- " + "; ".join(extra) + ".")
    ex = sorted(recs, key=lambda r: r.get("created", ""), reverse=True)[:3]
    lines += ["", "**Examples**"] + [f"- [#{r['id']}] {r.get('country')}, {analytics.period_key(r)}: {(r.get('comments') or '')[:160]}" for r in ex]
    lines += ["", "**Suggested next steps**"]
    prods = [p for p, _ in fx["top_products"][:2]]
    mats = analytics.recommend_materials(prods, [], limit=2) if prods else []
    if mats:
        lines.append(f"- Share the latest material: {mats[0]['title']} (added {mats[0]['date_added']}).")
    if fx["top_topics"]:
        lines.append(f"- Prepare a short update on {fx['top_topics'][0][0].lower()} for {fx['top_stakeholders'][0][0] if fx['top_stakeholders'] else 'your stakeholders'}.")
    return "\n".join(lines)


# ---- summaries (reports, hot topics, product views) ------------------------------------------------

def summary(records: List[dict], label: str) -> Dict[str, Any]:
    fx = facts(records)
    if not records:
        return {"text": "No interactions match these filters.", "engine": "rules"}
    prompt = (f"Write an executive summary of LMS benefit-risk interactions for: {label}.\n"
              f"Use 4-6 short bullets: volume and trend, main safety topics, key stakeholders, notable interactions [#id], "
              f"and one recommendation.\n\nFACTS:\n{_fmt_facts(fx)}\n\nRECORDS:\n{_context(records, 30)}")
    text, engine = generate(SYSTEM, prompt)
    if text:
        return {"text": text, "engine": engine}
    top = lambda items: ", ".join(f"{a} ({b})" for a, b in items[:3]) or "none"  # noqa: E731
    bullets = [
        f"- {fx['interactions']} interactions ({', '.join(f'{v} {k}' for k, v in fx['by_activity_type'].items())}).",
        f"- Main safety topics: {top(fx['top_topics'])}.",
        f"- Key stakeholder functions: {top(fx['top_stakeholders'])}.",
        f"- Products in focus: {top(fx['top_products'])}.",
        f"- {fx['stakeholder_requests']} stakeholder requests; {fx['follow_ups']} follow-ups planned; "
        f"{fx['external_share_pct']}% involved external stakeholders.",
    ]
    if fx["top_topics"]:
        bullets.append(f"- Recommendation: keep stakeholders updated on {fx['top_topics'][0][0].lower()}.")
    return {"text": "\n".join(bullets), "engine": "rules"}


# ---- data entry assistance ----------------------------------------------------------------------------

CONTENT_HINTS = [
    ("Safety Views", r"safety vie?w|safety update"),
    ("RMP & (C)ARMAs", r"\brmp\b|arma|armm|risk minimi|patient card|controlled (access|distribution)"),
    ("Aggreg. Reports", r"pbrer|psur|dsur|aggregate"),
    ("ICSR/AE/SS/Signal", r"signal|icsr|\bae\b|adverse event|case"),
    ("LMS Education", r"training|education|workshop|onboarding|introduc"),
    ("Core LMS Material", r"one[- ]pager|core (lms )?material|deep[- ]dive|newsletter|\bksp\b"),
    ("Clinical Trials & Other Studies", r"trial|study|studies|\bpass\b|\bpmc\b"),
    ("External Safety Data", r"article|literature|eudravigilance|publication"),
]
STAKEHOLDER_HINTS = [
    ("MAF", r"\bmaf\b|medical (affairs|manager|advisor|director|team)|\bmsl\b|medical science"),
    ("Reg.", r"\bra\b|regulatory|\breg\b"),
    ("Marketing", r"marketing|\bmkt\b|brand"),
    ("Sales", r"\bsales\b"),
    ("HA", r"health authorit|\bha\b|\blha\b|\bhaq\b"),
    ("HCPs", r"\bhcps?\b|physician|hospital|nurse"),
    ("MSO", r"\bmso\b"),
    ("HEMAR", r"market access|hemar|reimburse"),
    ("CVT/IBVT", r"\bcvt\b|value team"),
]


ASSIST_SYSTEM = (
    "You help J&J Local Medical Safety (LMS) colleagues fill in a benefit-risk interaction record from the "
    "free-text comment they wrote. Suggest values ONLY from the allowed lists given, and only when the comment "
    "or feedback gives evidence for them. Never invent a product: if the comment names a product or topic that is "
    "not in the list, say so in 'notes' instead. Also give 1-3 short tips to make the comment more useful "
    "(what was provided, who was involved, why it happened). Reply with JSON only."
)


def _rules_suggestions(form: Dict[str, Any], text: str) -> Dict[str, Any]:
    r = ref()
    low = text.lower()
    sugg: Dict[str, Any] = {}
    prods = [p for p in r.product_ta if p not in TA_ALIASES.values() and p not in ("General", "PAH", "Neurosciences")
             and _has(p.split("/")[0].split("(")[0].strip(), text)]
    prods += [p for a, p in PRODUCT_ALIASES.items() if _has(a, text) and p not in prods]
    if prods:
        sugg["products"] = list(dict.fromkeys(prods))
    content = [c for c, pat in CONTENT_HINTS if re.search(pat, low)]
    if content:
        sugg["content"] = content
    sh = [c for c, pat in STAKEHOLDER_HINTS if re.search(pat, low)]
    if sh:
        sugg["stakeholders"] = sh
    if re.search(r"\bshared|sent|distributed|provided\b", low):
        sugg["activity_type"] = "Material"
    elif re.search(r"present", low):
        sugg["activity_type"] = "Presentation"
    elif re.search(r"discuss|meeting|call|talk", low):
        sugg["activity_type"] = "Discussion"
    if re.search(r"\bnew\b|introduc|onboarding|\bfirst\b", low):
        sugg["stakeholder_status"] = "New"
    if re.search(r"follow|\bnext\b|upcoming|planned|\bwill\b|invited", low):
        sugg["follow_up"] = "Yes"
    return sugg


def _allowed() -> Dict[str, Any]:
    from reference import DROPDOWNS_STATIC
    r = ref()
    return {
        "products": sorted(r.product_ta),
        "content": DROPDOWNS_STATIC["content"],
        "stakeholders": [s["code"] for s in r.demo["stakeholders"]],
        "activity_type": DROPDOWNS_STATIC["activity_type"],
        "material_external": ["Yes", "No"],
        "product_launch": ["Yes", "No"],
        "stakeholder_request": ["Yes", "No", "N/A"],
        "stakeholder_status": r.kpi_options["stakeholder_status"],
        "follow_up": r.kpi_options["follow_up"],
        "impact_category": r.kpi_options["impact_category"],
        "outcomes": r.kpi_options["outcomes"],
    }


LIST_KEYS = {"products", "content", "stakeholders", "outcomes"}


def _validate(raw: Dict[str, Any], form: Dict[str, Any]) -> Dict[str, Any]:
    """Keep only values from the allowed lists, and only for fields the user hasn't filled yet."""
    allowed = _allowed()
    out: Dict[str, Any] = {}
    for k, v in (raw or {}).items():
        if form.get(k):
            continue
        if k == "specific_icsr" and isinstance(v, str) and v.strip():
            out[k] = v.strip()[:150]
        elif k in LIST_KEYS:
            vals = [x for x in (v if isinstance(v, list) else [v]) if x in allowed[k]]
            if vals:
                out[k] = list(dict.fromkeys(vals))
        elif k in allowed and isinstance(v, str) and v in allowed[k]:
            out[k] = v
    return out


def assist(form: Dict[str, Any]) -> Dict[str, Any]:
    from reference import quality_score
    import json
    r = ref()
    text = f"{form.get('comments', '')} {form.get('feedback', '')}"
    filled = {k: v for k, v in form.items() if v and (k in _allowed() or k in ("country", "specific_icsr"))}
    prompt = (
        "ALLOWED VALUES:\n" + json.dumps(_allowed(), ensure_ascii=False) +
        "\n\nPRODUCT -> THERAPEUTIC AREA:\n" + json.dumps(r.product_ta, ensure_ascii=False) +
        "\n\nSTAKEHOLDER CODES:\n" + json.dumps({s['code']: s['name'] for s in r.demo['stakeholders']}, ensure_ascii=False) +
        "\n\nALREADY FILLED BY THE USER (do not change):\n" + json.dumps(filled, ensure_ascii=False) +
        f"\n\nCOMMENT:\n{form.get('comments', '')}\n\nFEEDBACK:\n{form.get('feedback', '')}\n\n"
        'Return JSON: {"suggestions": {"<field>": <value or list>, ...}, "tips": ["..."], "notes": "..."}. '
        "Fields you may suggest: products, content, stakeholders, activity_type, material_external, product_launch, "
        "stakeholder_request, stakeholder_status, follow_up, impact_category, outcomes, specific_icsr."
    )
    raw, engine = generate(ASSIST_SYSTEM, prompt, json_mode=True)
    data = _parse_json(raw)
    tips: List[str] = []
    notes = ""
    if data is not None:
        sugg = _validate(data.get("suggestions") or {}, form)
        tips = [str(t) for t in (data.get("tips") or [])][:3]
        notes = str(data.get("notes") or "")[:300]
    else:
        engine = "rules"
        sugg = _validate(_rules_suggestions(form, text), form)
        if len((form.get("comments") or "").strip()) < 80:
            tips.append("Add more detail: what was provided, who was involved, and why the interaction happened.")
        if not sugg:
            notes = "No product, stakeholder or content type could be recognised from the comment."

    topics = r.topics_for({"comments": text, "specific_icsr": form.get("specific_icsr", "")})
    merged = {**form, **sugg}
    return {
        "suggestions": sugg,
        "tips": tips,
        "notes": notes,
        "topics": topics,
        # only recommend when we know the product; otherwise the list would just be "newest materials"
        "materials": analytics.recommend_materials(form.get("products") or sugg.get("products"),
                                                   form.get("content") or sugg.get("content") or [])
        if (form.get("products") or sugg.get("products")) else [],
        "quality": quality_score(form),
        "quality_if_applied": quality_score(merged),
        "missing": [f for f in r.quality["required"] if not form.get(f)],
        "engine": engine,
        "fallback_reason": "" if engine != "rules" else "; ".join(f"{k}: {v}" for k, v in _last_error.items()),
    }
