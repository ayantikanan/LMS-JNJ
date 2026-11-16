"""Generate data/jnj_demo_data.json: DEMO reference data for the items that are blocked
on stakeholder answers. Every value here is a placeholder to show the feature in the POC
and must be replaced by the LMS team's real lists before any real use.

Usage (from backend/):  python tools/make_demo_data.py

Deterministic: same seed records in -> same JSON out. Static lists are authored below;
per-record KPI values, material links and workflow requests are derived from the seed
records with simple text rules so the demo looks plausible.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
SEED = DATA / "seed_records.json"
OUT = DATA / "jnj_demo_data.json"

REFERENCE_DATE = "2026-04-30"  # the sample export runs to Jan 2026; alerts are computed as of this date so gaps show

# ---------------------------------------------------------------------------
# 1. Product -> therapeutic area (blocked item: TA filter)
# ---------------------------------------------------------------------------
PRODUCT_TA = {
    # Oncology
    "Balversa/ Erfandel": "Oncology", "Carvykti": "Oncology", "Erleada": "Oncology",
    "Rybrevant": "Oncology", "Lazertinib": "Oncology", "Talquetamab": "Oncology",
    "Imbruvica": "Oncology", "Tecvayli": "Oncology", "Darzalex/ Dalinvi": "Oncology",
    "Zytiga": "Oncology", "TAR-200": "Oncology", "Oncology": "Oncology",
    # Immunology
    "Tremfya": "Immunology", "Stelara": "Immunology", "Icotrokinra": "Immunology",
    "Nipocalimab": "Immunology", "Simponi": "Immunology", "Remicade": "Immunology",
    "Immunology": "Immunology",
    # Neuroscience
    "Spravato": "Neuroscience", "Trevicta / Invega Trinza (PP3M)": "Neuroscience",
    "Xeplion / Invega Sustenna (PP1M)": "Neuroscience", "Topiramate": "Neuroscience",
    "Neurosciences": "Neuroscience",
    # Cardiopulmonary (PAH)
    "Opsumit/ Zependo": "Cardiopulmonary (PAH)", "Uptravi": "Cardiopulmonary (PAH)",
    "Bosentan": "Cardiopulmonary (PAH)", "PAH": "Cardiopulmonary (PAH)",
    # Others
    "Invokana": "Established Products", "Established Products": "Established Products",
    "General": "Cross-TA (General)",
}

# ---------------------------------------------------------------------------
# 2. Stakeholder functions: full name + internal/external (blocked: KPI tiles, gap alerts)
# ---------------------------------------------------------------------------
STAKEHOLDERS = [
    {"code": "MAF", "name": "Medical Affairs", "type": "Internal", "gap_alert_days": 90},
    {"code": "Reg.", "name": "Regulatory Affairs", "type": "Internal", "gap_alert_days": 120},
    {"code": "Marketing", "name": "Marketing", "type": "Internal", "gap_alert_days": 90},
    {"code": "Sales", "name": "Sales", "type": "Internal", "gap_alert_days": 120},
    {"code": "CQ", "name": "Compliance & Quality", "type": "Internal", "gap_alert_days": 180},
    {"code": "HEMAR", "name": "Health Economics, Market Access & Reimbursement", "type": "Internal", "gap_alert_days": 180},
    {"code": "CVT/IBVT", "name": "Country Value Team / Integrated Brand Value Team", "type": "Internal", "gap_alert_days": 120},
    {"code": "GCO/MAO", "name": "Global Clinical Operations / Medical Affairs Operations", "type": "Internal", "gap_alert_days": 180},
    {"code": "GMO", "name": "Global Medical Organization", "type": "Internal", "gap_alert_days": 180},
    {"code": "MSO", "name": "Medical Safety Officer", "type": "Internal", "gap_alert_days": 120},
    {"code": "Board", "name": "Leadership / Board", "type": "Internal", "gap_alert_days": 365},
    {"code": "Other internal", "name": "Other internal function", "type": "Internal", "gap_alert_days": 365},
    {"code": "HA", "name": "Health Authority", "type": "External", "gap_alert_days": 365},
    {"code": "HCPs", "name": "Healthcare Professionals", "type": "External", "gap_alert_days": 365},
    {"code": "Other external", "name": "Other external party", "type": "External", "gap_alert_days": 365},
]

# ---------------------------------------------------------------------------
# 3. Activity Level (blocked: filter) - derived, first matching rule wins
# ---------------------------------------------------------------------------
ACTIVITY_LEVEL_RULES = [
    {"level": "Global", "when": {"region": ["Global"]}},
    {"level": "Global", "when": {"country_contains": ["Global"]}},
    {"level": "Regional", "when": {"country_contains": ["Regional"]}},
    {"level": "Regional", "when": {"cluster": ["Regional LMS"]}},
    {"level": "Local", "when": {}},
]

# ---------------------------------------------------------------------------
# 4. Local Medical Safety materials list (blocked: dropdown, recommendations, new-material alerts)
# ---------------------------------------------------------------------------
M = [
    # id, title, products, content type, date added, external use, keywords used to link to records
    ("M001", "Erleada EU RMP update v8.3 - one pager", ["Erleada"], "RMP & (C)ARMAs", "2025-11-20", False, ["rmp", "v8.3"]),
    ("M002", "Erleada neutropenia deep-dive presentation", ["Erleada"], "Core LMS Material", "2025-11-25", False, ["neutropenia"]),
    ("M003", "Erleada signal: lichenoid eruption - one pager", ["Erleada"], "ICSR/AE/SS/Signal", "2025-09-30", False, ["lichenoid"]),
    ("M004", "Erleada quarterly Safety Views Q4 2025", ["Erleada"], "Safety Views", "2026-04-02", False, ["safety views", "safety update"]),
    ("M005", "Amivantamab/Lazertinib quarterly Safety Views Q3 2025", ["Rybrevant", "Lazertinib"], "Safety Views", "2025-10-30", False, ["safety view", "safety update"]),
    ("M006", "Rybrevant RMP key safety messages", ["Rybrevant"], "RMP & (C)ARMAs", "2025-07-15", False, ["rmp", "key safety"]),
    ("M007", "Lazertinib RMP v2.1 key safety messages - one pager", ["Lazertinib"], "RMP & (C)ARMAs", "2025-10-10", False, ["lazertinib rmp", "rmp v.2.1"]),
    ("M008", "Ami/Laz PV newsletter Q4 2025", ["Rybrevant", "Lazertinib"], "Core LMS Material", "2026-03-20", False, ["newsletter", "pv news"]),
    ("M009", "Carvykti core RMP v6.0 summary", ["Carvykti"], "RMP & (C)ARMAs", "2025-04-30", False, ["crmp", "rmp"]),
    ("M010", "Carvykti EU RMP v6.1 summary", ["Carvykti"], "RMP & (C)ARMAs", "2025-04-30", False, ["eu rmp", "eu-rmp"]),
    ("M011", "Carvykti launch preparation pack", ["Carvykti"], "Core LMS Material", "2025-06-01", False, ["launch"]),
    ("M012", "Carvykti PBRER summary (Feb-Aug 2025)", ["Carvykti"], "Aggreg. Reports", "2025-10-15", False, ["pbrer"]),
    ("M013", "Tecvayli EU & WW PBRER - one pager", ["Tecvayli"], "Aggreg. Reports", "2025-09-15", False, ["pbrer"]),
    ("M014", "Tecvayli & Talvey safety snapshot", ["Tecvayli", "Talquetamab"], "Safety Views", "2026-04-10", False, ["snapshot", "safety views"]),
    ("M015", "Signal training: tumour flare reaction (Talvey & Tecvayli)", ["Tecvayli", "Talquetamab"], "Other Safety Insights", "2025-08-28", False, ["tumour flare", "tumor flare"]),
    ("M016", "Drug-induced PML safety overview - one pager", ["Talquetamab", "Tecvayli", "Darzalex/ Dalinvi", "Imbruvica", "Carvykti"], "Other Safety Insights", "2025-10-20", False, ["pml", "leukoencephalopathy"]),
    ("M017", "Talvey EU RMP v3.3 safety messages", ["Talquetamab"], "RMP & (C)ARMAs", "2025-12-05", False, ["rmp v3.3", "rmp version 3.3"]),
    ("M018", "Darzalex EU RMP v12.1 presentation", ["Darzalex/ Dalinvi"], "RMP & (C)ARMAs", "2025-03-10", False, ["eurmp", "rmp"]),
    ("M019", "Imbruvica EU RMP v23.3 - one page summary", ["Imbruvica"], "RMP & (C)ARMAs", "2025-09-01", False, ["rmpv23", "rmp"]),
    ("M020", "Imbruvica quarterly Safety Views Q4 2025", ["Imbruvica"], "Safety Views", "2026-04-15", False, ["safety views"]),
    ("M021", "Balversa PBRER summary (Oct 2024-Apr 2025)", ["Balversa/ Erfandel"], "Aggreg. Reports", "2025-07-20", False, ["pbrer"]),
    ("M022", "Balversa quarterly Safety Views Q3 2025", ["Balversa/ Erfandel"], "Safety Views", "2025-10-25", False, ["safety views", "safety update"]),
    ("M023", "TAR-200 pre-launch safety training deck", ["TAR-200"], "LMS Education", "2026-04-22", False, ["training", "launch"]),
    ("M024", "Tremfya EU RMP v12.1 summary", ["Tremfya"], "RMP & (C)ARMAs", "2025-06-15", False, ["rmp"]),
    ("M025", "Tremfya worldwide PBRER summary", ["Tremfya"], "Aggreg. Reports", "2024-07-13", False, ["pbrer"]),
    ("M026", "Tremfya quarterly Safety Views Q4 2025", ["Tremfya"], "Safety Views", "2026-03-25", False, ["safety views"]),
    ("M027", "Icotrokinra core RMP & DSUR summary", ["Icotrokinra"], "Aggreg. Reports", "2025-10-15", False, ["dsur", "crmp"]),
    ("M028", "Nipocalimab (Imaavy) safety onboarding pack", ["Nipocalimab"], "LMS Education", "2026-04-08", False, ["onboarding", "safety views"]),
    ("M029", "Stelara worldwide Safety Views Q3 2025", ["Stelara"], "Safety Views", "2025-10-30", False, ["safety views"]),
    ("M030", "Spravato controlled access / distribution programme overview", ["Spravato"], "RMP & (C)ARMAs", "2025-09-10", False, ["controlled", "rmp"]),
    ("M031", "Spravato safety concerns training for HCPs", ["Spravato"], "LMS Education", "2025-11-01", True, ["training"]),
    ("M032", "Spravato Safety Views Q4 2025 for MAF", ["Spravato"], "Safety Views", "2026-04-20", False, ["safety views", "safetry views"]),
    ("M033", "Uptravi RMP v9.1 safety messages", ["Uptravi"], "RMP & (C)ARMAs", "2025-05-01", False, ["uptravi"]),
    ("M034", "PAH medication adherence patient leaflet", ["Opsumit/ Zependo", "Uptravi", "PAH"], "LMS Education", "2025-12-15", True, ["adherence"]),
    ("M035", "PV in practice: aggregate reports (training)", ["General"], "LMS Education", "2025-03-01", False, ["pv in practice", "aggregate"]),
    ("M036", "EZ Reporter: how to report AE/PQC", ["General"], "LMS Education", "2025-05-20", False, ["ez reporter", "ezr"]),
    ("M037", "LMS organisation model & RML role - introduction deck", ["General", "Oncology"], "LMS Education", "2025-10-01", False, ["rml role", "organization model", "organisation model", "organizational model"]),
]

# ---------------------------------------------------------------------------
# 5. Demo users / profiles and access rules (blocked: roles & permissions)
# ---------------------------------------------------------------------------
USERS = [
    {"id": "u_onc_alpines", "name": "Sofie Brunner", "title": "Local Medical Safety Lead, Alpines",
     "role": "LMS Local", "scope_level": "Local", "regions": ["EMEA"], "clusters": [], "countries": ["Alpines"],
     "tas": ["Oncology"], "products": [], "can_edit": "own_scope", "is_admin": False},
    {"id": "u_emea_head", "name": "Dr. Lena Vogel", "title": "EMEA Safety Head",
     "role": "Regional Head", "scope_level": "Regional", "regions": ["EMEA"], "clusters": [], "countries": [],
     "tas": [], "products": [], "can_edit": "own_records", "is_admin": False},
    {"id": "u_imm_rml", "name": "Dr. Marco Rinaldi", "title": "Global Risk Management Lead, Immunology",
     "role": "Global RML", "scope_level": "Global", "regions": [], "clusters": [], "countries": [],
     "tas": ["Immunology"], "products": [], "can_edit": "own_records", "is_admin": False},
    {"id": "u_apac_sea", "name": "Mei Lin Tan", "title": "LMS Manager, South East Asia",
     "role": "LMS Cluster", "scope_level": "Regional", "regions": ["APAC"], "clusters": ["South East Asia"], "countries": [],
     "tas": [], "products": [], "can_edit": "own_scope", "is_admin": False},
    {"id": "u_admin", "name": "LMS ID Team", "title": "Dashboard administrator",
     "role": "Admin", "scope_level": "Global", "regions": [], "clusters": [], "countries": [],
     "tas": [], "products": [], "can_edit": "all", "is_admin": True},
]

ACCESS_RULES = {
    "Local": "Sees full records for their own countries; sees counts and hot topics (no record detail) for other countries on the same products.",
    "Regional": "Sees full records for their regions / clusters.",
    "Global": "Sees all records.",
    "edit": {
        "own_records": "Can edit records they created.",
        "own_scope": "Can edit any record in their own countries / clusters.",
        "all": "Can edit and delete any record (admin).",
    },
}

# ---------------------------------------------------------------------------
# 6. Benefit-Risk request workflow (blocked: contacts, deadlines)
# ---------------------------------------------------------------------------
WORKFLOW = {
    "stages": [
        {"id": "logged", "label": "Logged", "sla_days": 0},
        {"id": "escalated", "label": "Escalated to core team / RML", "sla_days": 2},
        {"id": "follow_up", "label": "Follow-up", "sla_days": 10},
        {"id": "resolved", "label": "Resolved (confirmed)", "sla_days": 30},
    ],
    "escalation_contacts": {
        "Oncology": [
            {"name": "Dr. Anna Kowalski (demo)", "role": "Oncology Core Team Lead - EMEA"},
            {"name": "Dr. Raj Mehta (demo)", "role": "Risk Management Lead - Oncology"},
        ],
        "Immunology": [
            {"name": "Dr. Claire Dubois (demo)", "role": "Immunology Core Team Lead - EMEA"},
            {"name": "Dr. Marco Rinaldi (demo)", "role": "Global Risk Management Lead - Immunology"},
        ],
        "Neuroscience": [
            {"name": "Dr. Yusuf Haddad (demo)", "role": "Neuroscience Core Team Lead"},
            {"name": "Dr. Ingrid Larsen (demo)", "role": "Risk Management Lead - Neuroscience"},
        ],
        "Cardiopulmonary (PAH)": [
            {"name": "Dr. Paula Ortega (demo)", "role": "PAH Core Team Lead"},
        ],
        "Established Products": [
            {"name": "Dr. Tom Becker (demo)", "role": "Established Products Safety Lead"},
        ],
        "Cross-TA (General)": [
            {"name": "LMS ID Team (demo)", "role": "Regional LMS coordination"},
        ],
    },
    "confirmed_by": "The LMS colleague who logged the request confirms resolution with the stakeholder.",
}

# ---------------------------------------------------------------------------
# 7. KPI / value indicator options (blocked: final KPI list)
# ---------------------------------------------------------------------------
KPI_OPTIONS = {
    "stakeholder_status": ["New", "Established"],
    "follow_up": ["Yes", "No"],
    "impact_category": [
        "Answered stakeholder query",
        "Kept stakeholders informed",
        "Built stakeholder safety knowledge",
        "Supported risk minimisation",
        "Supported launch readiness",
        "Other",
    ],
    "outcomes": [
        "Led to another interaction",
        "Led to stakeholder action",
        "Informed a decision",
    ],
}

# ---------------------------------------------------------------------------
# 8. Safety hot-topic taxonomy (used when no AI model is available, and to tag records)
# ---------------------------------------------------------------------------
TOPICS = [
    ("RMP updates & key safety messages", [r"\brmp\b", r"risk management plan", r"key safety message"]),
    ("Additional risk minimisation (aRMM / patient card)", [r"\ba?rmms?\b", r"\b\(?c\)?armas?\b", r"patient card", r"controlled (access|distribution)", r"risk minimi[sz]ation"]),
    ("Aggregate reports (PBRER / PSUR / DSUR)", [r"\bpbrer\b", r"\bpsur\b", r"\bdsur\b", r"aggregate report"]),
    ("Quarterly Safety Views", [r"safety vie?we?s", r"safetry views", r"safety update"]),
    ("Safety signals", [r"\bsignals?\b", r"\bprac\b"]),
    ("PML", [r"\bpml\b", r"leukoencephalopathy"]),
    ("Neutropenia", [r"neutropenia"]),
    ("Neurotoxicity / ICANS", [r"\bicans\b", r"neurolog\w* toxicity", r"neurotox"]),
    ("Infusion-related reactions", [r"infusion[- ]related", r"\birr\b"]),
    ("Tumour flare reaction", [r"tumou?r flare"]),
    ("Skin reactions (rash, lichenoid, erythema)", [r"\brash\b", r"lichenoid", r"erythema"]),
    ("Infections & reactivation (TB, HBV)", [r"infection", r"\btb\b", r"\bhbv\b", r"reactivation"]),
    ("Cardiac safety", [r"cardiac", r"cardiotox"]),
    ("Growth / slipped capital femoral epiphysis", [r"femoral epiphysis", r"growth accelerated"]),
    ("Anaphylaxis / hypersensitivity", [r"anaphyla", r"hypersensitiv"]),
    ("Off-label use", [r"off[- ]label", r"\bolu\b"]),
    ("Health authority queries", [r"\bhaq\b", r"\blha\b", r"health authority", r"\bha\b request", r"regulatory authorit"]),
    ("Label / SmPC changes", [r"\blabel", r"\bsmpc\b", r"package insert"]),
    ("Launch readiness", [r"\blaunch"]),
    ("AE / PQC reporting", [r"ez ?reporter", r"\bezr\b", r"\bpqc\b", r"ae[- ]reporting", r"reporting process"]),
    ("LMS organisation & RML role", [r"rml role", r"organi[sz]ation(al)? model"]),
    ("Safety training & education", [r"training", r"workshop", r"onboarding", r"education"]),
    ("Clinical studies (PASS / PMC / LTFU)", [r"\bpass\b", r"\bpmc\b", r"\bltfu\b", r"clinical trial", r"\bstudy\b", r"\bstudies\b"]),
    ("Patient adherence", [r"adherence"]),
]

# ---------------------------------------------------------------------------
# 9. Field help text (the (i) icons) and quality score weights
# ---------------------------------------------------------------------------
HELP_TEXT = {
    "cluster": "The cluster or sub-region the country belongs to (e.g. Mid-Size Markets, South East Asia). Filled automatically when you pick a country.",
    "products": "The product(s) or therapeutic area the interaction was about. Pick 'General' if it covered several TAs.",
    "stakeholders": "The J&J function(s) you interacted with, e.g. MAF (Medical Affairs), Reg. (Regulatory). Several can be selected.",
    "activity_type": "Discussion = conversation/meeting; Presentation = you presented; Material = you shared a document.",
    "content": "The type of safety content covered. Several can be selected.",
    "materials": "The Local Medical Safety material(s) you used, from the LMS materials list.",
    "comments": "Describe the interaction: what was provided, who was involved, and why the interaction occurred.",
    "feedback": "Any feedback received and/or information related to potential interaction impact.",
    "specific_icsr": "Which ICSR / AE / safety signal the interaction is related to, if any.",
    "stakeholder_status": "New = first interaction with this stakeholder; Established = ongoing relationship.",
    "impact_category": "The main value this interaction delivered (demo list, pending the final KPI set).",
}

QUALITY_WEIGHTS = {
    "required_fields": 45,
    "comment_detail": 20,
    "feedback": 10,
    "kpi_fields": 15,
    "material_link": 5,
    "icsr_detail": 5,
    "required": ["year", "quarter", "region", "cluster", "country", "products", "stakeholders",
                 "activity_type", "content", "material_external", "stakeholder_request",
                 "product_launch", "comments"],
    "bands": {"High": 85, "Medium": 60},
}


# ---------------------------------------------------------------------------
# Derived per-record demo values
# ---------------------------------------------------------------------------

def has(pattern: str, text: str) -> bool:
    return re.search(pattern, text, re.IGNORECASE) is not None


def record_kpis(r: dict) -> dict:
    t = f"{r['comments']} {r['feedback']}"
    status = "New" if has(r"\bnew\b|introduc|onboarding|\bfirst\b|connection with|initial", t) else "Established"
    follow = "Yes" if has(r"follow|\bnext\b|upcoming|planned|\bwill\b|future|invited|another|agreement|ongoing", t) else "No"
    if has(r"request|asked|\bask\b|question|query|\bhaq\b|inquir", t):
        impact = "Answered stakeholder query"
    elif has(r"training|education|workshop|onboarding|presentation to|introduction", t):
        impact = "Built stakeholder safety knowledge"
    elif has(r"launch", t) or r["product_launch"] == "Yes":
        impact = "Supported launch readiness"
    elif has(r"\brmp\b|armm|arma|patient card|controlled|risk minimi", t):
        impact = "Supported risk minimisation"
    elif has(r"safety vie|update|newsletter|shared|summary", t):
        impact = "Kept stakeholders informed"
    else:
        impact = "Other"
    outcomes = []
    if has(r"invited|another training|follow-up|next|second training|regular", t):
        outcomes.append("Led to another interaction")
    if has(r"agreed|agreement|supported the proposal|updated|lifted|requested that|will be added|dissemination", t):
        outcomes.append("Led to stakeholder action")
    if has(r"decision|decid|strategy|plan", t):
        outcomes.append("Informed a decision")
    return {"stakeholder_status": status, "follow_up": follow, "impact_category": impact, "outcomes": outcomes}


def record_materials(r: dict, materials: list[dict]) -> list[str]:
    if not (r["activity_type"] in ("Material", "Presentation") or
            set(r["content"]) & {"Core LMS Material", "Safety Views", "RMP & (C)ARMAs", "Aggreg. Reports"}):
        return []
    text = r["comments"].lower()
    found = []
    for m in materials:
        if not set(m["products"]) & set(r["products"]):
            continue
        if any(k in text for k in m["keywords"]):
            found.append(m["id"])
    return found[:3]


def main() -> None:
    records = json.loads(SEED.read_text(encoding="utf-8"))["records"]
    materials = [
        {"id": i, "title": t, "products": p, "ta": sorted({PRODUCT_TA.get(x, "Cross-TA (General)") for x in p}),
         "content_type": c, "date_added": d, "external_use": ext, "keywords": kw,
         "source": "LMS Learn channel (demo list)", "link": "#"}
        for i, t, p, c, d, ext, kw in M
    ]

    record_demo = {}
    for r in records:
        k = record_kpis(r)
        k["materials"] = record_materials(r, materials)
        record_demo[str(r["id"])] = k

    # Workflow demo requests: a few per demo profile scope, so every profile has something on its board.
    # Prefer records flagged as a stakeholder request, most recent first.
    stage_cycle = ["logged", "escalated", "follow_up", "resolved"]
    newest = sorted(records, key=lambda r: r["created"], reverse=True)
    newest.sort(key=lambda r: r["stakeholder_request"] != "Yes")  # stable: requests first, each group newest first
    immunology = {p for p, ta in PRODUCT_TA.items() if ta == "Immunology"}
    scopes = [
        (lambda r: r["country"] == "Alpines", 4),                 # Sofie (local, Alpines)
        (lambda r: r["cluster"] == "South East Asia", 3),         # Mei Lin (SEA cluster)
        (lambda r: bool(set(r["products"]) & immunology), 3),     # Marco (global, Immunology)
        (lambda r: r["region"] == "EMEA", 4),                     # Lena (EMEA)
    ]
    req_records, seen = [], set()
    for pred, n in scopes:
        picked = [r for r in newest if pred(r) and r["id"] not in seen][:n]
        for r in picked:
            seen.add(r["id"])
        req_records += picked
    stages_for = [stage_cycle[i % 4] for i in range(len(req_records))]
    requests = []
    for n, (r, stage) in enumerate(zip(req_records, stages_for), start=1):
        ta = PRODUCT_TA.get(r["products"][0], "Cross-TA (General)") if r["products"] else "Cross-TA (General)"
        contact = WORKFLOW["escalation_contacts"].get(ta, WORKFLOW["escalation_contacts"]["Cross-TA (General)"])[0]
        start = datetime.fromisoformat(r["created"])
        order = ["logged", "escalated", "follow_up", "resolved"]
        notes = {
            "logged": "Request logged from interaction record.",
            "escalated": f"Escalated to {contact['name']} ({contact['role']}).",
            "follow_up": "Core team response received; follow-up with stakeholder scheduled.",
            "resolved": "Stakeholder confirmed the query was resolved.",
        }
        events = []
        for i, s in enumerate(order[: order.index(stage) + 1]):
            events.append({"stage": s, "at": (start + timedelta(days=[0, 1, 6, 15][i])).isoformat(timespec="seconds"),
                           "by": r["created_by"], "note": notes[s]})
        first = re.split(r"(?<=[.?!])\s", r["comments"])[0]
        requests.append({
            "id": f"BR-{n:03d}", "record_id": r["id"], "title": first[:110],
            "product": r["products"][0] if r["products"] else "", "ta": ta,
            "country": r["country"], "stakeholders": r["stakeholders"],
            "assignee": contact, "stage": stage, "events": events,
        })

    reports = [
        {"id": "R-EMEA", "name": "EMEA interactions - EMEA Safety Head", "owner": "u_emea_head",
         "audience": "EMEA Safety Head", "filters": {"region": ["EMEA"]},
         "sections": ["kpis", "trend", "stakeholders", "content", "hot_topics", "ai_summary", "records"]},
        {"id": "R-IMM", "name": "Immunology - Global Risk Management Lead", "owner": "u_imm_rml",
         "audience": "Global RML Immunology", "filters": {"ta": ["Immunology"]},
         "sections": ["kpis", "trend", "stakeholders", "hot_topics", "ai_summary", "records"]},
        {"id": "R-ALP", "name": "Alpines Oncology - quarterly update", "owner": "u_onc_alpines",
         "audience": "Local MAF Oncology", "filters": {"country": ["Alpines"], "ta": ["Oncology"]},
         "sections": ["kpis", "content", "hot_topics", "ai_summary", "records"]},
    ]

    out = {
        "_about": "DEMO DATA for the LMS Benefit-Risk Interaction Dashboard. Placeholder values for items blocked on LMS stakeholder input. "
                  "Replace with the LMS team's real lists before any real use. Names marked (demo) are fictional.",
        "reference_date": REFERENCE_DATE,
        "new_material_window_days": 45,
        "product_ta": PRODUCT_TA,
        "stakeholders": STAKEHOLDERS,
        "activity_level_rules": ACTIVITY_LEVEL_RULES,
        "materials": materials,
        "users": USERS,
        "access_rules": ACCESS_RULES,
        "workflow": WORKFLOW,
        "workflow_requests": requests,
        "kpi_options": KPI_OPTIONS,
        "record_demo_values": record_demo,
        "safety_topic_taxonomy": [{"topic": t, "patterns": p} for t, p in TOPICS],
        "help_text": HELP_TEXT,
        "quality_weights": QUALITY_WEIGHTS,
        "reports": reports,
    }
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT} ({len(materials)} materials, {len(requests)} requests, {len(record_demo)} record KPI rows)")


if __name__ == "__main__":
    main()
