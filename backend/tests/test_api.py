"""API tests. Run from backend/:  python -m pytest tests -q"""

import os
import tempfile

os.environ["BRIDGE_DB_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["BRIDGE_AI_DISABLED"] = "1"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app as bridge  # noqa: E402

H = lambda uid: {"X-Bridge-User": uid}  # noqa: E731
ADMIN, EMEA, ALPINES, IMM, SEA = "u_admin", "u_emea_head", "u_onc_alpines", "u_imm_rml", "u_apac_sea"

NEW = {
    "year": "2026", "quarter": "Q1", "country": "Alpines", "products": ["Erleada"], "stakeholders": ["MAF"],
    "activity_type": "Material", "content": ["Safety Views"], "material_external": "No",
    "stakeholder_request": "Yes", "product_launch": "No", "materials": ["M004"],
    "comments": "Shared the Erleada quarterly Safety Views Q4 2025 with the local MAF team to support their launch planning.",
    "feedback": "MAF asked for a follow-up on neutropenia.", "stakeholder_status": "Established", "follow_up": "Yes",
    "impact_category": "Kept stakeholders informed",
}


@pytest.fixture(scope="module")
def c():
    with TestClient(bridge.app) as client:
        yield client


def test_requires_user(c):
    assert c.get("/api/dashboard").status_code == 401


def test_seed_counts_match_export(c):
    d = c.get("/api/dashboard", headers=H(ADMIN)).json()
    assert d["tiles"]["total"] == 199
    assert d["tiles"]["discussion"] == 45 and d["tiles"]["material"] == 116 and d["tiles"]["presentation"] == 38
    sr = {x["value"]: x["count"] for x in d["additional"]["stakeholder_request"]}
    assert sr == {"Yes": 43, "No": 120, "N/A": 36}


def test_scope_is_applied_server_side(c):
    emea = c.get("/api/dashboard", headers=H(EMEA)).json()["tiles"]["total"]
    alp = c.get("/api/records?size=500", headers=H(ALPINES)).json()
    sea = c.get("/api/records?size=500", headers=H(SEA)).json()
    assert emea == 140
    assert alp["total"] == 24 and all(r["country"] == "Alpines" for r in alp["items"])
    assert all(r["cluster"] == "South East Asia" for r in sea["items"])


def test_filters_and_cross_filter_keys(c):
    d = c.get("/api/dashboard?ta=Oncology&activity_type=Material", headers=H(ADMIN)).json()
    assert d["tiles"]["total"] == d["tiles"]["material"] > 0
    drill = c.get("/api/dashboard?region=EMEA", headers=H(ADMIN)).json()["geo"]
    assert drill["level"] == "cluster"
    drill = c.get("/api/dashboard?region=EMEA&cluster=Mid-Size%20Markets", headers=H(ADMIN)).json()["geo"]
    assert drill["level"] == "country"


def test_create_edit_and_permissions(c):
    bad = c.post("/api/records", json={"comments": "x"}, headers=H(ALPINES))
    assert bad.status_code == 422 and "year" in bad.json()["detail"]["missing"]
    r = c.post("/api/records", json=NEW, headers=H(ALPINES))
    assert r.status_code == 201, r.text
    rec = r.json()
    assert rec["region"] == "EMEA" and rec["cluster"] == "Mid-Size Markets"
    assert rec["tas"] == ["Oncology"] and rec["activity_level"] == "Local"
    assert "Quarterly Safety Views" in rec["topics"] and rec["quality"]["band"] == "High"
    # outside scope
    assert c.post("/api/records", json={**NEW, "country": "Singapore"}, headers=H(ALPINES)).status_code == 403
    # EMEA head can only edit own records
    assert c.put(f"/api/records/{rec['id']}", json={"feedback": "x"}, headers=H(EMEA)).status_code == 403
    upd = c.put(f"/api/records/{rec['id']}", json={"feedback": ""}, headers=H(ALPINES)).json()
    assert upd["quality"]["score"] < rec["quality"]["score"]
    assert c.delete(f"/api/records/{rec['id']}", headers=H(ALPINES)).status_code == 403
    assert c.delete(f"/api/records/{rec['id']}", headers=H(ADMIN)).status_code == 200


def test_hot_topics_and_elsewhere(c):
    t = c.get("/api/hot-topics", headers=H(ALPINES)).json()
    assert t["topics"] and "elsewhere" in t
    g = c.get("/api/hot-topics", headers=H(ADMIN)).json()
    assert g["topics"][0]["name"] == "Quarterly Safety Views" and "elsewhere" not in g


def test_stakeholders_notifications_materials(c):
    s = c.get("/api/stakeholders", headers=H(ADMIN)).json()
    assert s[0]["code"] == "MAF"
    d = c.get("/api/stakeholders/Reg.", headers=H(ADMIN)).json()
    assert d["code"] == "Reg." and d["recent"]
    assert c.get("/api/stakeholders/CVT/IBVT", headers=H(ADMIN)).status_code == 200
    n = c.get("/api/notifications", headers=H(IMM)).json()
    kinds = {x["kind"] for x in n}
    assert "new_material" in kinds
    m = c.get("/api/materials", headers=H(IMM)).json()
    assert m[0]["relevant"] and "Immunology" in m[0]["ta"]
    rec = c.get("/api/materials/recommend?products=Tremfya").json()
    assert all("Tremfya" in x["products"] for x in rec)


def test_workflow(c):
    q = c.post("/api/requests", json={"title": "MAF asks about IRR frequency", "record_id": 10000}, headers=H(ADMIN)).json()
    assert q["stage"] == "logged" and q["ta"] == "Oncology"
    for stage in ("escalated", "follow_up", "resolved"):
        q = c.post(f"/api/requests/{q['id']}/advance", json={}, headers=H(ADMIN)).json()
        assert q["stage"] == stage
    assert c.post(f"/api/requests/{q['id']}/advance", json={}, headers=H(ADMIN)).status_code == 409


def test_views_reports_exports(c):
    v = c.post("/api/views", json={"name": "Onc Q4", "filters": {"ta": ["Oncology"]}}, headers=H(EMEA)).json()
    assert any(x["id"] == v["id"] for x in c.get("/api/views", headers=H(EMEA)).json())
    reps = c.get("/api/reports", headers=H(EMEA)).json()
    assert any(r["id"] == "R-EMEA" for r in reps)
    for fmt, magic in (("xlsx", b"PK"), ("pptx", b"PK"), ("pdf", b"%PDF")):
        r = c.get(f"/api/reports/R-EMEA/export?format={fmt}", headers=H(EMEA))
        assert r.status_code == 200 and r.content[:4].startswith(magic), fmt
    assert c.get("/api/export?format=xlsx&ta=Immunology", headers=H(IMM)).status_code == 200


def test_ask_ai_rules_fallback(c):
    r = c.post("/api/ai/chat", json={"message": "What were the main topics for Erleada in 2025?"}, headers=H(ADMIN)).json()
    assert r["engine"] == "rules"
    assert r["filters_used"]["products"] == ["Erleada"] and r["filters_used"]["year"] == ["2025"]
    assert r["facts"]["interactions"] > 0 and "Erleada" in r["filters_text"]
    r2 = c.post("/api/ai/chat", json={"message": "Summarise what MAF asked for in EMEA"}, headers=H(ALPINES)).json()
    assert all(x in r2["filters_used"] for x in ("stakeholders", "region"))


def test_assist(c):
    a = c.post("/api/assist", json={"comments": "Shared the Tremfya safety views with the MAF team; follow-up planned."},
               headers=H(ADMIN)).json()
    s = a["suggestions"]
    assert s["products"] == ["Tremfya"] and "Safety Views" in s["content"] and "MAF" in s["stakeholders"]
    assert s["activity_type"] == "Material" and s["follow_up"] == "Yes"
    assert a["quality_if_applied"]["score"] > a["quality"]["score"]


def test_assist_uses_model_and_validates(c, monkeypatch):
    import ai
    fake = ('{"suggestions": {"products": ["Ebola vaccine", "Carvykti"], "content": ["ICSR/AE/SS/Signal"], '
            '"stakeholders": ["MAF", "Nobody"], "activity_type": "Discussion", "impact_category": "Made up", '
            '"stakeholder_status": "New"}, "tips": ["Say which HCP asked"], "notes": "Ebola vaccine is not in the product list."}')
    monkeypatch.setattr(ai, "generate", lambda system, prompt, json_mode=False: (fake, "gemini"))
    a = c.post("/api/assist", json={"comments": "MAF discussed a CAR-T case", "activity_type": "Material"}, headers=H(ADMIN)).json()
    assert a["engine"] == "gemini"
    s = a["suggestions"]
    assert s["products"] == ["Carvykti"] and s["stakeholders"] == ["MAF"]   # invented values dropped
    assert "impact_category" not in s                                        # not an allowed value
    assert "activity_type" not in s                                          # user already filled it
    assert a["tips"] == ["Say which HCP asked"] and "Ebola" in a["notes"]
