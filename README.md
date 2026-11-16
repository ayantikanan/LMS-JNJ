# LMS Benefit-Risk Interaction Dashboard

J&J Local Medical Safety (LMS) Benefit-Risk Interaction Dashboard. It runs on the 199 real records from the
sample SharePoint export (cleaned and anonymized). Items still waiting on LMS stakeholder input are covered by demo data.

It lives next to the existing MedPulse demo and does not change it.

```
bridge-v2/
├── backend/                 FastAPI + SQLite (port 8010)
│   ├── app.py               all API endpoints
│   ├── analytics.py         filters, access scope, dashboard aggregates, hot topics, stakeholders, alerts
│   ├── ai.py                Ask AI, summaries, data-entry assist (Gemini → Ollama → rules)
│   ├── reports.py           Excel / PowerPoint / PDF export
│   ├── reference.py         reference data + derived fields (TA, activity level, topics, quality score)
│   ├── db.py                SQLite storage, seeding, reset
│   ├── data/
│   │   ├── seed_records.json    the 199 sample records, cleaned + anonymized (no employee names)
│   │   └── jnj_demo_data.json   DEMO data for the blocked items (see below)
│   ├── tools/
│   │   ├── build_seed.py        rebuild seed_records.json from the SharePoint export
│   │   └── make_demo_data.py    rebuild jnj_demo_data.json
│   └── tests/test_api.py    11 API tests
└── frontend/                Next.js 16 + React 19 + Tailwind 4 + ECharts (port 3000)
```

## Run it

Backend (from `bridge-v2/backend`):

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app:app --reload --port 8010
```

Frontend (from `bridge-v2/frontend`):

```powershell
npm install
npm run dev
```

Open http://localhost:3000 and pick a demo profile.

The database (`backend/data/bridge.db`) is created and seeded on first start. Reset it at any time with `python db.py --reset`.
Run the tests with `python -m pytest tests -q`.

### Optional settings (`backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `GOOGLE_API_KEY` | – | Gemini key for Ask AI, summaries and the form's AI assist. Also read from the parent repo's `.env` / `backend/.env`, so the MedPulse key is reused. Without it the app uses Ollama if running, else rules-based answers (always badged in the UI). Check `GET /api/ai/status` to see why it fell back. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL_NAME` | `http://localhost:11434` / `llama3.2` | Local model fallback |
| `BRIDGE_AI_DISABLED` | `0` | `1` = always rules-based (offline demos, tests) |
| `BRIDGE_REFERENCE_DATE` | `demo` | Date the alerts are calculated from. `demo` = 2026-04-30 (the sample data ends Jan 2026), `today`, or any ISO date |
| `CORS_ORIGINS` | `http://localhost:3000,...` | Frontend origins |

Frontend: `NEXT_PUBLIC_API_BASE` (default `http://127.0.0.1:8010`), see `frontend/.env.example`.

## Demo profiles

| Profile | Scope | What it shows |
|---|---|---|
| Sofie Brunner, LMS Lead Alpines | Local · Alpines · Oncology | Default view filtered to Oncology; can add/edit Alpines records; "discussed elsewhere" topics from other countries (counts only) |
| Dr. Lena Vogel, EMEA Safety Head | Regional · EMEA | Region drill starts at clusters; B/R request alerts; EMEA report |
| Dr. Marco Rinaldi, Global RML Immunology | Global · Immunology | Immunology default view, Immunology materials and requests |
| Mei Lin Tan, LMS Manager SEA | Regional · South East Asia cluster | Cluster-only data |
| LMS ID Team | Admin | Everything, can delete |

**Suggested walkthrough:**

1. Log in as Sofie. The pop-up alerts appear: stakeholder gap and new materials.
2. On PV Insights, click a donut slice or a bar. Every chart filters, and the filters stay as you move between pages.
3. Click a year to drill into its quarters, and use the list icon on a chart to see its records.
4. Go to **Add interaction**, type a comment, then use **Suggest from comments** and **Apply all**. Watch the quality score update, then save. The new record shows up in the dashboard and in **B/R requests**.
5. Open **Safety hot topics** (word cloud) and use **AI summary**.
6. Open **Stakeholders → MAF**.
7. In **Ask AI**, ask "What were the main safety topics for Erleada in 2025?".
8. In **Reports**, export the Alpines report as PowerPoint.
9. Log in as Lena and open **Statistics → Region-wise**. The chart starts at cluster level; drill into a cluster to see its countries.

