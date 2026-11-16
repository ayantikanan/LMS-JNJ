"""Report export: Excel, PowerPoint (native, editable charts) and PDF."""

from __future__ import annotations

import io
from datetime import date
from typing import Any, Dict, List

import analytics
import ai

PURPLE = (0x4B, 0x0F, 0xA8)
RED = (0xC8, 0x10, 0x2E)
ACT_COLORS = {"Discussion": (0xF5, 0xA0, 0x0B), "Material": (0x8A, 0x1C, 0xC9), "Presentation": (0x26, 0xA6, 0xA6)}

SECTIONS_ALL = ["kpis", "trend", "stakeholders", "content", "hot_topics", "ai_summary", "records"]


def build_payload(title: str, records: List[dict], f: analytics.Filters, sections: List[str] | None = None,
                  audience: str = "") -> Dict[str, Any]:
    sections = sections or SECTIONS_ALL
    return {
        "title": title,
        "audience": audience,
        "filters_text": ai.describe(f),
        "generated": date.today().isoformat(),
        "sections": sections,
        "dash": analytics.dashboard(records, f),
        "topics": analytics.hot_topics(records) if "hot_topics" in sections else None,
        "summary": ai.summary(records, f"{title} ({ai.describe(f)})") if "ai_summary" in sections else None,
        "records": sorted(records, key=lambda r: r.get("created", ""), reverse=True),
    }


# ---- Excel ---------------------------------------------------------------------------------------

def to_xlsx(p: Dict[str, Any]) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill

    wb = Workbook()
    head = Font(bold=True, color="FFFFFF")
    fill = PatternFill("solid", fgColor="4B0FA8")

    def header(ws, row: List[str]) -> None:
        ws.append(row)
        for cell in ws[ws.max_row]:
            cell.font, cell.fill = head, fill

    ws = wb.active
    ws.title = "Summary"
    ws.append([p["title"]])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([f"Filters: {p['filters_text']}"])
    ws.append([f"Generated: {p['generated']}"])
    ws.append([])
    t = p["dash"]["tiles"]
    header(ws, ["Indicator", "Value"])
    for k, v in [("Interactions", t["total"]), ("Discussions", t["discussion"]), ("Presentations", t["presentation"]),
                 ("Materials", t["material"]), ("Internal stakeholder activities %", t["internal_pct"]),
                 ("External stakeholder activities %", t["external_pct"]), ("Average data quality", t["avg_quality"]),
                 ("Follow-ups planned %", t["follow_up_pct"]), ("Stakeholder requests", t["stakeholder_requests"])]:
        ws.append([k, v])
    if p.get("summary"):
        ws.append([])
        ws.append([f"Summary ({p['summary']['engine']})"])
        for line in p["summary"]["text"].splitlines():
            ws.append([line])
    ws.column_dimensions["A"].width = 60

    d = p["dash"]
    ws = wb.create_sheet("Trend")
    header(ws, ["Period", "Interactions"])
    for per, c in zip(d["evolution"]["periods"], d["evolution"]["counts"]):
        ws.append([per, c])
    ws = wb.create_sheet("Stakeholders")
    header(ws, ["Function", "Name", "Type", "Interactions", "% of interactions"])
    for s in d["stakeholders"]:
        ws.append([s["code"], s["name"], s["type"], s["count"], s["pct"]])
    ws = wb.create_sheet("Content")
    header(ws, ["Content", "Discussion", "Material", "Presentation"])
    for i, c in enumerate(d["content"]["categories"]):
        ws.append([c] + [d["content"]["series"][a][i] for a in ("Discussion", "Material", "Presentation")])
    if p.get("topics"):
        ws = wb.create_sheet("Hot topics")
        header(ws, ["Topic", "Interactions", "Countries", "Main products"])
        for tp in p["topics"]["topics"]:
            ws.append([tp["name"], tp["count"], tp["countries"], ", ".join(tp["products"])])

    ws = wb.create_sheet("Records")
    cols = ["id", "year", "quarter", "region", "cluster", "country", "activity_level", "activity_type", "content",
            "products", "tas", "stakeholders", "stakeholder_request", "material_external", "product_launch",
            "specific_icsr", "comments", "feedback", "stakeholder_status", "follow_up", "impact_category", "outcomes",
            "materials", "topics", "quality_score", "created_date"]
    header(ws, cols)
    for r in p["records"]:
        row = []
        for c in cols:
            v = (r.get("quality") or {}).get("score") if c == "quality_score" else r.get(c)
            row.append("; ".join(map(str, v)) if isinstance(v, list) else v)
        ws.append(row)
    for cell in ws["Q"]:
        cell.alignment = Alignment(wrap_text=True, vertical="top")
    ws.column_dimensions["Q"].width = 80
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ---- PowerPoint -------------------------------------------------------------------------------------

