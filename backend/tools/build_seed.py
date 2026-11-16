"""Build the anonymized, cleaned seed file from the SharePoint export.

Usage (from backend/):
    python tools/build_seed.py "path/to/Sample_data_with_random_comments.xlsx"

Output: data/seed_records.json

What it does
- keeps only real records (rows with a Title); the export also contains ~10k blank rows
  and ~1k stray Feedback cells that are not attached to any record
- normalises values: YES/Yes/NO/No, "Aggreg. reports" vs "Aggreg. Reports",
  multi-value separators (";#" and ", "), Year stored as a decimal
- replaces employee names in Created By / Modified By with "LMS User NN"
  (no real names are written to the output file)
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pandas as pd

OUT = Path(__file__).resolve().parent.parent / "data" / "seed_records.json"

CONTENT_CANON = {
    "aggreg. reports": "Aggreg. Reports",
    "clinical trials & other studies": "Clinical Trials & Other Studies",
    "rmp & (c)armas": "RMP & (C)ARMAs",
    "safety views": "Safety Views",
    "other safety insights": "Other Safety Insights",
    "core lms material": "Core LMS Material",
    "lms education": "LMS Education",
    "icsr/ae/ss/signal": "ICSR/AE/SS/Signal",
    "external safety data": "External Safety Data",
}


def text(v) -> str:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    return str(v).strip()


def multi(v, comma: bool = False) -> list[str]:
    s = text(v)
    if not s:
        return []
    parts = re.split(r";#|;" + (r"|," if comma else ""), s)
    out: list[str] = []
    for p in parts:
        p = p.strip()
        if p and p not in out:
            out.append(p)
    return out


def yes_no(v) -> str:
    s = text(v).upper()
    return {"YES": "Yes", "NO": "No", "N/A": "N/A"}.get(s, "")


def iso(v) -> str:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    return pd.Timestamp(v).isoformat(timespec="seconds")


def main(xlsx: str) -> None:
    # keep_default_na=False so a literal "N/A" is kept as a value, not read as blank
    df = pd.read_excel(xlsx, keep_default_na=False, na_values=[""])
    df = df[df["Title"].notna()].copy()
    df = df.sort_values("Created")

    people: dict[str, str] = {}

    def anon(name) -> str:
        n = text(name)
        if not n:
            return ""
        if n not in people:
            people[n] = f"LMS User {len(people) + 1:02d}"
        return people[n]

    rows = []
    for _, r in df.iterrows():
        content = [CONTENT_CANON.get(c.lower(), c) for c in multi(r["Content"])]
        rows.append({
            "id": int(r["ID"]),
            "title": text(r["Title"]),
            "region": text(r["Region"]),
            "cluster": text(r["Cluster / Sub Region"]),
            "country": text(r["Country/Location/Territory"]),
            "year": str(int(r["Year"])) if text(r["Year"]) else "",
            "quarter": text(r["Quarter"]),
            "activity_type": text(r["Activity Type"]),
            "content": list(dict.fromkeys(content)),
            "specific_icsr": text(r["Specific ICSR/AE/SS/Signal"]),
            "stakeholder_request": yes_no(r["Stakeholder Request"]),
            "stakeholders": multi(r["Stakeholder(s)"], comma=True),
            "products": multi(r["Product/TA"]),
            "comments": text(r["Comments (optional)"]),
            "feedback": text(r["Feedback"]),
            "material_external": yes_no(r["Material for external use?"]),
            "product_launch": yes_no(r["Related to product launch/line ext.?"]),
            "created": iso(r["Created"]),
            "created_by": anon(r["Created By"]),
            "modified": iso(r["Modified"]),
            "modified_by": anon(r["Modified By"]),
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "source": "SharePoint export 'Test PV Insights Data' (sample), cleaned and anonymized",
        "record_count": len(rows),
        "records": rows,
    }, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {len(rows)} records -> {OUT}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
