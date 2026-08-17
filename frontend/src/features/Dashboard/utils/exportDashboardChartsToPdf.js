const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

const nextFrame = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })

const chunkArray = (items, size) => {
  const source = Array.isArray(items) ? items : []
  if (!source.length || !size || size <= 0) return []
  const output = []
  for (let index = 0; index < source.length; index += size) {
    output.push(source.slice(index, index + size))
  }
  return output
}

const getChartsList = (charts) => {
  if (!Array.isArray(charts)) return []
  return charts.filter(Boolean).map((chart, index) => ({
    key: chart.key || `chart-${index + 1}`,
    title: chart.title || `Chart ${index + 1}`,
    ref: chart.ref || chart.captureRef || chart,
    monthlyData: Array.isArray(chart.monthlyData) ? chart.monthlyData : null,
    preparePage: typeof chart.preparePage === 'function' ? chart.preparePage : null,
    cleanup: typeof chart.cleanup === 'function' ? chart.cleanup : null,
  }))
}

const getDateRangeText = (dateRange) => {
  if (!dateRange) return '-'
  if (typeof dateRange === 'string') return dateRange
  if (typeof dateRange === 'object') {
    const from = String(dateRange.from || dateRange.dateFrom || '').trim()
    const to = String(dateRange.to || dateRange.dateTo || '').trim()
    if (from && to) return `${from} → ${to}`
    return from || to || '-'
  }
  return String(dateRange)
}

const loadArabicFont = async (doc) => {
  try {
    const response = await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/amiri/Amiri-Regular.ttf')
    if (!response.ok) return false
    const fontData = await response.arrayBuffer()
    const base64Font = btoa(
      new Uint8Array(fontData).reduce((acc, byte) => acc + String.fromCharCode(byte), '')
    )
    doc.addFileToVFS('Amiri-Regular.ttf', base64Font)
    doc.addFont('Amiri-Regular.ttf', 'Amiri-Regular', 'normal')
    doc.setFont('Amiri-Regular')
    return true
  } catch {
    return false
  }
}

const EXPORT_INLINE_PROPS = ['background-color', 'color', 'backdrop-filter', '-webkit-backdrop-filter']
const EXPORT_CSS_VARS = [
  '--color-text-primary',
  '--color-text-secondary',
  '--color-text-muted',
  '--theme-text',
  '--content-text',
  '--muted-text',
  '--glass-bg',
  '--card-bg',
]

const clearExportInlineStyles = (node) => {
  if (!node?.style) return
  EXPORT_INLINE_PROPS.forEach((prop) => node.style.removeProperty(prop))
  EXPORT_CSS_VARS.forEach((key) => node.style.removeProperty(key))
  node.querySelectorAll('.text-primary').forEach((el) => {
    el.style.removeProperty('color')
  })
}

const isDarkUi = () =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

const getExportTheme = () => {
  if (isDarkUi()) {
    return {
      backgroundColor: '#0f172a',
      color: '#f3f4f6',
      cssVars: {
        '--color-text-primary': '#f3f4f6',
        '--color-text-secondary': '#e5e7eb',
        '--color-text-muted': '#9ca3af',
        '--theme-text': '#f3f4f6',
        '--content-text': '#f3f4f6',
        '--muted-text': '#9ca3af',
        '--glass-bg': '#0f172a',
        '--card-bg': '#0f172a',
      },
    }
  }

  return {
    backgroundColor: '#ffffff',
    color: '#111827',
    cssVars: {
      '--color-text-primary': '#111827',
      '--color-text-secondary': '#1f2937',
      '--color-text-muted': '#4b5563',
      '--theme-text': '#111827',
      '--content-text': '#111827',
      '--muted-text': '#4b5563',
      '--glass-bg': '#ffffff',
      '--card-bg': '#ffffff',
    },
  }
}

const applyClonedExportTheme = (target, theme) => {
  if (!target?.style) return
  target.style.backgroundColor = theme.backgroundColor
  target.style.color = theme.color
  target.style.backdropFilter = 'none'
  target.style.webkitBackdropFilter = 'none'
  Object.entries(theme.cssVars).forEach(([key, value]) => {
    target.style.setProperty(key, value)
  })
  target.querySelectorAll('.text-primary').forEach((el) => {
    el.style.color = theme.color
  })
}

const applyCaptureStyles = (node) => {
  if (!node) return () => {}

  clearExportInlineStyles(node)

  const hiddenNodes = []
  node.querySelectorAll('[data-export-ignore="true"]').forEach((el) => {
    hiddenNodes.push({
      el,
      display: el.style.display,
      visibility: el.style.visibility,
    })
    el.style.display = 'none'
    el.style.visibility = 'hidden'
  })

  return () => {
    clearExportInlineStyles(node)
    hiddenNodes.forEach(({ el, display, visibility }) => {
      el.style.display = display
      el.style.visibility = visibility
    })
  }
}