def to_pptx(p: Dict[str, Any]) -> bytes:
    from pptx import Presentation
    from pptx.chart.data import CategoryChartData
    from pptx.dml.color import RGBColor
    from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
    from pptx.util import Inches, Pt

    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
    blank = prs.slide_layouts[6]
    d = p["dash"]

    def text(slide, s, x, y, w, h, size=14, bold=False, color=(0x22, 0x22, 0x22)):
        tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
        tf = tb.text_frame
        tf.word_wrap = True
        for i, line in enumerate(s.split("\n")):
            para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            para.text = line
            para.font.size, para.font.bold = Pt(size), bold
            para.font.color.rgb = RGBColor(*color)
        return tb

    def bar(slide, h=0.12):
        shp = slide.shapes.add_shape(1, 0, 0, prs.slide_width, Inches(h))
        shp.fill.solid()
        shp.fill.fore_color.rgb = RGBColor(*PURPLE)
        shp.line.fill.background()

    def titled(title):
        s = prs.slides.add_slide(blank)
        bar(s)
        text(s, title, 0.5, 0.3, 12, 0.7, 26, True, PURPLE)
        return s

    # title
    s = prs.slides.add_slide(blank)
    bar(s, 0.35)
    text(s, "LMS Benefit-Risk Interaction Dashboard", 0.8, 2.2, 11.5, 0.6, 18, False, RED)
    text(s, p["title"], 0.8, 2.8, 11.5, 1.2, 36, True, PURPLE)
    text(s, f"{p['audience'] + ' · ' if p['audience'] else ''}Filters: {p['filters_text']}\nGenerated {p['generated']}",
         0.8, 4.2, 11.5, 1, 14)

    if "kpis" in p["sections"]:
        s = titled("Key indicators")
        t = d["tiles"]
        tiles = [("Interactions", t["total"]), ("Discussions", t["discussion"]), ("Presentations", t["presentation"]),
                 ("Materials", t["material"]), ("Internal stakeholders", f"{t['internal_pct']}%"),
                 ("External stakeholders", f"{t['external_pct']}%"), ("Avg data quality", t["avg_quality"]),
                 ("Follow-ups planned", f"{t['follow_up_pct']}%")]
        for i, (k, v) in enumerate(tiles):
            x, y = 0.6 + (i % 4) * 3.1, 1.6 + (i // 4) * 2.4
            box = s.shapes.add_shape(1, Inches(x), Inches(y), Inches(2.8), Inches(2.0))
            box.fill.solid()
            box.fill.fore_color.rgb = RGBColor(0xF3, 0xEE, 0xFB)
            box.line.color.rgb = RGBColor(*PURPLE)
            text(s, str(v), x + 0.2, y + 0.3, 2.4, 0.9, 32, True, PURPLE)
            text(s, k, x + 0.2, y + 1.2, 2.4, 0.6, 14)

    if "trend" in p["sections"] and d["evolution"]["periods"]:
        s = titled("Evolution of PV Insights activities")
        cd = CategoryChartData()
        cd.categories = d["evolution"]["periods"]
        for a in ("Discussion", "Material", "Presentation"):
            cd.add_series(a, d["evolution"]["by_period_activity"][a])
        ch = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_STACKED, Inches(0.5), Inches(1.2), Inches(8), Inches(5.8), cd).chart
        ch.has_legend, ch.legend.position, ch.legend.include_in_layout = True, XL_LEGEND_POSITION.BOTTOM, False
        for ser, a in zip(ch.series, ("Discussion", "Material", "Presentation")):
            ser.format.fill.solid()
            ser.format.fill.fore_color.rgb = RGBColor(*ACT_COLORS[a])
        cd2 = CategoryChartData()
        cd2.categories = [x["name"] for x in d["activity_type"]]
        cd2.add_series("Activity type", [x["count"] for x in d["activity_type"]])
        ch2 = s.shapes.add_chart(XL_CHART_TYPE.DOUGHNUT, Inches(8.7), Inches(1.4), Inches(4.3), Inches(4.5), cd2).chart
        ch2.has_legend, ch2.legend.position = True, XL_LEGEND_POSITION.BOTTOM
        for pt, x in zip(ch2.plots[0].series[0].points, d["activity_type"]):
            pt.format.fill.solid()
            pt.format.fill.fore_color.rgb = RGBColor(*ACT_COLORS[x["name"]])

    if "stakeholders" in p["sections"] and d["stakeholders"]:
        s = titled("PV Insights per stakeholder function")
        rows = d["stakeholders"][:12][::-1]
        cd = CategoryChartData()
        cd.categories = [r["code"] for r in rows]
        cd.add_series("% of interactions", [r["pct"] for r in rows])
        ch = s.shapes.add_chart(XL_CHART_TYPE.BAR_CLUSTERED, Inches(0.5), Inches(1.2), Inches(12.3), Inches(5.9), cd).chart
        ch.has_legend, ch.has_title = False, False
        ch.plots[0].has_data_labels = True
        ch.series[0].format.fill.solid()
        ch.series[0].format.fill.fore_color.rgb = RGBColor(0xC0, 0x1C, 0x9E)

    if "content" in p["sections"] and d["content"]["categories"]:
        s = titled("Contents per activity type")
        cd = CategoryChartData()
        cats = d["content"]["categories"][::-1]
        cd.categories = cats
        for a in ("Discussion", "Material", "Presentation"):
            cd.add_series(a, d["content"]["series"][a][::-1])
        ch = s.shapes.add_chart(XL_CHART_TYPE.BAR_STACKED, Inches(0.5), Inches(1.2), Inches(12.3), Inches(5.9), cd).chart
        ch.has_legend, ch.legend.position, ch.legend.include_in_layout = True, XL_LEGEND_POSITION.BOTTOM, False
        for ser, a in zip(ch.series, ("Discussion", "Material", "Presentation")):
            ser.format.fill.solid()
            ser.format.fill.fore_color.rgb = RGBColor(*ACT_COLORS[a])

    if p.get("topics") and p["topics"]["topics"]:
        s = titled("Safety hot topics")
        rows = p["topics"]["topics"][:10][::-1]
        cd = CategoryChartData()
        cd.categories = [r["name"] for r in rows]
        cd.add_series("Interactions", [r["count"] for r in rows])
        ch = s.shapes.add_chart(XL_CHART_TYPE.BAR_CLUSTERED, Inches(0.5), Inches(1.2), Inches(12.3), Inches(5.9), cd).chart
        ch.has_legend, ch.has_title = False, False
        ch.plots[0].has_data_labels = True
        ch.series[0].format.fill.solid()
        ch.series[0].format.fill.fore_color.rgb = RGBColor(*PURPLE)

    if p.get("summary"):
        s = titled(f"Summary ({'AI: ' + p['summary']['engine'] if p['summary']['engine'] != 'rules' else 'rules-based'})")
        body = "\n".join(("• " + l.strip()[2:]) if l.strip().startswith("- ") else l for l in p["summary"]["text"].replace("**", "").splitlines())
        text(s, body, 0.6, 1.3, 12, 5.8, 16)

    if "records" in p["sections"]:
        s = titled("Recent interactions")
        rows = p["records"][:8]
        tbl = s.shapes.add_table(len(rows) + 1, 4, Inches(0.5), Inches(1.2), Inches(12.3), Inches(5.8)).table
        for j, h in enumerate(["Period", "Country", "Product", "Comment"]):
            tbl.cell(0, j).text = h
        for i, r in enumerate(rows, start=1):
            vals = [analytics.period_key(r), r.get("country", ""), ", ".join(r.get("products") or []), (r.get("comments") or "")[:180]]
            for j, v in enumerate(vals):
                tbl.cell(i, j).text = v
                for para in tbl.cell(i, j).text_frame.paragraphs:
                    para.font.size = Pt(10)
        for j, w in enumerate([1.3, 1.6, 2.2, 7.2]):
            tbl.columns[j].width = Inches(w)

    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


