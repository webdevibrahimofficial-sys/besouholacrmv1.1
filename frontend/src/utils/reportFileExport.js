import * as XLSX from 'xlsx'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const ARABIC_FONT_FILE = 'Amiri-Regular.ttf'
const ARABIC_FONT_NAME = 'Amiri'
const ARABIC_FONT_URL = '/fonts/Amiri-Regular.ttf'

let cachedArabicFontBase64 = null

export function joinExportNames(names = []) {
  const unique = [...new Set(
    (Array.isArray(names) ? names : [])
      .map((name) => String(name || '').trim())
      .filter((name) => name && name !== '-')
  )]
  return unique.join(', ')
}

export function arrayBufferToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

export function writeXlsxArray(rows, sheetName = 'Sheet1') {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, String(sheetName || 'Sheet1').slice(0, 31))
  const output = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  if (output instanceof Uint8Array) return output
  if (typeof output === 'string') {
    const bytes = new Uint8Array(output.length)
    for (let i = 0; i < output.length; i += 1) bytes[i] = output.charCodeAt(i) & 0xFF
    return bytes
  }
  return new Uint8Array(output)
}

export function downloadXlsx({ rows, sheetName = 'Sheet1', fileName = 'export.xlsx' }) {
  const bytes = writeXlsxArray(rows, sheetName)
  const name = String(fileName || 'export.xlsx')
  const downloadName = /\.xlsx$/i.test(name) ? name : `${name}.xlsx`

  if (typeof document === 'undefined') return bytes

  const blob = new Blob([bytes], { type: XLSX_MIME })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = downloadName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return bytes
}

export async function registerReportPdfFont(doc, options = {}) {
  if (!cachedArabicFontBase64) {
    if (options.fontBase64) {
      cachedArabicFontBase64 = options.fontBase64
    } else if (options.fontBuffer) {
      cachedArabicFontBase64 = arrayBufferToBase64(options.fontBuffer)
    } else {
      const response = await fetch(options.fontUrl || ARABIC_FONT_URL)
      if (!response.ok) {
        throw new Error('Arabic PDF font missing at /fonts/Amiri-Regular.ttf')
      }
      cachedArabicFontBase64 = arrayBufferToBase64(await response.arrayBuffer())
    }
  }

  doc.addFileToVFS(ARABIC_FONT_FILE, cachedArabicFontBase64)
  doc.addFont(ARABIC_FONT_FILE, ARABIC_FONT_NAME, 'normal', 'normal', 'Identity-H')
  doc.setFont(ARABIC_FONT_NAME, 'normal')
  return ARABIC_FONT_NAME
}

export function reportPdfAutoTableOptions({
  fontName = ARABIC_FONT_NAME,
  isRTL = false,
  fillColor = [66, 139, 202],
  columnStyles = {},
} = {}) {
  return {
    styles: {
      font: fontName,
      fontStyle: 'normal',
      fontSize: 8,
      overflow: 'linebreak',
      cellPadding: 4,
      halign: isRTL ? 'right' : 'left',
    },
    headStyles: {
      font: fontName,
      fontStyle: 'normal',
      fillColor,
      textColor: 255,
      halign: isRTL ? 'right' : 'left',
    },
    bodyStyles: {
      font: fontName,
      fontStyle: 'normal',
    },
    columnStyles,
    didParseCell: (data) => {
      data.cell.styles.font = fontName
      data.cell.styles.fontStyle = 'normal'
    },
  }
}

export function resetReportPdfFontCache() {
  cachedArabicFontBase64 = null
}
