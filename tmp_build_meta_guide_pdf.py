"""Generate updated Besouhola Meta Own App Setup Guide PDF WITH original screenshots."""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUT = Path(r"c:\Users\Ibrahim\Documents\Besouhola_Meta_Own_App_Setup_Guide_EN_v1.1.pdf")
IMG = Path(r"c:\Users\Ibrahim\Documents\meta_guide_images")

# Map figure numbers to extracted unique screenshots from original PDF
FIGURES = {
    1: IMG / "unique_06_p1.png",  # Own App credentials
    2: IMG / "unique_01_p1.png",  # OAuth / Webhook copy panel
    3: IMG / "unique_02_p1.png",  # Connected assets + Sync
    4: IMG / "unique_03_p1.png",  # Lead Sync + Test Webhook
    5: IMG / "unique_04_p1.png",  # Default field mapping
    6: IMG / "unique_05_p1.png",  # Pixel & CAPI
}

BLUE = colors.HexColor("#1877F2")
DARK = colors.HexColor("#111827")
MUTED = colors.HexColor("#4B5563")
LIGHT = colors.HexColor("#F3F4F6")
AMBER_BG = colors.HexColor("#FFFBEB")
AMBER_BD = colors.HexColor("#F59E0B")
GREEN_BG = colors.HexColor("#ECFDF5")
GREEN_BD = colors.HexColor("#10B981")


def make_styles():
    base = getSampleStyleSheet()
    return {
        "cover_kicker": ParagraphStyle(
            "cover_kicker", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=10, textColor=BLUE, alignment=TA_CENTER, spaceAfter=8,
        ),
        "cover_title": ParagraphStyle(
            "cover_title", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=26, textColor=DARK, alignment=TA_CENTER, leading=32, spaceAfter=10,
        ),
        "cover_sub": ParagraphStyle(
            "cover_sub", parent=base["Normal"], fontName="Helvetica",
            fontSize=12, textColor=MUTED, alignment=TA_CENTER, leading=18, spaceAfter=6,
        ),
        "h1": ParagraphStyle(
            "h1", parent=base["Heading1"], fontName="Helvetica-Bold",
            fontSize=15, textColor=DARK, spaceBefore=2, spaceAfter=8, leading=19,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Heading2"], fontName="Helvetica-Bold",
            fontSize=11.5, textColor=DARK, spaceBefore=10, spaceAfter=5, leading=15,
        ),
        "body": ParagraphStyle(
            "body", parent=base["Normal"], fontName="Helvetica",
            fontSize=10, textColor=DARK, leading=14, alignment=TA_JUSTIFY, spaceAfter=7,
        ),
        "bullet": ParagraphStyle(
            "bullet", parent=base["Normal"], fontName="Helvetica",
            fontSize=10, textColor=DARK, leading=13, leftIndent=4, spaceAfter=2,
        ),
        "step": ParagraphStyle(
            "step", parent=base["Normal"], fontName="Helvetica",
            fontSize=10, textColor=DARK, leading=13, spaceAfter=3,
        ),
        "caption": ParagraphStyle(
            "caption", parent=base["Normal"], fontName="Helvetica-Oblique",
            fontSize=9, textColor=MUTED, leading=12, alignment=TA_CENTER, spaceBefore=4, spaceAfter=8,
        ),
        "meta": ParagraphStyle(
            "meta", parent=base["Normal"], fontName="Helvetica",
            fontSize=9, textColor=MUTED, leading=12, spaceAfter=2,
        ),
        "callout": ParagraphStyle(
            "callout", parent=base["Normal"], fontName="Helvetica",
            fontSize=9.5, textColor=DARK, leading=13, spaceAfter=0,
        ),
        "table_cell": ParagraphStyle(
            "table_cell", parent=base["Normal"], fontName="Helvetica",
            fontSize=8.5, textColor=DARK, leading=11,
        ),
        "table_head": ParagraphStyle(
            "table_head", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=8.5, textColor=colors.white, leading=11,
        ),
    }