# ---- PDF ---------------------------------------------------------------------------------------------

def to_pdf(p: Dict[str, Any]) -> bytes:
    from reportlab.graphics.charts.barcharts import HorizontalBarChart, VerticalBarChart
    from reportlab.graphics.charts.piecharts import Pie
    from reportlab.graphics.shapes import Drawing, String
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    purple = colors.Color(*(c / 255 for c in PURPLE))
    act = {a: colors.Color(*(c / 255 for c in v)) for a, v in ACT_COLORS.items()}
    st = getSampleStyleSheet()
    h1 = st["Title"].clone("h1", textColor=purple, alignment=0)
    h2 = st["Heading2"].clone("h2", textColor=purple)
    body = st["BodyText"]
    small = body.clone("small", fontSize=8, leading=10)
    d = p["dash"]
    story: List[Any] = [Paragraph(p["title"], h1),
                        Paragraph(f"Filters: {p['filters_text']} &middot; Generated {p['generated']}", small),
                        Spacer(1, 10)]

    if "kpis" in p["sections"]:
        t = d["tiles"]
        data = [["Interactions", "Discussions", "Presentations", "Materials", "Internal", "External", "Avg quality"],
                [t["total"], t["discussion"], t["presentation"], t["material"], f"{t['internal_pct']}%", f"{t['external_pct']}%", t["avg_quality"]]]
        tb = Table(data, colWidths=[2.4 * cm] * 7)
        tb.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), purple), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                                ("FONTSIZE", (0, 0), (-1, 0), 8), ("FONTSIZE", (0, 1), (-1, 1), 14),
                                ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("BOX", (0, 0), (-1, -1), 0.5, purple)]))
        story += [tb, Spacer(1, 12)]

    if p.get("summary"):
        story.append(Paragraph(f"Summary ({p['summary']['engine']})", h2))
        for line in p["summary"]["text"].replace("**", "").splitlines():
            if line.strip():
                story.append(Paragraph(line.strip().lstrip("-• ").strip(), body, bulletText="•" if line.strip()[:1] in "-•" else None))
        story.append(Spacer(1, 8))

    if "trend" in p["sections"] and d["evolution"]["periods"]:
        story.append(Paragraph("Evolution of PV Insights activities", h2))
        dr = Drawing(16 * cm, 6.5 * cm)
        bc = VerticalBarChart()
        bc.x, bc.y, bc.width, bc.height = 30, 30, 15 * cm - 40, 5 * cm
        bc.data = [d["evolution"]["counts"]]
        bc.categoryAxis.categoryNames = d["evolution"]["periods"]
        bc.categoryAxis.labels.fontSize, bc.categoryAxis.labels.angle, bc.categoryAxis.labels.dy = 6, 30, -8
        bc.valueAxis.valueMin = 0
        bc.bars[0].fillColor = purple
        dr.add(bc)
        story.append(dr)
        dr = Drawing(16 * cm, 5 * cm)
        pie = Pie()
        pie.x, pie.y, pie.width, pie.height = 40, 10, 4 * cm, 4 * cm
        items = [x for x in d["activity_type"] if x["count"]]
        pie.data = [x["count"] for x in items]
        pie.labels = [f"{x['name']} {x['pct']}%" for x in items]
        for i, x in enumerate(items):
            pie.slices[i].fillColor = act[x["name"]]
        dr.add(pie)
        dr.add(String(8 * cm, 4 * cm, "Activity type split", fontSize=10, fillColor=purple))
        story.append(dr)

    def hbar(title: str, labels: List[str], values: List[float], color) -> None:
        if not labels:
            return
        story.append(Paragraph(title, h2))
        h = max(3, 0.55 * len(labels)) * cm
        dr = Drawing(16 * cm, h + 20)
        bc = HorizontalBarChart()
        bc.x, bc.y, bc.width, bc.height = 150, 10, 16 * cm - 170, h
        bc.data = [values[::-1]]
        bc.categoryAxis.categoryNames = [l[:38] for l in labels[::-1]]
        bc.categoryAxis.labels.fontSize = 7
        bc.valueAxis.valueMin = 0
        bc.bars[0].fillColor = color
        bc.barLabelFormat, bc.barLabels.fontSize, bc.barLabels.nudge = "%s", 6, 8
        dr.add(bc)
        story.append(dr)

    if "stakeholders" in p["sections"]:
        rows = d["stakeholders"][:12]
        hbar("PV Insights per stakeholder function (% of interactions)", [r["code"] for r in rows], [r["pct"] for r in rows],
             colors.Color(0.75, 0.11, 0.62))
    if p.get("topics"):
        rows = p["topics"]["topics"][:10]
        hbar("Safety hot topics (interactions)", [r["name"] for r in rows], [r["count"] for r in rows], purple)

    if "records" in p["sections"]:
        story.append(Paragraph("Recent interactions", h2))
        data = [["Period", "Country", "Product", "Comment"]]
        for r in p["records"][:15]:
            data.append([analytics.period_key(r), Paragraph(r.get("country", ""), small),
                         Paragraph(", ".join(r.get("products") or []), small), Paragraph((r.get("comments") or "")[:260], small)])
        tb = Table(data, colWidths=[2 * cm, 2.5 * cm, 3 * cm, 9.5 * cm], repeatRows=1)
        tb.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), purple), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                                ("FONTSIZE", (0, 0), (-1, -1), 7), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                                ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey)]))
        story.append(tb)

    buf = io.BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.5 * cm, rightMargin=1.5 * cm, topMargin=1.5 * cm,
                      bottomMargin=1.5 * cm, title=p["title"]).build(story)
    return buf.getvalue()
