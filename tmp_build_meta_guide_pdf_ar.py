# -*- coding: utf-8 -*-
"""Generate Arabic Besouhola Meta Own App Setup Guide PDF with screenshots."""
from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUT = Path(r"c:\Users\Ibrahim\Documents\Besouhola_Meta_Own_App_Setup_Guide_AR_v1.1.pdf")
IMG = Path(r"c:\Users\Ibrahim\Documents\meta_guide_images")
FONT_REG = r"C:\Windows\Fonts\arial.ttf"
FONT_BOLD = r"C:\Windows\Fonts\arialbd.ttf"

FIGURES = {
    1: IMG / "unique_06_p1.png",
    2: IMG / "unique_01_p1.png",
    3: IMG / "unique_02_p1.png",
    4: IMG / "unique_03_p1.png",
    5: IMG / "unique_04_p1.png",
    6: IMG / "unique_05_p1.png",
}

BLUE = colors.HexColor("#1877F2")
DARK = colors.HexColor("#111827")
MUTED = colors.HexColor("#4B5563")
LIGHT = colors.HexColor("#F3F4F6")
AMBER_BG = colors.HexColor("#FFFBEB")
AMBER_BD = colors.HexColor("#F59E0B")
GREEN_BG = colors.HexColor("#ECFDF5")
GREEN_BD = colors.HexColor("#10B981")

pdfmetrics.registerFont(TTFont("Arabic", FONT_REG))
pdfmetrics.registerFont(TTFont("Arabic-Bold", FONT_BOLD))


def ar(text: str) -> str:
    """Reshape + bidi for correct Arabic display in ReportLab."""
    if not text:
        return text
    # Keep HTML tags intact by reshaping text segments only is complex;
    # for our content we reshape whole strings without nested tags,
    # or replace <b>...</b> carefully.
    return get_display(arabic_reshaper.reshape(text))


def arb(text: str) -> str:
    """Arabic paragraph with optional simple <b> segments."""
    # Split on <b>...</b>
    out = []
    i = 0
    while i < len(text):
        start = text.find("<b>", i)
        if start == -1:
            out.append(ar(text[i:]))
            break
        if start > i:
            out.append(ar(text[i:start]))
        end = text.find("</b>", start)
        if end == -1:
            out.append(ar(text[start:]))
            break
        inner = text[start + 3 : end]
        out.append(f"<b>{ar(inner)}</b>")
        i = end + 4
    return "".join(out)


def make_styles():
    base = getSampleStyleSheet()
    return {
        "cover_kicker": ParagraphStyle(
            "cover_kicker", parent=base["Normal"], fontName="Arabic-Bold",
            fontSize=10, textColor=BLUE, alignment=TA_CENTER, spaceAfter=8,
        ),
        "cover_title": ParagraphStyle(
            "cover_title", parent=base["Normal"], fontName="Arabic-Bold",
            fontSize=24, textColor=DARK, alignment=TA_CENTER, leading=32, spaceAfter=10,
        ),
        "cover_sub": ParagraphStyle(
            "cover_sub", parent=base["Normal"], fontName="Arabic",
            fontSize=11, textColor=MUTED, alignment=TA_CENTER, leading=18, spaceAfter=6,
        ),
        "h1": ParagraphStyle(
            "h1", parent=base["Heading1"], fontName="Arabic-Bold",
            fontSize=14, textColor=DARK, spaceBefore=2, spaceAfter=8, leading=20,
            alignment=TA_RIGHT,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Heading2"], fontName="Arabic-Bold",
            fontSize=11.5, textColor=DARK, spaceBefore=10, spaceAfter=5, leading=16,
            alignment=TA_RIGHT,
        ),
        "body": ParagraphStyle(
            "body", parent=base["Normal"], fontName="Arabic",
            fontSize=10, textColor=DARK, leading=15, alignment=TA_RIGHT, spaceAfter=7,
        ),
        "step": ParagraphStyle(
            "step", parent=base["Normal"], fontName="Arabic",
            fontSize=10, textColor=DARK, leading=14, spaceAfter=3, alignment=TA_RIGHT,
        ),
        "caption": ParagraphStyle(
            "caption", parent=base["Normal"], fontName="Arabic",
            fontSize=9, textColor=MUTED, leading=12, alignment=TA_CENTER, spaceBefore=4, spaceAfter=8,
        ),
        "meta": ParagraphStyle(
            "meta", parent=base["Normal"], fontName="Arabic",
            fontSize=9, textColor=MUTED, leading=12, spaceAfter=2, alignment=TA_RIGHT,
        ),
        "callout": ParagraphStyle(
            "callout", parent=base["Normal"], fontName="Arabic",
            fontSize=9.5, textColor=DARK, leading=14, spaceAfter=0, alignment=TA_RIGHT,
        ),
        "table_cell": ParagraphStyle(
            "table_cell", parent=base["Normal"], fontName="Arabic",
            fontSize=8.5, textColor=DARK, leading=12, alignment=TA_RIGHT,
        ),
        "table_head": ParagraphStyle(
            "table_head", parent=base["Normal"], fontName="Arabic-Bold",
            fontSize=8.5, textColor=colors.white, leading=12, alignment=TA_CENTER,
        ),
    }