def callout(text, styles, kind="important"):
    bg, bd = (AMBER_BG, AMBER_BD) if kind == "important" else (GREEN_BG, GREEN_BD)
    label = "IMPORTANT" if kind == "important" else "NOTE"
    inner = Paragraph(f"<b>{label}:</b> {text}", styles["callout"])
    t = Table([[inner]], colWidths=[170 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 1, bd),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def bullets(items, styles):
    return ListFlowable(
        [ListItem(Paragraph(i, styles["bullet"]), leftIndent=12, bulletColor=BLUE) for i in items],
        bulletType="bullet",
        start="•",
        leftIndent=15,
        spaceBefore=2,
        spaceAfter=8,
    )


def steps(items, styles, start=1):
    flow = []
    for idx, text in enumerate(items, start=start):
        flow.append(Paragraph(f"<b>{idx}.</b> {text}", styles["step"]))
    flow.append(Spacer(1, 3))
    return flow


def figure(num, caption, styles, max_width=165 * mm, max_height=95 * mm):
    path = FIGURES[num]
    if not path.exists():
        raise FileNotFoundError(path)
    img = Image(str(path))
    # scale to fit
    iw, ih = img.imageWidth, img.imageHeight
    scale = min(max_width / iw, max_height / ih)
    img.drawWidth = iw * scale
    img.drawHeight = ih * scale
    return KeepTogether([
        Spacer(1, 4),
        img,
        Paragraph(f"Figure {num} — {caption}", styles["caption"]),
    ])


def on_page(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(BLUE)
    canvas.setLineWidth(1.5)
    canvas.line(18 * mm, A4[1] - 12 * mm, A4[0] - 18 * mm, A4[1] - 12 * mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, A4[1] - 10 * mm, "Besouhola CRM | Meta Integration — Own App Setup Guide")
    canvas.drawRightString(A4[0] - 18 * mm, A4[1] - 10 * mm, "v1.1 · August 2026")
    canvas.line(18 * mm, 12 * mm, A4[0] - 18 * mm, 12 * mm)
    canvas.drawCentredString(A4[0] / 2, 8 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build():
    styles = make_styles()
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title="Besouhola CRM — Meta Own App Setup Guide",
        author="Besouhola CRM",
    )
    story = []

    # Cover
    story.append(Spacer(1, 28 * mm))
    story.append(Paragraph("BESOUHOLA CRM", styles["cover_kicker"]))
    story.append(Paragraph("Meta Integration", styles["cover_title"]))
    story.append(Paragraph("Own App Setup Guide", styles["cover_title"]))
    story.append(Spacer(1, 5 * mm))
    story.append(Paragraph(
        "Connect a tenant-owned Meta Developer App to Besouhola CRM for Facebook/Instagram Lead Ads synchronization.",
        styles["cover_sub"],
    ))
    story.append(Spacer(1, 8 * mm))
    meta_rows = [
        ["Audience", "Tenant technical administrator / developer"],
        ["Integration", "Meta Lead Ads (Pages)"],
        ["Connection Mode", "My Own Meta App"],
        ["CRM Module", "Marketing > Meta Integration"],
        ["Document Version", "1.1 — August 2026"],
    ]
    meta_table = Table(meta_rows, colWidths=[45 * mm, 125 * mm])
    meta_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), LIGHT),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, -1), DARK),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D1D5DB")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 6 * mm))
    story.append(callout(
        "This guide covers Lead Ads / Pages only. WhatsApp Cloud API is configured separately under "
        "<b>Settings → Whats Settings</b> and always uses the platform shared Meta App — it is not switched "
        "by Own App mode.",
        styles,
        "note",
    ))
    story.append(PageBreak())

    story.append(Paragraph("1. Purpose", styles["h1"]))
    story.append(Paragraph(
        "This document explains how to connect a company's own Meta Developer App to Besouhola CRM, "
        "authorize the required Facebook assets, activate Lead Ads synchronization, map form fields, and "
        "verify that incoming leads can be received by the CRM.",
        styles["body"],
    ))

    story.append(Paragraph("2. Before You Start", styles["h1"]))
    story.append(bullets([
        "A Meta Developer App owned or controlled by your company.",
        "Administrator access to the Meta App.",
        "Access to the relevant Meta Business portfolio and Facebook Page.",
        "Permission to manage the Page and its Lead Ads assets.",
        "Access to Besouhola CRM with permission to open Meta Integration.",
        "A published Facebook/Instagram Lead Form for final end-to-end testing.",
        "Prefer the Meta App in <b>Live</b> mode for real lead delivery (Development mode can limit delivery).",
    ], styles))
    story.append(callout(
        "Never share your App Secret in email, chat, screenshots, or tickets unless an approved secure support process specifically requires it.",
        styles,
    ))

    story.append(Paragraph("3. Select “My Own Meta App” in Besouhola CRM", styles["h1"]))
    story.extend(steps([
        "Open Besouhola CRM and go to <b>Marketing → Meta Integration → Overview</b>.",
        "Under <b>Connection Mode</b>, select <b>My Own Meta App</b>.",
        "Enter the <b>App ID</b> for your Meta Developer App.",
        "Enter the <b>App Secret</b>.",
        "Create/enter a <b>Verify Token</b>. Use a value that is difficult to guess; the same value will be entered in Meta when the webhook is configured.",
        "Click <b>Save Connection Mode</b>.",
    ], styles, 1))
    story.append(figure(1, "Own App connection mode and Meta App credentials in Besouhola CRM.", styles))
    story.append(callout(
        "The screenshot contains example/test values. Use the credentials for your own Meta App.",
        styles,
    ))
    story.append(PageBreak())

    story.append(Paragraph("4. Copy the OAuth and Webhook Values", styles["h1"]))
    story.append(Paragraph(
        "After saving the Own App configuration, Besouhola CRM provides the values that must be copied into the Meta Developer Console.",
        styles["body"],
    ))
    story.append(bullets([
        "<b>OAuth Callback URL</b> — add this to the app’s valid OAuth redirect URLs.",
        "<b>Webhook URL</b> — use this as the Page webhook callback URL.",
        "<b>Verify Token</b> — enter the same token when Meta asks to verify the webhook.",
    ], styles))
    story.append(figure(2, "CRM-generated OAuth Callback URL, Webhook URL, and Verify Token.", styles))
    story.append(callout(
        "Copy the values from your own CRM screen. Do not manually reconstruct a tenant-specific Webhook URL.",
        styles,
    ))

    story.append(Paragraph("5. Configure the Meta Developer App", styles["h1"]))
    story.append(Paragraph("Open your application in Meta for Developers and complete the following configuration.", styles["body"]))
    story.append(Paragraph("5.1 Configure the OAuth Redirect", styles["h2"]))
    story.extend(steps([
        "Open the Facebook Login / authentication settings used by your app.",
        "Add the OAuth Callback URL shown in Besouhola CRM to the app’s <b>Valid OAuth Redirect URIs</b>.",
        "Save the Meta app configuration.",
    ], styles, 1))
    story.append(Paragraph("5.2 Configure the Page Webhook", styles["h2"]))
    story.extend(steps([
        "Open <b>Webhooks</b> in the Meta Developer Console.",
        "Choose the <b>Page</b> object.",
        "Add a callback subscription.",
        "Paste the <b>Webhook URL</b> copied from Besouhola CRM.",
        "Paste the matching <b>Verify Token</b>.",
        "Complete verification and save the subscription.",
        "Subscribe the Page webhook to the <b>leadgen</b> field.",
    ], styles, 1))
    story.append(callout(
        "The <b>leadgen</b> subscription is essential for real-time Lead Ads notifications.",
        styles,
        "note",
    ))
    story.append(Paragraph("5.3 App Permissions", styles["h2"]))
    story.append(Paragraph(
        "The integration may require Meta permissions such as the following, depending on the features enabled for the tenant and the app’s approved access level:",
        styles["body"],
    ))
    story.append(bullets([
        "pages_show_list",
        "leads_retrieval",
        "pages_read_engagement",
        "pages_manage_metadata",
        "business_management",
        "ads_read",
        "pages_manage_ads",
    ], styles))
    story.append(Paragraph(
        "Meta may require App Review, business verification, advanced access, or other platform approvals for specific permissions.",
        styles["body"],
    ))
    story.append(callout(
        "Set the Meta App to <b>Live</b> when you are ready for production lead delivery.",
        styles,
        "note",
    ))
    story.append(PageBreak())

    story.append(Paragraph("6. Connect the Facebook Account and Sync Assets", styles["h1"]))
    story.extend(steps([
        "Return to Besouhola CRM → <b>Meta Integration → Overview</b>.",
        "Select the <b>Agency</b> if your CRM account manages more than one agency.",
        "Click <b>Connect Meta Account</b> (or reconnect if the account was previously connected).",
        "Sign in with the Facebook account that has access to the required business and Page.",
        "Approve the requested permissions.",
        "After the connection is established, click <b>Sync All Assets</b>.",
        "Locate the required Page and make sure its <b>Active</b> toggle is enabled.",
    ], styles, 1))
    story.append(figure(3, "Connected Facebook account, business assets, active Page, and Sync All Assets.", styles))
    story.append(callout(
        "If app permissions or authentication settings were changed after the original login, disconnect and connect again so the new authorization can be granted.",
        styles,
    ))
    story.append(PageBreak())

    story.append(Paragraph("7. Enable Lead Ads Sync", styles["h1"]))
    story.extend(steps([
        "Open <b>Lead Sync</b> from the left navigation.",
        "Enable <b>Auto-Sync for Incoming Leads</b>.",
        "Use <b>Test Webhook</b> as a quick connectivity check only.",
        "Select the Lead Form you want to configure under <b>Per-Form Field Mapping</b>.",
        "Map each Meta form field to the correct CRM field.",
    ], styles, 1))
    story.append(figure(4, "Auto-Sync, Test Webhook, and per-form field mapping.", styles))

    story.append(Paragraph("8. Save Form Mapping and Configure Defaults", styles["h1"]))
    story.append(Paragraph(
        "Per-form mapping lets you define a specific mapping for an individual Facebook Lead Form. "
        "Default Field Mapping provides the fallback mapping used when a form does not have a more specific mapping.",
        styles["body"],
    ))
    story.extend(steps([
        "Review each field on the left (Meta) and its destination CRM field on the right.",
        "Click <b>Save Form Mapping</b> after editing a specific form.",
        "Review <b>Default Field Mapping</b> and make sure common fields such as name, email, and phone point to the correct CRM fields.",
    ], styles, 1))
    story.append(figure(5, "Saved per-form mapping and Default Field Mapping.", styles))
    story.append(PageBreak())

    story.append(Paragraph("9. Meta Leads Access and Lead Ads Terms", styles["h1"]))
    story.append(Paragraph(
        "A successful Facebook login does not automatically guarantee that the app can retrieve Page leads. "
        "Before end-to-end testing, verify the Page’s lead-access configuration in Meta Business Settings.",
        styles["body"],
    ))
    story.append(bullets([
        "Confirm the connected app has <b>Leads Access</b> for the Page (Business Settings → Integrations → Leads Access → CRMs).",
        "Confirm the Page’s <b>Lead Ads Terms</b> have been accepted.",
        "Confirm the Facebook Page is published and the connected account has the required Page permissions.",
    ], styles))

    story.append(Paragraph("10. End-to-End Test", styles["h1"]))
    story.extend(steps([
        "First run <b>Test Webhook</b> in Besouhola CRM. Treat it as a connectivity check; it does <b>not</b> prove that a real lead can be delivered.",
        "Open Meta’s <b>Lead Ads Testing Tool</b>.",
        "Choose the Facebook Page and Lead Form.",
        "Create a test lead.",
        "In the testing tool status table, wait until the app status is <b>Success</b> (not Pending).",
        "Return to Besouhola CRM and confirm the new lead appears.",
        "Open the lead and verify that name, email, phone, and any campaign/UTM fields were mapped correctly.",
    ], styles, 1))
    story.append(callout(
        "Do not rely on the Meta Developer Console “Send to server” sample for end-to-end lead testing. That sample uses placeholder IDs and will not create a real CRM lead. Use the Lead Ads Testing Tool and wait for <b>Success</b>.",
        styles,
    ))

    story.append(Paragraph("11. Optional: Pixel &amp; Conversions API (CAPI)", styles["h1"]))
    story.append(Paragraph(
        "Pixel &amp; CAPI is separate from the basic inbound Lead Ads synchronization flow. Configure it only if your tenant needs Meta event tracking or server-side conversion events.",
        styles["body"],
    ))
    story.append(bullets([
        "Enter the Meta Pixel ID.",
        "Enable Conversions API (CAPI) only when required.",
        "Select the events that should be sent to Meta.",
        "Use the available test event function before going live.",
        "Besouhola CRM hashes sensitive user data such as email and phone before sending to Meta.",
    ], styles))
    story.append(figure(6, "Optional Pixel & Conversions API configuration.", styles))
    story.append(callout(
        "WhatsApp messaging is not configured here. Use <b>Settings → Whats Settings → Meta Cloud</b> (manual token) or WhatsApp Mirror.",
        styles,
        "note",
    ))
    story.append(PageBreak())

    story.append(Paragraph("12. Go-Live Checklist", styles["h1"]))
    for item in [
        "Own App mode is selected and saved.",
        "Correct App ID and App Secret are configured.",
        "Meta App is in Live mode (for production).",
        "OAuth Callback URL is registered in Meta.",
        "Webhook URL is verified in Meta.",
        "Page webhook is subscribed to leadgen.",
        "Facebook account is connected to the correct agency.",
        "Required Page is visible and Active after Sync All Assets.",
        "Auto-Sync for Incoming Leads is enabled.",
        "Per-form/default field mappings are correct and saved.",
        "Meta Leads Access is configured for the app on the Page.",
        "Lead Ads Terms are accepted.",
        "Test Webhook succeeds (connectivity only).",
        "A Meta Lead Ads Testing Tool lead shows Success and reaches the CRM with correct field mapping.",
        "WhatsApp (if needed) is configured separately under Settings → Whats Settings.",
    ]:
        story.append(Paragraph(f"☐  {item}", styles["step"]))
    story.append(Spacer(1, 6))

    story.append(Paragraph("13. Troubleshooting", styles["h1"]))
    head = [
        Paragraph("Issue", styles["table_head"]),
        Paragraph("Check First", styles["table_head"]),
        Paragraph("Recommended Action", styles["table_head"]),
    ]
    rows_raw = [
        ["OAuth connection fails", "App ID, App Secret, OAuth redirect URL", "Correct the Meta app settings, then reconnect."],
        ["Webhook verification fails", "Webhook URL and Verify Token", "Copy both values again from the CRM and verify that they match exactly."],
        ["Page does not appear", "Facebook/Page permissions and asset sync", "Reconnect with the correct admin account and run Sync All Assets."],
        ["Page appears but leads do not arrive", "leadgen, Leads Access, Lead Ads Terms, App Live mode", "Verify in Meta, then run Lead Ads Testing Tool until Success."],
        ["Webhook test works but live lead does not arrive", "Testing Tool status; Console sample payloads", "Use Lead Ads Testing Tool; ignore Console placeholder samples."],
        ["Forms missing in Lead Sync", "pages_manage_ads permission on the token", "Add the permission in Meta, then disconnect and reconnect."],
        ["Lead arrives with missing/wrong data", "Per-form and default mapping", "Correct the field mapping and save it."],
        ["Permissions were changed after connection", "Existing access token/session", "Disconnect and reconnect the Meta account."],
        ["WhatsApp not working after Own App setup", "Wrong module expectation", "Configure WhatsApp under Settings → Whats Settings; Own App does not switch WhatsApp credentials."],
    ]
    data = [head] + [[Paragraph(c, styles["table_cell"]) for c in r] for r in rows_raw]
    tbl = Table(data, colWidths=[48 * mm, 55 * mm, 67 * mm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BLUE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D1D5DB")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(tbl)
    story.append(PageBreak())

    story.append(Paragraph("14. Support Handoff Information", styles["h1"]))
    story.append(Paragraph(
        "If the tenant’s technical team needs support, provide the following information without exposing the App Secret:",
        styles["body"],
    ))
    story.append(bullets([
        "Tenant/agency name.",
        "Meta App ID (not the App Secret).",
        "Facebook Page name and Page ID.",
        "Whether OAuth connection succeeds.",
        "Whether Test Webhook succeeds.",
        "Whether the Page appears and is Active after Sync All Assets.",
        "Whether a Meta Lead Ads Testing Tool lead reached <b>Success</b>.",
        "Approximate test time and any error message shown.",
    ], styles))
    story.append(callout(
        "Do not include App Secret, access tokens, or other sensitive credentials in screenshots or support messages.",
        styles,
    ))
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph(
        "v1.1 updates: restored original screenshots (Figures 1–6); clarified WhatsApp vs Own App; Live mode; "
        "renumbered steps; Success vs Pending testing notes.",
        styles["meta"],
    ))

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(str(OUT))


if __name__ == "__main__":
    build()
