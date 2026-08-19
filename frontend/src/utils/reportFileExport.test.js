import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import {
  arrayBufferToBase64,
  joinExportNames,
  registerReportPdfFont,
  reportPdfAutoTableOptions,
  resetReportPdfFontCache,
  writeXlsxArray,
} from './reportFileExport'
import { buildTargetsRevenuePdfTable } from './targetRevenueReport'

const ARABIC_SAMPLE = 'شاي أحمر'
const MIXED_ROW = {
  'Item Name': ARABIC_SAMPLE,
  'Lead Name': 'أحمد علي',
  'Sales Person': 'محمد',
  'Source': 'فيسبوك',
  English: 'honor',
}

const fontPath = path.resolve(__dirname, '../../public/fonts/Amiri-Regular.ttf')

describe('reportFileExport', () => {
  it('joins full item names with commas and does not split characters', () => {
    expect(joinExportNames(['شاي أحمر', 'honor', 'شاي أحمر'])).toBe('شاي أحمر, honor')
    expect(joinExportNames(['honor'])).not.toMatch(/h o n o r/)
  })

  it('writes real xlsx bytes that keep Arabic as UTF-8, not Windows-1252 garbage', () => {
    const bytes = writeXlsxArray([MIXED_ROW], 'Reservations')
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)

    const wb = XLSX.read(bytes, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(sheet)
    expect(rows[0]['Item Name']).toBe(ARABIC_SAMPLE)
    expect(rows[0].English).toBe('honor')

    const raw = Buffer.from(bytes)
    const utf8Arabic = Buffer.from(ARABIC_SAMPLE, 'utf8')
    expect(raw.includes(utf8Arabic)).toBe(true)
    expect(raw.toString('utf8')).toContain(ARABIC_SAMPLE)
    expect(raw.toString('utf8')).not.toMatch(/þ·/)
  })

  it('embeds a real Amiri font so PDF text is not Helvetica WinAnsi garbage', async () => {
    expect(fs.existsSync(fontPath)).toBe(true)
    const fontBuffer = fs.readFileSync(fontPath)
    expect(fontBuffer.length).toBeGreaterThan(100000)
    expect(String.fromCharCode(fontBuffer[0], fontBuffer[1], fontBuffer[2], fontBuffer[3])).toBe('\x00\x01\x00\x00')

    resetReportPdfFontCache()
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
    const fontName = await registerReportPdfFont(doc, { fontBuffer })
    expect(fontName).toBe('Amiri')
    doc.setFont(fontName)
    doc.text(ARABIC_SAMPLE, 40, 40)

    const pdf = doc.output('arraybuffer')
    const pdfBytes = Buffer.from(pdf)
    const pdfText = pdfBytes.toString('latin1')
    expect(pdfText).toContain('/BaseFont')
    expect(pdfText).toMatch(/Amiri/)
    expect(arrayBufferToBase64(fontBuffer).length).toBeGreaterThan(1000)

    const autoTable = (await import('jspdf-autotable')).default
    autoTable(doc, {
      head: [['مسؤول المبيعات', 'اسم الصنف']],
      body: [['team leader', ARABIC_SAMPLE]],
      startY: 60,
      ...reportPdfAutoTableOptions({ fontName, isRTL: true }),
    })
    const tablePdf = Buffer.from(doc.output('arraybuffer')).toString('latin1')
    expect(tablePdf).toMatch(/Amiri/)
    const fonts = doc.getFontList()
    expect(fonts.Amiri || fonts.amiri).toBeTruthy()
    expect(reportPdfAutoTableOptions({ fontName }).headStyles.fontStyle).toBe('normal')
  })

  it('smoke-checks Targets & Revenue sales/managers xlsx PK + Amiri PDF', async () => {
    const sales = buildTargetsRevenuePdfTable({
      tableTab: 'sales',
      salesRows: [{
        salesperson: 'أحمد',
        manager: 'سارة',
        project: joinExportNames(['شاي أحمر', 'honor']),
        source: 'فيسبوك',
        date: '2026-08-01',
        target: 10000,
        revenue: 8000,
        commissionRate: 4,
        commission: 320,
        aggregateAchievement: 80,
      }],
    })
    const managers = buildTargetsRevenuePdfTable({
      tableTab: 'managers',
      managerRows: [{
        name: 'سارة',
        date: '2026-08-01',
        target: 20000,
        revenue: 12000,
        commissionRate: 3,
        commission: 360,
        achievement: 60,
        members: [{
          name: 'أحمد',
          date: '2026-08-02',
          target: 10000,
          revenue: 8000,
          commissionRate: 4,
          commission: 320,
          achievement: 80,
        }],
      }],
    })

    expect(sales.head).not.toEqual(expect.arrayContaining(['Deal Type', 'Status']))
    expect(managers.head).not.toEqual(expect.arrayContaining(['Deal Type', 'Status']))
    expect(sales.head).toEqual(expect.arrayContaining(['Commission %', 'Commission']))

    const toObjects = ({ head, body }) => body.map((cells) => Object.fromEntries(head.map((key, i) => [key, cells[i]])))
    const salesBytes = writeXlsxArray(toObjects(sales), 'Sales')
    const managerBytes = writeXlsxArray(toObjects(managers), 'Managers')
    expect(salesBytes[0]).toBe(0x50)
    expect(salesBytes[1]).toBe(0x4b)
    expect(managerBytes[0]).toBe(0x50)
    expect(managerBytes[1]).toBe(0x4b)

    const wb = XLSX.read(salesBytes, { type: 'array' })
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
    expect(rows[0]['Sales Person']).toBe('أحمد')
    expect(rows[0].Project).toBe('شاي أحمر, honor')

    resetReportPdfFontCache()
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
    const fontName = await registerReportPdfFont(doc, { fontBuffer: fs.readFileSync(fontPath) })
    expect(fontName).toBe('Amiri')
    const pdfText = Buffer.from(doc.output('arraybuffer')).toString('latin1')
    expect(pdfText).toMatch(/Amiri/)
  })
})
