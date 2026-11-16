"""LMS Benefit-Risk Interaction Dashboard - FastAPI app.

Run:  uvicorn app:app --reload --port 8010   (from backend/)

Demo auth: the frontend sends the selected demo user's id in the `X-Bridge-User` header.
Every endpoint filters data server-side to that user's access scope.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import Body, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

import ai
import analytics
import db
import reports
from reference import now_iso, quality_score, ref
from settings import settings

@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init_db()
    yield


app = FastAPI(title="LMS Benefit-Risk Interaction Dashboard", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"], expose_headers=["Content-Disposition"])


# ---- helpers ------------------------------------------------------------------------------------

def current_user(request: Request) -> dict:
    uid = request.headers.get("x-bridge-user") or request.query_params.get("user")
    user = db.get_doc("users", uid) if uid else None
    if not user:
        raise HTTPException(401, "Select a demo user first (X-Bridge-User header).")
    return user


def filters_from(request: Request) -> analytics.Filters:
    return analytics.parse_filters(dict(request.query_params))


def scoped(user: dict) -> List[dict]:
    return analytics.visible(user, db.records())


def _record_out(user: dict, r: dict) -> dict:
    return {**r, "can_edit": analytics.can_edit(user, r)}


def _region_for(country: str) -> tuple[str, str]:
    for region, clusters in ref().hierarchy.items():
        for cluster, countries in clusters.items():
            if country in countries:
                return region, cluster
    return "", ""


EDITABLE = ["title", "year", "quarter", "region", "cluster", "country", "activity_type", "content", "specific_icsr",
            "stakeholder_request", "stakeholders", "products", "comments", "feedback", "material_external",
            "product_launch", "materials", "stakeholder_status", "follow_up", "impact_category", "outcomes"]
LIST_FIELDS = {"content", "stakeholders", "products", "materials", "outcomes"}


def _clean(payload: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for k in EDITABLE:
        if k not in payload:
            continue
        v = payload[k]
        if k in LIST_FIELDS:
            v = [str(x).strip() for x in (v or []) if str(x).strip()]
        else:
            v = "" if v is None else str(v).strip()
        out[k] = v
    if out.get("country"):
        # region and cluster always follow the country, so the hierarchy stays consistent
        region, cluster = _region_for(out["country"])
        if region:
            out["region"], out["cluster"] = region, cluster
    return out


def _validate(rec: dict) -> None:
    required = ref().quality["required"]
    missing = [f for f in required if not rec.get(f)]
    if missing:
        raise HTTPException(422, {"message": "Please complete the required fields.", "missing": missing})
    region, cluster = _region_for(rec["country"])
    if region and (rec["region"] != region or rec["cluster"] != cluster):
        raise HTTPException(422, {"message": f"{rec['country']} belongs to {region} / {cluster}.",
                                  "missing": ["region", "cluster"]})


# ---- users & profile ------------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"ok": True, "reference_date": ref().reference_date().isoformat()}


@app.get("/api/users")
def users():
    return db.all_docs("users")


@app.get("/api/me")
def me(user: dict = Depends(current_user)):
    return {**user, "default_filters": analytics.default_filters(user),
            "access_rule": ref().demo["access_rules"].get(user["scope_level"], ""),
            "edit_rule": ref().demo["access_rules"]["edit"].get(user.get("can_edit", ""), "")}


class ProfileIn(BaseModel):
    title: Optional[str] = None
    role: Optional[str] = None
    scope_level: Optional[str] = None
    regions: Optional[List[str]] = None
    clusters: Optional[List[str]] = None
    countries: Optional[List[str]] = None
    tas: Optional[List[str]] = None
    products: Optional[List[str]] = None


@app.put("/api/me")
def update_profile(body: ProfileIn, user: dict = Depends(current_user)):
    changes = body.model_dump(exclude_none=True)
    if changes.get("scope_level") and changes["scope_level"] not in ("Local", "Regional", "Global"):
        raise HTTPException(422, "scope_level must be Local, Regional or Global")
    user.update(changes)
    db.put_doc("users", user["id"], user)
    return me(user)


@app.get("/api/reference")
def reference():
    r = ref()
    data_refreshed = max((x.get("modified") or x.get("created") or "") for x in db.records())
    return {
        "dropdowns": r.dropdowns(),
        "help_text": r.help_text,
        "materials": [{k: v for k, v in m.items() if k != "keywords"} for m in r.materials],
        "workflow": r.workflow,
        "reference_date": r.reference_date().isoformat(),
        "data_refreshed": data_refreshed,
        "product_ta": r.product_ta,
        "quality_weights": r.quality,
        "demo_note": r.demo["_about"],
    }


# ---- records --------------------------------------------------------------------------------------

@app.get("/api/records")
def list_records(request: Request, page: int = 1, size: int = 25, sort: str = "-created",
                 user: dict = Depends(current_user)):
    recs = analytics.apply(scoped(user), filters_from(request))
    key = sort.lstrip("-")
    reverse = sort.startswith("-")
    recs.sort(key=lambda r: ((r.get("quality") or {}).get("score", 0) if key == "quality" else str(r.get(key, ""))), reverse=reverse)
    total = len(recs)
    start = max(0, (page - 1) * size)
    return {"total": total, "page": page, "size": size,
            "items": [_record_out(user, r) for r in recs[start:start + size]]}


@app.get("/api/records/{rid}")
def get_record(rid: int, user: dict = Depends(current_user)):
    r = db.get_doc("records", rid)
    if not r or not analytics.in_scope(user, r):
        raise HTTPException(404, "Record not found or outside your access scope")
    return _record_out(user, r)


@app.post("/api/records", status_code=201)
def create_record(payload: Dict[str, Any] = Body(...), user: dict = Depends(current_user)):
    rec = {k: ([] if k in LIST_FIELDS else "") for k in EDITABLE}
    rec.update(_clean(payload))
    rec["title"] = rec.get("title") or "PV Insights"
    _validate(rec)
    if not analytics.in_scope(user, rec) and not user.get("is_admin"):
        raise HTTPException(403, "You can only add records for countries in your access scope")
    ts = now_iso()
    rec.update(id=db.next_record_id(), created=ts, modified=ts, created_by=user["name"], modified_by=user["name"],
               owner=user["id"], demo_values=False)
    return _record_out(user, db.save_record(rec))


@app.put("/api/records/{rid}")
def update_record(rid: int, payload: Dict[str, Any] = Body(...), user: dict = Depends(current_user)):
    rec = db.get_doc("records", rid)
    if not rec or not analytics.in_scope(user, rec):
        raise HTTPException(404, "Record not found")
    if not analytics.can_edit(user, rec):
        raise HTTPException(403, "You don't have permission to edit this record")
    rec.update(_clean(payload))
    _validate(rec)
    rec.update(modified=now_iso(), modified_by=user["name"])
    return _record_out(user, db.save_record(rec))


@app.delete("/api/records/{rid}")
def delete_record(rid: int, user: dict = Depends(current_user)):
    if not user.get("is_admin"):
        raise HTTPException(403, "Only administrators can delete records")
    db.delete_doc("records", rid)
    return {"deleted": rid}


@app.post("/api/quality")
def quality(payload: Dict[str, Any] = Body(...)):
    return quality_score(payload)


@app.post("/api/assist")
def assist(payload: Dict[str, Any] = Body(...), user: dict = Depends(current_user)):
    return ai.assist(payload)


# ---- dashboard ----------------------------------------------------------------------------------------

@app.get("/api/dashboard")
def dashboard(request: Request, user: dict = Depends(current_user)):
    f = filters_from(request)
    recs = analytics.apply(scoped(user), f)
    return {**analytics.dashboard(recs, f), "filters": f}


@app.get("/api/hot-topics")
def hot_topics(request: Request, user: dict = Depends(current_user)):
    f = filters_from(request)
    mine = analytics.apply(scoped(user), f)
    others = None
    if user.get("scope_level") != "Global" and not user.get("is_admin"):
        # topics only (no record detail) from outside the user's scope, on the same products / TAs
        focus = {k: v for k, v in f.items() if k in ("products", "ta", "year", "quarter", "topic")} or analytics.default_filters(user)
        others = analytics.apply([r for r in db.records() if not analytics.in_scope(user, r)], focus)
    return analytics.hot_topics(mine, others)


@app.post("/api/hot-topics/summary")
def hot_topics_summary(request: Request, user: dict = Depends(current_user)):
    f = filters_from(request)
    recs = analytics.apply(scoped(user), f)
    return ai.summary(recs, f"safety hot topics for {ai.describe(f)}")


# ---- stakeholders -------------------------------------------------------------------------------------

@app.get("/api/stakeholders")
def stakeholders(request: Request, user: dict = Depends(current_user)):
    recs = analytics.apply(scoped(user), filters_from(request))
    return analytics.stakeholder_overview(recs)


@app.get("/api/stakeholders/{code:path}")
def stakeholder(code: str, request: Request, user: dict = Depends(current_user)):
    recs = analytics.apply(scoped(user), filters_from(request))
    detail = analytics.stakeholder_detail(code, recs, _requests_for(user))
    if not detail:
        raise HTTPException(404, f"Unknown stakeholder function {code!r}")
    return detail


# ---- notifications & materials ------------------------------------------------------------------------------

@app.get("/api/notifications")
def notifications(user: dict = Depends(current_user)):
    items = analytics.notifications(user, scoped(user), _requests_for(user))
    gone = db.dismissed(user["id"])
    return [{**n, "dismissed": n["id"] in gone} for n in items]


@app.post("/api/notifications/{nid:path}/dismiss")
def dismiss(nid: str, user: dict = Depends(current_user)):
    db.dismiss(user["id"], nid)
    return {"ok": True}


@app.get("/api/materials")
def materials(user: dict = Depends(current_user)):
    return analytics.materials_for(user, db.records())


@app.get("/api/materials/recommend")
def recommend(products: str = "", content: str = ""):
    return analytics.recommend_materials([p for p in products.split("|") if p], [c for c in content.split("|") if c])


# ---- Benefit-Risk request workflow ---------------------------------------------------------------------------

def _requests_for(user: dict) -> List[dict]:
    out = []
    for q in db.all_docs("requests"):
        region, cluster = _region_for(q.get("country", ""))
        if analytics.in_scope(user, {"country": q.get("country"), "region": region, "cluster": cluster}):
            out.append(q)
    return sorted(out, key=lambda q: q["id"], reverse=True)


@app.get("/api/requests")
def list_requests(user: dict = Depends(current_user)):
    return _requests_for(user)


class RequestIn(BaseModel):
    title: str
    record_id: Optional[int] = None
    product: str = ""
    country: str = ""
    stakeholders: List[str] = []
    note: str = ""


@app.post("/api/requests", status_code=201)
def create_request(body: RequestIn, user: dict = Depends(current_user)):
    product, country, sh = body.product, body.country, body.stakeholders
    if body.record_id:
        rec = db.get_doc("records", body.record_id)
        if rec:
            product = product or (rec.get("products") or [""])[0]
            country = country or rec.get("country", "")
            sh = sh or rec.get("stakeholders", [])
    if not country:
        raise HTTPException(422, "country (or a record) is required")
    ta = ref().product_ta.get(product, "Cross-TA (General)")
    contacts = ref().workflow["escalation_contacts"]
    existing = [q["id"] for q in db.all_docs("requests")]
    nid = f"BR-{max([int(i.split('-')[1]) for i in existing] + [0]) + 1:03d}"
    q = {"id": nid, "record_id": body.record_id, "title": body.title.strip()[:160], "product": product, "ta": ta,
         "country": country, "stakeholders": sh,
         "assignee": (contacts.get(ta) or contacts["Cross-TA (General)"])[0], "stage": "logged",
         "events": [{"stage": "logged", "at": now_iso(), "by": user["name"], "note": body.note or "Request logged."}]}
    db.put_doc("requests", nid, q)
    return q


class AdvanceIn(BaseModel):
    note: str = ""
    assignee_index: Optional[int] = None


@app.post("/api/requests/{qid}/advance")
def advance_request(qid: str, body: AdvanceIn, user: dict = Depends(current_user)):
    q = db.get_doc("requests", qid)
    if not q:
        raise HTTPException(404, "Request not found")
    order = [s["id"] for s in ref().workflow["stages"]]
    if q["stage"] == "resolved":
        raise HTTPException(409, "Request is already resolved")
    nxt = order[order.index(q["stage"]) + 1]
    if nxt == "escalated" and body.assignee_index is not None:
        contacts = ref().workflow["escalation_contacts"].get(q["ta"]) or ref().workflow["escalation_contacts"]["Cross-TA (General)"]
        q["assignee"] = contacts[min(body.assignee_index, len(contacts) - 1)]
    default_notes = {"escalated": f"Escalated to {q['assignee']['name']} ({q['assignee']['role']}).",
                     "follow_up": "Response received; following up with the stakeholder.",
                     "resolved": "Stakeholder confirmed the query was resolved."}
    q["stage"] = nxt
    q["events"].append({"stage": nxt, "at": now_iso(), "by": user["name"], "note": body.note or default_notes[nxt]})
    db.put_doc("requests", qid, q)
    return q


# ---- saved views ------------------------------------------------------------------------------------------------

class ViewIn(BaseModel):
    name: str
    page: str = "/"
    filters: Dict[str, List[str]] = {}


@app.get("/api/views")
def list_views(user: dict = Depends(current_user)):
    return db.views_for(user["id"])


@app.post("/api/views", status_code=201)
def add_view(body: ViewIn, user: dict = Depends(current_user)):
    return db.add_view(user["id"], body.model_dump())


@app.delete("/api/views/{vid}")
def delete_view(vid: int, user: dict = Depends(current_user)):
    db.delete_view(user["id"], vid)
    return {"deleted": vid}


# ---- reports & export --------------------------------------------------------------------------------------------

class ReportIn(BaseModel):
    name: str
    audience: str = ""
    filters: Dict[str, List[str]] = {}
    sections: List[str] = reports.SECTIONS_ALL


@app.get("/api/reports")
def list_reports(user: dict = Depends(current_user)):
    return [r for r in db.all_docs("reports") if r.get("owner") == user["id"] or user.get("is_admin") or r.get("shared")]


@app.post("/api/reports", status_code=201)
def add_report(body: ReportIn, user: dict = Depends(current_user)):
    rid = f"R-{int(datetime.now().timestamp())}"
    doc = {"id": rid, "owner": user["id"], **body.model_dump()}
    db.put_doc("reports", rid, doc)
    return doc


@app.delete("/api/reports/{rid}")
def delete_report(rid: str, user: dict = Depends(current_user)):
    rep = db.get_doc("reports", rid)
    if rep and (rep.get("owner") == user["id"] or user.get("is_admin")):
        db.delete_doc("reports", rid)
    return {"deleted": rid}


MIME = {"xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "pdf": "application/pdf"}


def _export(title: str, f: analytics.Filters, fmt: str, user: dict, sections=None, audience: str = "") -> Response:
    if fmt not in MIME:
        raise HTTPException(422, "format must be xlsx, pptx or pdf")
    recs = analytics.apply(scoped(user), f)  # reports only ever contain what this user may see
    payload = reports.build_payload(title, recs, f, sections, audience)
    data = {"xlsx": reports.to_xlsx, "pptx": reports.to_pptx, "pdf": reports.to_pdf}[fmt](payload)
    safe = "".join(c if c.isalnum() or c in "-_ " else "_" for c in title).strip().replace(" ", "_") or "report"
    return Response(data, media_type=MIME[fmt], headers={"Content-Disposition": f'attachment; filename="{safe}.{fmt}"'})


@app.get("/api/reports/{rid}/export")
def export_report(rid: str, format: str = "pptx", user: dict = Depends(current_user)):
    rep = db.get_doc("reports", rid)
    if not rep:
        raise HTTPException(404, "Report not found")
    return _export(rep["name"], rep.get("filters") or {}, format, user, rep.get("sections"), rep.get("audience", ""))


@app.get("/api/export")
def export_view(request: Request, format: str = "xlsx", title: str = "PV Insights view", user: dict = Depends(current_user)):
    return _export(title, filters_from(request), format, user)


# ---- Ask AI ---------------------------------------------------------------------------------------------------------

class ChatIn(BaseModel):
    message: str
    filters: Dict[str, List[str]] = {}


@app.get("/api/ai/status")
def ai_status():
    return ai.status()


@app.post("/api/ai/chat")
def ai_chat(body: ChatIn, user: dict = Depends(current_user)):
    if not body.message.strip():
        raise HTTPException(422, "message is required")
    return ai.chat(body.message, scoped(user), body.filters)