const captureNodeAsPng = async (node) => {
  const { toPng } = await import('html-to-image')
  const theme = getExportTheme()
  const restore = applyCaptureStyles(node)
  try {
    await nextFrame()
    await wait(160)
    return await toPng(node, {
      cacheBust: true,
      pixelRatio: 3,
      backgroundColor: theme.backgroundColor,
      skipFonts: true,
      filter: (domNode) => !(domNode?.dataset?.exportIgnore === 'true'),
      onclone: (_clonedDoc, clonedNode) => {
        if (!clonedNode) return
        applyClonedExportTheme(clonedNode, theme)
        const originalCanvases = node.querySelectorAll('canvas')
        const clonedCanvases = clonedNode.querySelectorAll('canvas')
        originalCanvases.forEach((source, index) => {
          const dest = clonedCanvases[index]
          if (!dest) return
          dest.style.maxWidth = 'none'
          dest.width = source.width
          dest.height = source.height
          dest.style.width = `${source.clientWidth || source.width}px`
          dest.style.height = `${source.clientHeight || source.height}px`
          const ctx = dest.getContext('2d')
          if (ctx) ctx.drawImage(source, 0, 0)
        })
      },
    })
  } finally {
    restore()
  }
}

const drawHeader = ({ doc, pageWidth, margin, title, chartTitle, dateRange, reportYear, exportedAt, userName, isRTL, pageLabel }) => {
  const x = isRTL ? pageWidth - margin : margin
  const align = isRTL ? 'right' : 'left'

  doc.setFontSize(18)
  doc.setTextColor(17, 24, 39)
  doc.text(title, x, 32, { align })

  doc.setFontSize(12)
  doc.setTextColor(55, 65, 81)
  doc.text(chartTitle, x, 52, { align })

  doc.setFontSize(10)
  doc.setTextColor(75, 85, 99)
  doc.text(`${isRTL ? 'الفترة' : 'Date Range'}: ${dateRange}`, x, 70, { align })
  if (reportYear) {
    doc.text(`${isRTL ? 'سنة التقرير' : 'Report Year'}: ${reportYear}`, x, 84, { align })
  }
  doc.text(`${isRTL ? 'تاريخ التصدير' : 'Exported At'}: ${exportedAt}`, x, reportYear ? 98 : 84, { align })
  doc.text(`${isRTL ? 'المستخدم' : 'User'}: ${userName || '-'}`, x, reportYear ? 112 : 98, { align })

  if (pageLabel) {
    const pageX = isRTL ? margin : pageWidth - margin
    const pageAlign = isRTL ? 'left' : 'right'
    doc.text(pageLabel, pageX, 32, { align: pageAlign })
  }

  doc.setDrawColor(226, 232, 240)
  doc.line(margin, 108, pageWidth - margin, 108)
}

export async function exportDashboardChartsToPdf({
  charts,
  title,
  dateRange,
  reportYear,
  userName,
  fileName,
  maxMonthsPerPage = 12,
}) {
  const chartEntries = getChartsList(charts)
  if (!chartEntries.length) {
    throw new Error('No charts available for export')
  }

  const JsPDFModule = await import('jspdf')
  const jsPDF = JsPDFModule.default || JsPDFModule.jsPDF
  const isRTL = typeof document !== 'undefined' && document?.documentElement?.dir === 'rtl'
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a3',
    compress: true,
  })

  await loadArabicFont(doc)
  if (typeof doc.setR2L === 'function') {
    doc.setR2L(isRTL)
  }

  const margin = 36
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentTop = 126
  const contentWidth = pageWidth - (margin * 2)
  const contentHeight = pageHeight - contentTop - margin
  const exportedAt = new Date().toLocaleString(isRTL ? 'ar-EG' : 'en-US')
  const rangeText = getDateRangeText(dateRange)

  let isFirstPage = true

  for (const chart of chartEntries) {
    const pages = chart.monthlyData?.length
      ? chunkArray(chart.monthlyData, maxMonthsPerPage)
      : [null]

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      const pageData = pages[pageIndex]

      if (chart.preparePage) {
        await chart.preparePage({
          pageData,
          pageIndex,
          totalPages: pages.length,
          chart,
        })
      }

      await nextFrame()
      await nextFrame()
      await wait(280)

      const node = chart.ref?.current || chart.ref
      if (!node) {
        throw new Error(`Missing chart ref for ${chart.title}`)
      }

      const imageData = await captureNodeAsPng(node)

      if (!isFirstPage) {
        doc.addPage('a3', 'landscape')
      }
      isFirstPage = false

      const chartPageTitle = pages.length > 1
        ? `${chart.title} (${pageIndex + 1}/${pages.length})`
        : chart.title

      drawHeader({
        doc,
        pageWidth,
        margin,
        title,
        chartTitle: chartPageTitle,
        dateRange: rangeText,
        reportYear,
        exportedAt,
        userName,
        isRTL,
        pageLabel: `${isRTL ? 'صفحة' : 'Page'} ${doc.getNumberOfPages()}`,
      })

      const imageProps = doc.getImageProperties(imageData)
      const scale = Math.min(contentWidth / imageProps.width, contentHeight / imageProps.height)
      const renderWidth = imageProps.width * scale
      const renderHeight = imageProps.height * scale
      const x = margin + ((contentWidth - renderWidth) / 2)
      const y = contentTop + ((contentHeight - renderHeight) / 2)

      doc.addImage(imageData, 'PNG', x, y, renderWidth, renderHeight)
    }

    if (chart.cleanup) {
      await chart.cleanup()
      await nextFrame()
    }
  }

  doc.save(fileName || 'dashboard-charts-report.pdf')
}

export default exportDashboardChartsToPdf