## Demo data (`backend/data/jnj_demo_data.json`)

Placeholders for everything that is blocked on LMS input. **Replace them with the real lists before real use.**
Names marked "(demo)" are fictional.

| Key | Stands in for | Used by |
|---|---|---|
| `product_ta` | Product → therapeutic area list | TA filter, TA charts, profiles, workflow routing |
| `stakeholders` | Stakeholder full names, internal/external flag, gap-alert interval | Internal/External tiles, stakeholder pages, gap alerts |
| `activity_level_rules` | Definition of Activity Level | Activity Level filter/chart |
| `materials` | Local Medical Safety materials list (37 items, with date added) | Materials dropdown on the form, recommendations, "new material" alerts |
| `users`, `access_rules` | Roles and what each can see/edit | Demo profiles, server-side scoping |
| `workflow`, `workflow_requests` | Escalation contacts per TA, targets, 12 example requests | B/R request workflow |
| `kpi_options`, `record_demo_values` | KPI list + demo values on the 199 existing records | Value indicator fields and charts |
| `safety_topic_taxonomy` | Topic list for hot topics when no AI model is available | Hot topics, record topic tags |
| `help_text` | Text for the (i) icons | Data entry form |
| `quality_weights` | Data quality score weights | Quality score |
| `reports` | Example personalised reports | Reports page |

## Requirement coverage

| Requirement | Where |
|---|---|
| Data entry form with the current fields, "Please save your entries", save | Add interaction (`/records/new`) |
| Filter & edit existing records | Details (`/records`), record page; edit rights per role |
| KPI tiles, trend, region, stakeholder, activity type, content charts | PV Insights (`/`), Statistics |
| Interactive charts | Hover tooltips, click to cross-filter, year→quarter and region→cluster→country drill, records behind any chart, legend toggles, save as image |
| Filter pane (Product/TA, TA, Title, Activity Level, Stakeholder Request, Material for external use, …) | Right-hand pane; filters stay applied across pages |
| Saved / re-usable views | Filter pane → Saved views |
| User profile driving the default view | My profile; dashboards open filtered to the user's TAs/products |
| Safety hot topics from Comments (word cloud) | Safety hot topics |
| Topics discussed elsewhere on the same product | Hot topics → "Discussed elsewhere" (counts only for local users) |
| LMS materials dropdown + recommendations | Form field + side panel; LMS materials page |
| Pop-ups: new material, stakeholder gap ("3 months since MAF") | Login pop-up + bell |
| B/R request workflow (log → escalate → follow-up → resolved) | B/R requests board; can be logged straight from the form |
| KPI / value fields (new/established, follow-up, impact, outcomes) | Form + Value indicators charts (demo values on existing records) |
| Data quality score | Live on the form, per record, dashboard tile, alerts |
| Stakeholder-centric pages | Stakeholders |
| Tailored reports, export Excel / PowerPoint / PDF | Reports & export; only data the user may see |
| Ask AI | Ask AI: answers from the filtered data, numbers computed by the app, sources linked |
| AI support for data entry | "Suggest from comments" on the form |

## Known limitations of the POC

- Sign-in is a demo profile picker. A real build needs J&J SSO, and roles managed by an admin.
- Hot-topic tagging is rules-based (keyword taxonomy). Ask AI, summaries and the form's AI assist use the AI model when one is configured, and fall back to rules otherwise. AI assist suggestions are checked against the allowed dropdown values, so the model can't invent products or stakeholders.
- With 199 records, some charts get thin when several filters are combined.
- The Training & Education tile stays blank because the sample only has PV Insights records.
- New records get the real timestamp, while alerts use the demo date (2026-04-30), so a new record can show as "0 days ago".