def callout(text, styles, kind="important"):
    bg, bd = (AMBER_BG, AMBER_BD) if kind == "important" else (GREEN_BG, GREEN_BD)
    label = "مهم" if kind == "important" else "ملاحظة"
    inner = Paragraph(arb(f"<b>{label}:</b> {text}"), styles["callout"])
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
    flow = []
    for item in items:
        flow.append(Paragraph(arb(f"• {item}"), styles["step"]))
    flow.append(Spacer(1, 4))
    return flow


def steps(items, styles, start=1):
    flow = []
    for idx, text in enumerate(items, start=start):
        # Put number on the right visually by prefixing Arabic text
        flow.append(Paragraph(arb(f"{idx}. {text}"), styles["step"]))
    flow.append(Spacer(1, 3))
    return flow


def figure(num, caption, styles, max_width=165 * mm, max_height=92 * mm):
    path = FIGURES[num]
    img = Image(str(path))
    iw, ih = img.imageWidth, img.imageHeight
    scale = min(max_width / iw, max_height / ih)
    img.drawWidth = iw * scale
    img.drawHeight = ih * scale
    return KeepTogether([
        Spacer(1, 4),
        img,
        Paragraph(arb(f"شكل {num} — {caption}"), styles["caption"]),
    ])


def on_page(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(BLUE)
    canvas.setLineWidth(1.5)
    canvas.line(18 * mm, A4[1] - 12 * mm, A4[0] - 18 * mm, A4[1] - 12 * mm)
    canvas.setFont("Arabic", 8)
    canvas.setFillColor(MUTED)
    header = ar("Besouhola CRM | دليل ربط تطبيق ميتا الخاص")
    canvas.drawRightString(A4[0] - 18 * mm, A4[1] - 10 * mm, header)
    canvas.drawString(18 * mm, A4[1] - 10 * mm, "v1.1 · August 2026")
    canvas.line(18 * mm, 12 * mm, A4[0] - 18 * mm, 12 * mm)
    canvas.drawCentredString(A4[0] / 2, 8 * mm, ar(f"صفحة {doc.page}"))
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
        title="Besouhola CRM — دليل ربط تطبيق ميتا الخاص",
        author="Besouhola CRM",
    )
    story = []

    story.append(Spacer(1, 26 * mm))
    story.append(Paragraph(ar("BESOUHOLA CRM"), styles["cover_kicker"]))
    story.append(Paragraph(ar("تكامل ميتا"), styles["cover_title"]))
    story.append(Paragraph(ar("دليل ربط التطبيق الخاص (Own App)"), styles["cover_title"]))
    story.append(Spacer(1, 5 * mm))
    story.append(Paragraph(
        ar("اربط تطبيق ميتا الخاص بشركتك مع Besouhola CRM لمزامنة ليدز فيسبوك/إنستجرام Lead Ads."),
        styles["cover_sub"],
    ))
    story.append(Spacer(1, 8 * mm))

    meta_rows = [
        [ar("الجمهور"), ar("المسؤول التقني / المطوّر لدى التينانت")],
        [ar("التكامل"), ar("Meta Lead Ads (الصفحات)")],
        [ar("وضع الاتصال"), ar("تطبيقي الخاص (My Own Meta App)")],
        [ar("الموديول"), ar("التسويق > تكامل ميتا")],
        [ar("إصدار المستند"), ar("1.1 — أغسطس 2026")],
    ]
    # RTL table: put label on the right column visually by swapping
    meta_rows = [[b, a] for a, b in meta_rows]
    meta_table = Table(meta_rows, colWidths=[115 * mm, 55 * mm])
    meta_table.setStyle(TableStyle([
        ("BACKGROUND", (1, 0), (1, -1), LIGHT),
        ("FONTNAME", (0, 0), (-1, -1), "Arabic"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, -1), DARK),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D1D5DB")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 6 * mm))
    story.append(callout(
        "هذا الدليل خاص بـ Lead Ads / الصفحات فقط. واتساب Cloud API يُضبط منفصلًا من "
        "الإعدادات ← إعدادات واتساب، ويستخدم دائمًا تطبيق المنصة المشترك — ولا يتأثر بوضع Own App.",
        styles,
        "note",
    ))
    story.append(PageBreak())

    story.append(Paragraph(arb("1. الغرض"), styles["h1"]))
    story.append(Paragraph(arb(
        "يشرح هذا المستند كيفية ربط تطبيق ميتا الخاص بالشركة مع Besouhola CRM، "
        "وتفويض الأصول المطلوبة، وتفعيل مزامنة Lead Ads، وتعيين حقول النماذج، "
        "والتحقق من استلام الليدز داخل الـ CRM."
    ), styles["body"]))

    story.append(Paragraph(arb("2. قبل البدء"), styles["h1"]))
    story.extend(bullets([
        "تطبيق Meta Developer مملوك أو مُدار من شركتك.",
        "صلاحية Administrator على التطبيق.",
        "الوصول لمحفظة الأعمال (Business) والصفحة المطلوبة.",
        "صلاحية إدارة الصفحة وأصول Lead Ads.",
        "الوصول لـ Besouhola CRM وصلاحية فتح تكامل ميتا.",
        "نموذج Lead Form منشور للاختبار النهائي.",
        "يُفضّل أن يكون التطبيق في وضع Live لتوصيل الليدز الفعلي (وضع Development قد يقيّد التوصيل).",
    ], styles))
    story.append(callout(
        "لا تشارك App Secret عبر الإيميل أو الشات أو السكرينشوت إلا عبر قناة دعم آمنة معتمدة.",
        styles,
    ))

    story.append(Paragraph(arb("3. اختيار «تطبيقي الخاص» في Besouhola CRM"), styles["h1"]))
    story.extend(steps([
        "افتح Besouhola CRM ثم التسويق ← تكامل ميتا ← Overview.",
        "تحت Connection Mode اختر My Own Meta App.",
        "أدخل App ID الخاص بتطبيقك.",
        "أدخل App Secret.",
        "أنشئ/أدخل Verify Token صعب التخمين؛ ستستخدم نفس القيمة في ميتا عند إعداد الويب هوك.",
        "اضغط Save Connection Mode.",
    ], styles, 1))
    story.append(figure(1, "وضع Own App وبيانات تطبيق ميتا داخل Besouhola CRM.", styles))
    story.append(callout(
        "لقطة الشاشة تحتوي قيمًا تجريبية. استخدم بيانات تطبيقك أنت.",
        styles,
    ))
    story.append(PageBreak())

    story.append(Paragraph(arb("4. نسخ قيم OAuth والويب هوك"), styles["h1"]))
    story.append(Paragraph(arb(
        "بعد حفظ إعداد Own App، يعرض Besouhola CRM القيم التي يجب نسخها إلى Meta Developer Console."
    ), styles["body"]))
    story.extend(bullets([
        "OAuth Callback URL — أضفه إلى Valid OAuth Redirect URIs في التطبيق.",
        "Webhook URL — استخدمه كرابط Callback لاشتراك Page Webhook.",
        "Verify Token — أدخله عند طلب ميتا للتحقق من الويب هوك.",
    ], styles))
    story.append(figure(2, "روابط OAuth وWebhook وVerify Token كما تظهر في الـ CRM.", styles))
    story.append(callout(
        "انسخ القيم من شاشتك في الـ CRM. لا تُنشئ Webhook URL يدويًا.",
        styles,
    ))

    story.append(Paragraph(arb("5. إعداد تطبيق ميتا"), styles["h1"]))
    story.append(Paragraph(arb("افتح تطبيقك في Meta for Developers وأكمل الإعدادات التالية."), styles["body"]))

    story.append(Paragraph(arb("5.1 إعداد OAuth Redirect"), styles["h2"]))
    story.extend(steps([
        "افتح إعدادات Facebook Login / المصادقة في التطبيق.",
        "أضف OAuth Callback URL الظاهر في الـ CRM إلى Valid OAuth Redirect URIs.",
        "احفظ إعدادات التطبيق.",
    ], styles, 1))

    story.append(Paragraph(arb("5.2 إعداد Page Webhook"), styles["h2"]))
    story.extend(steps([
        "افتح Webhooks في Meta Developer Console.",
        "اختر كائن Page.",
        "أضف اشتراك Callback.",
        "الصق Webhook URL المنسوخ من الـ CRM.",
        "الصق Verify Token المطابق.",
        "أكمل التحقق واحفظ الاشتراك.",
        "اشترك في حقل leadgen للصفحة.",
    ], styles, 1))
    story.append(callout(
        "اشتراك leadgen ضروري لإشعارات Lead Ads اللحظية.",
        styles,
        "note",
    ))

    story.append(Paragraph(arb("5.3 صلاحيات التطبيق"), styles["h2"]))
    story.append(Paragraph(arb(
        "قد يحتاج التكامل صلاحيات ميتا التالية حسب الميزات المفعّلة ومستوى الموافقة على التطبيق:"
    ), styles["body"]))
    story.extend(bullets([
        "pages_show_list",
        "leads_retrieval",
        "pages_read_engagement",
        "pages_manage_metadata",
        "business_management",
        "ads_read",
        "pages_manage_ads",
    ], styles))
    story.append(Paragraph(arb(
        "قد تطلب ميتا App Review أو Business Verification أو Advanced Access لبعض الصلاحيات."
    ), styles["body"]))
    story.append(callout(
        "عند الجاهزية للإنتاج اجعل التطبيق على وضع Live.",
        styles,
        "note",
    ))
    story.append(PageBreak())

    story.append(Paragraph(arb("6. ربط حساب فيسبوك ومزامنة الأصول"), styles["h1"]))
    story.extend(steps([
        "ارجع إلى Besouhola CRM ← تكامل ميتا ← Overview.",
        "اختر الـ Agency إن كان حسابك يدير أكثر من وكالة.",
        "اضغط Connect Meta Account (أو أعد الربط إن كان مربوطًا سابقًا).",
        "سجّل بحساب فيسبوك الذي يملك صلاحية الأعمال والصفحة.",
        "وافق على الصلاحيات المطلوبة.",
        "بعد نجاح الربط اضغط Sync All Assets.",
        "ابحث عن الصفحة المطلوبة وتأكد أن مفتاح Active مفعّل.",
    ], styles, 1))
    story.append(figure(3, "حساب فيسبوك المربوط، الأصول، الصفحة النشطة، وSync All Assets.", styles))
    story.append(callout(
        "إذا تغيّرت صلاحيات التطبيق بعد الربط، افصل ثم اربط من جديد لمنح التفويض الجديد.",
        styles,
    ))
    story.append(PageBreak())

    story.append(Paragraph(arb("7. تفعيل مزامنة Lead Ads"), styles["h1"]))
    story.extend(steps([
        "افتح Lead Sync من الشريط الجانبي.",
        "فعّل Auto-Sync for Incoming Leads.",
        "استخدم Test Webhook كفحص اتصال سريع فقط.",
        "اختر نموذج الليد تحت Per-Form Field Mapping.",
        "عيّن كل حقل من ميتا إلى الحقل المناسب في الـ CRM.",
    ], styles, 1))
    story.append(figure(4, "Auto-Sync وTest Webhook وتعيين حقول النموذج.", styles))

    story.append(Paragraph(arb("8. حفظ تعيين الحقول والإعدادات الافتراضية"), styles["h1"]))
    story.append(Paragraph(arb(
        "التعيين لكل نموذج يحدد خريطة خاصة بنموذج معيّن. Default Field Mapping هو البديل "
        "عند عدم وجود تعيين خاص للنموذج."
    ), styles["body"]))
    story.extend(steps([
        "راجع كل حقل يسارًا (ميتا) ووجهته يمينًا (CRM).",
        "اضغط Save Form Mapping بعد تعديل نموذج معيّن.",
        "راجع Default Field Mapping وتأكد أن name وemail وphone تشير للحقول الصحيحة.",
    ], styles, 1))
    story.append(figure(5, "حفظ تعيين النموذج وDefault Field Mapping.", styles))
    story.append(PageBreak())

    story.append(Paragraph(arb("9. Leads Access وشروط Lead Ads"), styles["h1"]))
    story.append(Paragraph(arb(
        "نجاح تسجيل الدخول لفيسبوك لا يضمن تلقائيًا وصول التطبيق لليدز. قبل الاختبار النهائي "
        "راجع إعدادات وصول الليدز في Meta Business Settings."
    ), styles["body"]))
    story.extend(bullets([
        "تأكد أن التطبيق لديه Leads Access على الصفحة (Business Settings ← Integrations ← Leads Access ← CRMs).",
        "تأكد من قبول Lead Ads Terms للصفحة.",
        "تأكد أن الصفحة منشورة وأن الحساب يملك صلاحيات الصفحة المطلوبة.",
    ], styles))

    story.append(Paragraph(arb("10. اختبار من طرف لطرف"), styles["h1"]))
    story.extend(steps([
        "نفّذ أولًا Test Webhook في الـ CRM. هذا فحص اتصال فقط ولا يثبت وصول ليد حقيقي.",
        "افتح Lead Ads Testing Tool من ميتا.",
        "اختر الصفحة ونموذج الليد.",
        "أنشئ test lead.",
        "في جدول الحالة انتظر حتى يصبح Status = Success (وليس Pending).",
        "ارجع للـ CRM وتأكد ظهور الليد الجديد.",
        "افتح الليد وتحقق من name وemail وphone وأي حقول حملة/UTM.",
    ], styles, 1))
    story.append(callout(
        "لا تعتمد على زر Send to server في Developer Console للاختبار النهائي؛ العينة تستخدم IDs وهمية "
        "ولن تنشئ ليدًا حقيقيًا في الـ CRM. استخدم Lead Ads Testing Tool وانتظر Success.",
        styles,
    ))

    story.append(Paragraph(arb("11. اختياري: Pixel وConversions API (CAPI)"), styles["h1"]))
    story.append(Paragraph(arb(
        "Pixel وCAPI منفصلان عن مسار استقبال Lead Ads الأساسي. اضبطهما فقط إذا احتجت تتبّع "
        "أحداث ميتا أو إرسال تحويلات من السيرفر."
    ), styles["body"]))
    story.extend(bullets([
        "أدخل Meta Pixel ID.",
        "فعّل Conversions API عند الحاجة فقط.",
        "اختر الأحداث المطلوب إرسالها لميتا.",
        "استخدم اختبار الحدث قبل الإطلاق.",
        "يقوم Besouhola CRM بتشفير (hash) البيانات الحساسة مثل الإيميل والهاتف قبل الإرسال لميتا.",
    ], styles))
    story.append(figure(6, "إعداد Pixel وConversions API الاختياري.", styles))
    story.append(callout(
        "رسائل واتساب لا تُضبط هنا. استخدم الإعدادات ← إعدادات واتساب ← Meta Cloud (إدخال يدوي) أو WhatsApp Mirror.",
        styles,
        "note",
    ))
    story.append(PageBreak())

    story.append(Paragraph(arb("12. قائمة التحقق قبل الإطلاق"), styles["h1"]))
    for item in [
        "تم اختيار وحفظ وضع Own App.",
        "App ID وApp Secret صحيحان.",
        "التطبيق على وضع Live (للإنتاج).",
        "OAuth Callback URL مسجّل في ميتا.",
        "Webhook URL تم التحقق منه في ميتا.",
        "اشتراك صفحة leadgen مفعّل.",
        "حساب فيسبوك مربوط على الـ Agency الصحيحة.",
        "الصفحة ظاهرة وActive بعد Sync All Assets.",
        "Auto-Sync مفعّل.",
        "تعيين الحقول (لكل نموذج/افتراضي) محفوظ وصحيح.",
        "Leads Access مضبوط للتطبيق على الصفحة.",
        "تم قبول Lead Ads Terms.",
        "Test Webhook نجح (فحص اتصال فقط).",
        "ليد من Lead Ads Testing Tool وصل Success وظهر في الـ CRM بالحقول الصحيحة.",
        "واتساب (إن لزم) مضبوط منفصلًا من الإعدادات ← إعدادات واتساب.",
    ]:
        story.append(Paragraph(arb(f"☐  {item}"), styles["step"]))
    story.append(Spacer(1, 6))

    story.append(Paragraph(arb("13. استكشاف الأخطاء"), styles["h1"]))
    head = [
        Paragraph(arb("الإجراء الموصى به"), styles["table_head"]),
        Paragraph(arb("افحص أولًا"), styles["table_head"]),
        Paragraph(arb("المشكلة"), styles["table_head"]),
    ]
    rows_raw = [
        ["فشل OAuth", "App ID / Secret / Redirect URL", "صحّح إعدادات التطبيق ثم أعد الربط."],
        ["فشل تحقق الويب هوك", "Webhook URL وVerify Token", "انسخ القيم من الـ CRM وتأكد التطابق تمامًا."],
        ["الصفحة لا تظهر", "صلاحيات الحساب والمزامنة", "اربط بحساب أدمن صحيح ثم Sync All Assets."],
        ["الصفحة ظاهرة والليدز لا تصل", "leadgen وLeads Access والـ Terms ووضع Live", "تحقق في ميتا ثم اختبر حتى Success."],
        ["Test Webhook ينجح والليد لا يصل", "حالة Testing Tool / عيّنات الـ Console", "استخدم Testing Tool وتجاهل العيّنات الوهمية."],
        ["الفورمز لا تظهر في Lead Sync", "صلاحية pages_manage_ads", "أضف الصلاحية ثم Disconnect ثم Connect."],
        ["الليد يصل ببيانات ناقصة/خاطئة", "تعيين الحقول", "صحّح الـ mapping واحفظه."],
        ["تغيّرت الصلاحيات بعد الربط", "التوكن الحالي", "افصل ثم اربط حساب ميتا من جديد."],
        ["واتساب لا يعمل بعد Own App", "توقع خاطئ للموديول", "اضبط واتساب من إعدادات واتساب؛ Own App لا يغيّر بيانات واتساب."],
    ]
    # RTL columns: action | check | issue  (rightmost = issue)
    data = [head]
    for issue, check, action in rows_raw:
        data.append([
            Paragraph(arb(action), styles["table_cell"]),
            Paragraph(arb(check), styles["table_cell"]),
            Paragraph(arb(issue), styles["table_cell"]),
        ])
    tbl = Table(data, colWidths=[67 * mm, 55 * mm, 48 * mm], repeatRows=1)
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

    story.append(Paragraph(arb("14. معلومات تسليم الدعم"), styles["h1"]))
    story.append(Paragraph(arb(
        "عند طلب الدعم من الفريق التقني، أرسل المعلومات التالية بدون كشف App Secret:"
    ), styles["body"]))
    story.extend(bullets([
        "اسم التينانت / الوكالة.",
        "Meta App ID (وليس App Secret).",
        "اسم الصفحة وPage ID.",
        "هل نجح ربط OAuth.",
        "هل نجح Test Webhook.",
        "هل الصفحة ظاهرة وActive بعد Sync.",
        "هل وصل ليد Testing Tool إلى Success.",
        "وقت الاختبار التقريبي وأي رسالة خطأ ظاهرة.",
    ], styles))
    story.append(callout(
        "لا تُدرج App Secret أو Access Tokens أو بيانات حساسة في السكرينشوت أو رسائل الدعم.",
        styles,
    ))
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph(arb(
        "إصدار 1.1: نسخة عربية بنفس صور الدليل الإنجليزي، مع توضيح واتساب مقابل Own App، "
        "وضع Live، وترقيم الخطوات، وملاحظات الاختبار Success مقابل Pending."
    ), styles["meta"]))

    # Fix typo in callout - I accidentally wrote السكREENشوت - fix by regenerating that line
    # Actually I'll fix in a second pass - let me fix now by rewriting that section... 
    # Too late in this script - I'll patch the callout text that has typo.
    # The typo is in story already: "السكREENشوت" - I need to fix before build.
    # Looking at my code: `story.append(callout("السكREENشوت يحتوي...` - yes fix it.

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(str(OUT))


if __name__ == "__main__":
    # Quick fix for typo before run: monkeypatch by rewriting file content is messy;
    # fix string in this module:
    import sys
    # Replace the bad callout at runtime by editing build's source... easier to just fix the string above.
    # I already see the typo in the written file - let me fix with search_replace then run.
    build()
