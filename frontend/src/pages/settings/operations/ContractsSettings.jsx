import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  CheckCircle2,
  ChevronDown,
  Copy,
  Eye,
  FilePlus2,
  FileText,
  FolderKanban,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  Paintbrush,
  RefreshCcw,
  Redo2,
  Table as TableIcon,
  Save,
  Scissors,
  Search,
  Sparkles,
  Trash2,
  Underline,
  Undo2,
  Upload,
  X,
} from 'lucide-react'
import { api } from '@utils/api'
import { createContractTemplate, deleteContractTemplate, getContractTemplates, updateContractTemplate } from '@services/contractTemplateService'
import { extractTenantCompanyProfile } from '@shared/utils/tenantCompanyProfile'
import { EditorContent, useEditor } from '@tiptap/react'
import { Extension, Node } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import UnderlineExtension from '@tiptap/extension-underline'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'

const emptyDraft = () => ({
  id: null,
  name: '',
  project_id: '',
  status: 'Active',
  content_type: 'html', // html|pdf
  body: '',
  pdf_url: '',
  pdf_original_name: '',
})

const stripWordTipsFromHtml = (html) => {
  const raw = String(html || '')
  if (!raw) return raw

  const shouldStrip = /Word\s*:|Ù†ØµØ§Ø¦Ø­\s*Ø¹Ù†Ø¯\s*Ù†Ù‚Ù„\s*Ø§Ù„Ù…Ø­ØªÙˆÙ‰/i.test(raw)
  if (!shouldStrip) return raw

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(raw, 'text/html')
    const body = doc?.body
    if (!body) return raw

    const matchesTips = (text) => {
      const t = String(text || '')
      if (!t.trim()) return false
      return (
        /Word\s*:/i.test(t) ||
        /Ù†ØµØ§Ø¦Ø­\s*Ø¹Ù†Ø¯\s*Ù†Ù‚Ù„\s*Ø§Ù„Ù…Ø­ØªÙˆÙ‰/i.test(t) ||
        t.includes('Ù‚Ù… Ø¨Ù†Ø³Ø®') ||
        t.includes('ÙˆÙ„ØµÙ‚Ù‡') ||
        t.includes('ØªØ£ÙƒØ¯ Ù…Ù† ÙƒØªØ§Ø¨Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª') ||
        t.includes('Ø¨ÙŠÙ† Ø§Ù„Ù‚ÙˆØ³ÙŠÙ†') ||
        t.includes('ÙŠÙØ¶Ù„ Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ø¹Ù‚Ø¯') ||
        t.includes('Ù…Ø­Ø§Ù…') ||
        t.includes('Ù„Ø¶Ù…Ø§Ù† Ø§Ù„ØªÙˆØ§ÙÙ‚') ||
        t.includes('Ø§Ù„Ù‚ÙˆØ§Ù†ÙŠÙ† Ø§Ù„Ù…Ø­Ù„ÙŠØ©')
      )
    }

    const all = Array.from(body.querySelectorAll('*'))
    for (const el of all) {
      const text = el.textContent || ''
      if (!matchesTips(text)) continue

      const prev = el.previousElementSibling
      if (prev && prev.tagName === 'HR') {
        try {
          prev.remove()
        } catch {}
      }

      try {
        el.remove()
      } catch {}
    }

    return body.innerHTML
  } catch {
    return raw
  }
}

const WORD_FONT_OPTIONS = [
  'Arial',
  'Arial Black',
  'Aptos',
  'Aptos Display',
  'Aptos Narrow',
  'Bahnschrift',
  'Book Antiqua',
  'Calibri',
  'Calibri Light',
  'Cambria',
  'Cambria Math',
  'Candara',
  'Century Gothic',
  'Comic Sans MS',
  'Consolas',
  'Constantia',
  'Corbel',
  'Courier New',
  'Ebrima',
  'Franklin Gothic Medium',
  'Gabriola',
  'Gadugi',
  'Georgia',
  'Garamond',
  'Helvetica',
  'Impact',
  'Ink Free',
  'Javanese Text',
  'Lucida Bright',
  'Lucida Console',
  'Lucida Sans Unicode',
  'Malgun Gothic',
  'Marlett',
  'Meiryo',
  'Microsoft Himalaya',
  'Microsoft JhengHei',
  'Microsoft New Tai Lue',
  'Microsoft PhagsPa',
  'Microsoft Sans Serif',
  'Microsoft Tai Le',
  'Microsoft YaHei',
  'Mongolian Baiti',
  'Monotype Corsiva',
  'MV Boli',
  'Nirmala UI',
  'Palatino Linotype',
  'Segoe Print',
  'Segoe Script',
  'Segoe UI',
  'Segoe UI Emoji',
  'Segoe UI Historic',
  'Segoe UI Symbol',
  'Sylfaen',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
  'Yu Gothic',
]

function RibbonButton({ active, disabled, onClick, title, children, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        'h-9 min-w-9 px-2 rounded-lg border border-transparent',
        'inline-flex items-center justify-center gap-2 text-sm',
        disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-black/5 dark:hover:bg-white/10',
        active ? 'bg-black/5 dark:bg-white/10 border-[var(--panel-border)]' : '',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function RibbonGroup({ title, children, className = '' }) {
  return (
    <div className={['flex items-center gap-2 px-3 py-2 border-r border-[var(--panel-border)] last:border-r-0', className].join(' ')}>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
      {title ? <div className="sr-only">{title}</div> : null}
    </div>
  )
}

function ContractHeader({
  logoUrl,
  tenantName,
  description,
  phone,
  email,
  taxId,
  websiteUrl,
  addrLines,
  cityLine,
  tenantLabel,
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-10 py-6 border-b border-gray-200">
      <div className="flex items-center gap-3">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={tenantName || 'Tenant Logo'}
            className="h-10 w-auto object-contain"
          />
        ) : (
          <div className="h-10 w-10 rounded bg-gray-100 border border-gray-200" />
        )}
        <div>
          <div className="font-semibold text-gray-900">{tenantName || tenantLabel}</div>
          {description ? <div className="text-xs text-gray-600 mt-1">{description}</div> : null}
        </div>
      </div>
      <div className="text-right text-xs text-gray-700">
        {Array.isArray(addrLines) && addrLines.map((line, index) => (
          <div key={`${line}-${index}`}>{line}</div>
        ))}
        {cityLine ? <div>{cityLine}</div> : null}
        {phone ? <div><span className="text-gray-500">Phone:</span> {phone}</div> : null}
        {email ? <div><span className="text-gray-500">Email:</span> {email}</div> : null}
        {taxId ? <div><span className="text-gray-500">Tax No.:</span> {taxId}</div> : null}
        {websiteUrl ? <div><span className="text-gray-500">Web:</span> {websiteUrl}</div> : null}
      </div>
    </div>
  )
}

function ContractPageFrame({
  children,
  viewMode,
  zoomLevel,
  showTableGridlines,
  isRTL,
  tenantInfo,
  tenantLabel,
}) {
  return (
    <div className="w-full flex justify-center">
      <div
        className={`w-full rounded-2xl border border-[var(--panel-border)] overflow-visible bg-white text-black shadow ${
          viewMode === 'pageWidth' ? 'max-w-[1160px]' : 'max-w-[900px]'
        }`}
        style={{
          fontFamily: '"Times New Roman", Times, serif',
          zoom: `${zoomLevel}%`,
        }}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <ContractHeader
          logoUrl={tenantInfo?.logoUrl}
          tenantName={tenantInfo?.name}
          description={tenantInfo?.description}
          phone={tenantInfo?.phone}
          email={tenantInfo?.email}
          taxId={tenantInfo?.taxId}
          websiteUrl={tenantInfo?.websiteUrl}
          addrLines={tenantInfo?.addrLines}
          cityLine={tenantInfo?.cityLine}
          tenantLabel={tenantLabel}
        />
        <div className={`px-10 py-8 ${showTableGridlines ? 'contracts-gridlines-on' : ''}`}>{children}</div>
      </div>
    </div>
  )
}

const TextStyleWordExtras = Extension.create({
  name: 'textStyleWordExtras',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (element) => {
              const ff = element?.style?.fontFamily || ''
              const cleaned = String(ff).replace(/['"]/g, '').trim()
              return cleaned || null
            },
            renderHTML: (attributes) => {
              if (!attributes.fontFamily) return {}
              return { style: `font-family: ${attributes.fontFamily}` }
            },
          },
          fontSize: {
            default: null,
            parseHTML: (element) => {
              const fs = element?.style?.fontSize || ''
              const cleaned = String(fs).trim()
              return cleaned || null
            },
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {}
              return { style: `font-size: ${attributes.fontSize}` }
            },
          },
        },
      },
    ]
  },
})

const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div.page-break' }]
  },

  renderHTML() {
    return ['div', { class: 'page-break', style: 'page-break-before: always; border-top: 2px dashed #cbd5e1; margin: 16px 0;' }]
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: this.name }).run(),
    }
  },
})

const PageNumberToken = Node.create({
  name: 'pageNumberToken',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'span.page-number-token' }]
  },

  renderHTML() {
    return ['span', { class: 'page-number-token', contenteditable: 'false' }, 'Page #']
  },

  addCommands() {
    return {
      setPageNumberToken:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: this.name }).run(),
    }
  },
})

function WordLikeRibbon({
  editor,
  t,
  insertPlaceholder,
  viewMode,
  setViewMode,
  zoomLevel,
  setZoomLevel,
  showTableGridlines,
  setShowTableGridlines,
}) {
  const [fontFamily, setFontFamily] = useState('Times New Roman')
  const [fontSize, setFontSize] = useState('10pt')
  const [activeMenu, setActiveMenu] = useState('edit')
  const [stylesOpen, setStylesOpen] = useState(false)
  const [headingOpen, setHeadingOpen] = useState(false)
  const [selectOpen, setSelectOpen] = useState(false)
  const [insertTableOpen, setInsertTableOpen] = useState(false)
  const [insertTablePreview, setInsertTablePreview] = useState({ rows: 3, cols: 3 })
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [formatPainterOn, setFormatPainterOn] = useState(false)
  const painterSnapshotRef = useRef(null)

  const stylesRef = useRef(null)
  const headingRef = useRef(null)
  const selectRef = useRef(null)
  const insertTableRef = useRef(null)
  const imageInputRef = useRef(null)

  const can = (fn) => {
    if (!editor) return false
    try {
      return !!fn()
    } catch {
      return false
    }
  }

  const applyTextStyle = (attrs) => {
    if (!editor) return
    editor.chain().focus().setMark('textStyle', attrs).run()
  }

  const onChangeFontFamily = (next) => {
    setFontFamily(next)
    applyTextStyle({ fontFamily: next })
  }

  const onChangeFontSize = (next) => {
    const v = String(next || '').trim()
    if (!v) return
    const normalized = /^\d+$/.test(v) ? `${v}pt` : v
    setFontSize(normalized)
    applyTextStyle({ fontSize: normalized })
  }

  const currentStyle = useMemo(() => {
    if (!editor) return { kind: 'paragraph', label: 'Normal' }
    if (editor.isActive('heading', { level: 1 })) return { kind: 'heading', level: 1, label: 'Heading 1' }
    if (editor.isActive('heading', { level: 2 })) return { kind: 'heading', level: 2, label: 'Heading 2' }
    if (editor.isActive('heading', { level: 3 })) return { kind: 'heading', level: 3, label: 'Heading 3' }
    return { kind: 'paragraph', label: 'Normal' }
  }, [editor, editor?.state])

  const headingLabel = currentStyle?.kind === 'heading' ? `Heading ${currentStyle.level}` : 'Normal'

  useEffect(() => {
    const onDown = (e) => {
      const tEl = e?.target
      if (!tEl) return

      const isInside = (ref) => {
        const el = ref?.current
        return el && (el === tEl || el.contains(tEl))
      }

      if (stylesOpen && !isInside(stylesRef)) setStylesOpen(false)
      if (headingOpen && !isInside(headingRef)) setHeadingOpen(false)
      if (selectOpen && !isInside(selectRef)) setSelectOpen(false)
      if (insertTableOpen && !isInside(insertTableRef)) setInsertTableOpen(false)
    }

    window.addEventListener('mousedown', onDown, true)
    return () => window.removeEventListener('mousedown', onDown, true)
  }, [stylesOpen, headingOpen, selectOpen, insertTableOpen])

  useEffect(() => {
    if (insertTableOpen) setInsertTablePreview({ rows: 3, cols: 3 })
  }, [insertTableOpen])

  const doFindNext = () => {
    const q = String(findQuery || '').trim()
    if (!q) return
    try {
      editor?.chain().focus().run()
    } catch {}
    try {
      // window.find selects inside the contentEditable and scrolls to it.
      window.find(q, false, false, true)
    } catch {}
  }

  const doReplaceOne = () => {
    const q = String(findQuery || '').trim()
    if (!q) return
    try {
      editor?.chain().focus().run()
    } catch {}

    // If nothing selected, find first.
    try {
      if (editor?.state?.selection?.empty) doFindNext()
    } catch {}

    try {
      if (!editor) return
      editor.chain().focus().insertContent(String(replaceQuery ?? '')).run()
      doFindNext()
    } catch {}
  }

  const doReplaceAll = () => {
    const q = String(findQuery || '').trim()
    if (!q) return
    try {
      editor?.chain().focus().run()
    } catch {}

    let guard = 0
    while (guard < 500) {
      guard += 1
      let found = false
      try {
        found = !!window.find(q, false, false, true)
      } catch {
        found = false
      }
      if (!found) break
      try {
        editor?.chain().focus().insertContent(String(replaceQuery ?? '')).run()
      } catch {
        break
      }
    }
  }

  const focusEditor = () => {
    try {
      editor?.chain().focus().run()
    } catch {}
  }

  const doCopy = () => {
    focusEditor()
    try {
      document.execCommand?.('copy')
    } catch {}
  }

  const doCut = () => {
    focusEditor()
    try {
      document.execCommand?.('cut')
    } catch {}
  }

  const doPaste = async () => {
    focusEditor()
    // Prefer clipboard API (works in modern browsers when allowed).
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        editor?.chain().focus().insertContent(text).run()
        return
      }
    } catch {}

    // Fallback (may be blocked by browser permissions).
    try {
      document.execCommand?.('paste')
    } catch {}
  }

  const doUndo = () => {
    if (!editor) return
    try {
      editor.commands.focus()
      editor.commands.undo()
    } catch {
      try {
        editor.chain().focus().undo().run()
      } catch {}
    }
  }

  const doRedo = () => {
    if (!editor) return
    try {
      editor.commands.focus()
      editor.commands.redo()
    } catch {
      try {
        editor.chain().focus().redo().run()
      } catch {}
    }
  }

  const toggleFormatPainter = () => {
    if (!editor) return

    const nextOn = !formatPainterOn
    setFormatPainterOn(nextOn)

    if (!nextOn) {
      painterSnapshotRef.current = null
      return
    }

    const textStyleAttrs = editor.getAttributes('textStyle') || {}
    painterSnapshotRef.current = {
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      color: editor.getAttributes('textStyle')?.color || editor.getAttributes('textStyle')?.color,
      fontFamily: textStyleAttrs.fontFamily || null,
      fontSize: textStyleAttrs.fontSize || null,
    }
  }

  useEffect(() => {
    if (!editor) return
    if (!formatPainterOn) return

    const applyPainter = () => {
      const snap = painterSnapshotRef.current
      if (!snap) return
      const empty = editor.state?.selection?.empty
      if (empty) return

      try {
        const chain = editor.chain().focus()

        if (snap.bold) chain.setBold?.()
        else chain.unsetBold?.()

        if (snap.italic) chain.setItalic?.()
        else chain.unsetItalic?.()

        if (snap.underline) chain.setUnderline?.()
        else chain.unsetUnderline?.()

        const styleAttrs = {}
        if (snap.fontFamily) styleAttrs.fontFamily = snap.fontFamily
        if (snap.fontSize) styleAttrs.fontSize = snap.fontSize
        if (Object.keys(styleAttrs).length) chain.setMark('textStyle', styleAttrs)

        // Color extension uses setColor/unsetColor.
        if (snap.color) chain.setColor?.(snap.color)

        chain.run()
      } catch {}

      // One-shot behavior like Word.
      setFormatPainterOn(false)
      painterSnapshotRef.current = null
    }

    editor.on('selectionUpdate', applyPainter)
    return () => {
      try {
        editor.off('selectionUpdate', applyPainter)
      } catch {}
    }
  }, [editor, formatPainterOn])

  const handleInsertImageClick = () => {
    imageInputRef.current?.click?.()
  }

  const handleImageSelected = async (event) => {
    const file = event?.target?.files?.[0]
    if (!file || !editor) return

    try {
      const reader = new FileReader()
      reader.onload = () => {
        const src = String(reader.result || '')
        if (!src) return
        editor.chain().focus().setImage({ src, alt: file.name || 'Inserted image' }).run()
      }
      reader.readAsDataURL(file)
    } catch {}

    try {
      event.target.value = ''
    } catch {}
  }

  const handleInsertTextBox = () => {
    if (!editor) return
    editor
      .chain()
      .focus()
      .insertContent(`
        <table style="width:100%; border:1px solid #cbd5e1; border-collapse:collapse; margin:12px 0;">
          <tr>
            <td style="padding:12px;">${t('Type text here')}</td>
          </tr>
        </table>
      `)
      .run()
  }

  const handleInsertLink = () => {
    if (!editor) return
    const href = String(window.prompt(t('Enter link URL'), 'https://') || '').trim()
    if (!href) return
    const text = String(window.prompt(t('Link text'), href) || '').trim() || href

    editor
      .chain()
      .focus()
      .insertContent(`<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`)
      .run()
  }

  const handleInsertPageBreak = () => {
    if (!editor) return
    editor.chain().focus().setPageBreak().run()
  }

  const handleInsertBlankPage = () => {
    if (!editor) return
    editor.chain().focus().setPageBreak().insertContent('<p><br /></p>').run()
    setInsertTableOpen(false)
  }

  const handleInsertPageNumber = () => {
    if (!editor) return
    editor.chain().focus().setPageNumberToken().run()
    setInsertTableOpen(false)
  }

  const handleInsertHeaderFooterBlock = () => {
    if (!editor) return
    editor
      .chain()
      .focus()
      .insertContent(`
        <div class="contract-header-footer-block">
          <div class="contract-header-footer-title">Header &amp; Footer</div>
          <div class="contract-header-footer-text">Header/footer are managed automatically from tenant settings in this template.</div>
        </div>
      `)
      .run()
    setInsertTableOpen(false)
  }

  const handleInsertTable = (rows, cols) => {
    if (!editor) return
    const safeRows = Math.max(1, Math.min(10, Number(rows) || 0))
    const safeCols = Math.max(1, Math.min(10, Number(cols) || 0))
    editor.chain().focus().insertTable({ rows: safeRows, cols: safeCols, withHeaderRow: true }).run()
    setInsertTableOpen(false)
  }

  const escapeHtml = (value) =>
    String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')

  const buildTableHtmlFromGrid = (grid) => {
    const rows = Array.isArray(grid) ? grid : []
    const body = rows.map((row, rowIndex) => {
      const cells = Array.isArray(row) ? row : []
      const cellTag = rowIndex === 0 ? 'th' : 'td'
      return `<tr>${cells.map((cell) => `<${cellTag}>${escapeHtml(cell)}</${cellTag}>`).join('')}</tr>`
    }).join('')

    return `
      <table style="width:100%; border-collapse:collapse; margin:12px 0;">
        <tbody>${body}</tbody>
      </table>
    `
  }

  const handleDrawTable = () => {
    if (!editor) return
    const rows = Number(window.prompt(t('Rows'), '3') || '3')
    const cols = Number(window.prompt(t('Columns'), '3') || '3')
    handleInsertTable(rows, cols)
  }

  const handleConvertTextToTable = () => {
    if (!editor) return
    const { state } = editor
    const selection = state?.selection
    if (!selection || selection.empty) {
      window.alert(t('Please select text to convert into a table.'))
      return
    }

    const raw = state.doc.textBetween(selection.from, selection.to, '\n')
    const lines = String(raw || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    if (!lines.length) return

    const grid = lines.map((line) => line.split('\t').map((cell) => cell.trim()))
    const maxCols = Math.max(...grid.map((row) => row.length), 1)
    const normalized = grid.map((row) => Array.from({ length: maxCols }, (_, idx) => row[idx] || ''))

    const tableHtml = buildTableHtmlFromGrid(normalized)
    editor.chain().focus().deleteSelection().insertContent(tableHtml).run()
    setInsertTableOpen(false)
  }

  const handleConvertTableToText = () => {
    if (!editor) return
    const { state } = editor
    const { $from } = state.selection
    let tableDepth = -1

    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth)?.type?.name === 'table') {
        tableDepth = depth
        break
      }
    }

    if (tableDepth < 0) {
      window.alert(t('Place the cursor inside a table to convert it to text.'))
      return
    }

    const tableNode = $from.node(tableDepth)
    const tableRows = []

    tableNode.forEach((rowNode) => {
      const cells = []
      rowNode.forEach((cellNode) => {
        const text = String(cellNode?.textContent || '').trim()
        cells.push(text)
      })
      tableRows.push(cells)
    })

    const from = $from.before(tableDepth)
    const to = $from.after(tableDepth)
    const textHtml = tableRows
      .map((row) => `<p>${escapeHtml(row.filter(Boolean).join(' | '))}</p>`)
      .join('')

    editor.chain().focus().deleteRange({ from, to }).insertContent(textHtml).run()
    setInsertTableOpen(false)
  }

  return (
    <div className="border border-[var(--panel-border)] rounded-2xl overflow-visible bg-white text-black shadow-sm">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageSelected}
      />
      <div className="border-b border-[var(--panel-border)] bg-[#f7f7f7] px-3 pt-2">
        <div className="flex flex-wrap items-center gap-1">
          {[
            { key: 'edit', label: t('Edit') },
            { key: 'insert', label: t('Insert') },
            { key: 'format', label: t('Format') },
            { key: 'view', label: t('View') },
            { key: 'help', label: t('Help') },
          ].map((menu) => (
            <button
              key={menu.key}
              type="button"
              onClick={() => setActiveMenu(menu.key)}
              className={`px-3 py-2 text-sm rounded-t-xl border border-b-0 transition-colors ${
                activeMenu === menu.key
                  ? 'bg-white border-[var(--panel-border)] text-black'
                  : 'border-transparent text-gray-600 hover:text-black hover:bg-white/70'
              }`}
            >
              {menu.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative flex flex-wrap items-center gap-0 px-2 py-2 min-h-[88px] overflow-visible">
        {activeMenu === 'edit' && (
          <>
            <RibbonGroup title={t('History')}>
              <RibbonButton title={t('Undo')} disabled={!editor || !can(() => editor.can().chain().focus().undo().run())} onClick={doUndo} className="px-2">
                <Undo2 className="h-4 w-4" />
              </RibbonButton>
              <RibbonButton title={t('Redo')} disabled={!editor || !can(() => editor.can().chain().focus().redo().run())} onClick={doRedo} className="px-2">
                <Redo2 className="h-4 w-4" />
              </RibbonButton>
            </RibbonGroup>

            <RibbonGroup title={t('Clipboard')}>
              <RibbonButton title={t('Format Painter')} disabled={!editor} onClick={toggleFormatPainter} active={formatPainterOn} className="px-2">
                <Paintbrush className="h-4 w-4" />
              </RibbonButton>
              <RibbonButton title={t('Paste')} disabled={!editor} onClick={doPaste} className="px-2">
                <Copy className="h-4 w-4" />
              </RibbonButton>
              <RibbonButton title={t('Cut')} disabled={!editor} onClick={doCut} className="px-2">
                <Scissors className="h-4 w-4" />
              </RibbonButton>
              <RibbonButton title={t('Copy')} disabled={!editor} onClick={doCopy} className="px-2">
                <Copy className="h-4 w-4" />
              </RibbonButton>
            </RibbonGroup>

            <div className="flex-1" />

            <RibbonGroup title={t('Editing')} className="border-r-0">
              <RibbonButton
                title={t('Find and Replace')}
                disabled={!editor}
                onClick={() => {
                  if (!editor) return
                  setFindOpen(true)
                  setSelectOpen(false)
                }}
                className="px-2"
              >
                <Search className="h-4 w-4" />
              </RibbonButton>

              <div className="relative" ref={selectRef}>
                <RibbonButton
                  title={t('Select')}
                  disabled={!editor}
                  onClick={() => {
                    if (!editor) return
                    setSelectOpen((v) => !v)
                  }}
                  className="px-2"
                >
                  <ChevronDown className="h-4 w-4" />
                </RibbonButton>

                {selectOpen && (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-[30000] w-[180px] rounded-xl border border-[var(--panel-border)] bg-white shadow-xl overflow-hidden">
                    <button
                      type="button"
                      className="w-full text-left px-4 py-2.5 hover:bg-black/5 text-sm"
                      onClick={() => {
                        editor?.chain().focus().selectAll().run()
                        setSelectOpen(false)
                      }}
                    >
                      {t('Select All')}
                    </button>
                  </div>
                )}
              </div>
            </RibbonGroup>
          </>
        )}

        {activeMenu === 'insert' && (
          <>
            <RibbonGroup title={t('Insert')} className="gap-3">
              <div className="relative" ref={insertTableRef}>
                <RibbonButton
                  title={t('Insert Table')}
                  disabled={!editor}
                  onClick={() => {
                    if (!editor) return
                    setInsertTableOpen((v) => !v)
                  }}
                  className="px-3 min-w-[140px] justify-between"
                >
                  <span className="inline-flex items-center gap-2">
                    <span>{t('Table')}</span>
                  </span>
                  <ChevronDown className="h-4 w-4" />
                </RibbonButton>

                {insertTableOpen && (
                  <div className="absolute left-0 top-[calc(100%+10px)] z-[30000] w-[312px] rounded-2xl border border-[var(--panel-border)] bg-white shadow-2xl overflow-hidden">
                    <div className="px-4 py-3 bg-black/[0.03] text-sm font-medium text-slate-700">
                      {t('Insert Table')}
                    </div>
                    <div className="px-4 pt-4" onMouseLeave={() => setInsertTablePreview({ rows: 3, cols: 3 })}>
                      <div className="grid grid-cols-10 gap-1.5">
                        {Array.from({ length: 100 }).map((_, index) => {
                          const row = Math.floor(index / 10) + 1
                          const col = (index % 10) + 1
                          const active = row <= insertTablePreview.rows && col <= insertTablePreview.cols
                          return (
                            <button
                              key={`${row}-${col}`}
                              type="button"
                              className={`h-8 w-8 border border-slate-400 transition-colors ${
                                active ? 'bg-blue-500 border-blue-600' : 'bg-white hover:bg-blue-50'
                              }`}
                              title={`${row} x ${col}`}
                              onMouseEnter={() => setInsertTablePreview({ rows: row, cols: col })}
                              onClick={() => handleInsertTable(insertTablePreview.rows, insertTablePreview.cols)}
                            />
                          )
                        })}
                      </div>
                    </div>
                    <div className="mt-4 border-t border-[var(--panel-border)]">
                      <button
                        type="button"
                        className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-black/5"
                        onClick={() => handleInsertTable(insertTablePreview.rows, insertTablePreview.cols)}
                      >
                        <TableIcon className="h-5 w-5" />
                        <span>{t('Insert Table')}</span>
                      </button>
                      <button
                        type="button"
                        className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-black/5"
                        onClick={handleDrawTable}
                      >
                        <Paintbrush className="h-5 w-5" />
                        <span>{t('Draw Table')}</span>
                      </button>
                      <button
                        type="button"
                        className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-black/5"
                        onClick={handleConvertTextToTable}
                      >
                        <span className="h-5 w-5 inline-flex items-center justify-center text-lg leading-none">↔</span>
                        <span>{t('Convert Text to Table...')}</span>
                      </button>
                      <button
                        type="button"
                        className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-black/5"
                        onClick={handleConvertTableToText}
                      >
                        <span className="h-5 w-5 inline-flex items-center justify-center text-lg leading-none">↕</span>
                        <span>{t('Convert Table to Text...')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <select
                className="h-9 px-3 rounded-lg bg-white border border-[var(--panel-border)] text-sm min-w-[240px]"
                defaultValue=""
                onChange={(e) => {
                  const v = e.target.value
                  if (v) insertPlaceholder(v)
                  e.target.value = ''
                }}
                title={t('Insert Field')}
              >
                <option value="">{t('+ Insert Field')}</option>
                <option value="{{contract_number}}">{t('Contract No.')}</option>
                <option value="{{contract_date}}">{t('Contract Date')}</option>
                <option value="{{customer_name}}">{t('Customer Name')}</option>
                <option value="{{customer_phone}}">{t('Customer Phone')}</option>
                <option value="{{unit_code}}">{t('Unit Code')}</option>
                <option value="{{project_name}}">{t('Project')}</option>
                <option value="{{total_price}}">{t('Total Price')}</option>
                <option value="{{payment_plan_table}}">{t('Payment Plan Table')}</option>
                <option value="{{installments_table}}">{t('Installments Table')}</option>
              </select>
              <RibbonButton title={t('Insert Picture')} disabled={!editor} onClick={handleInsertImageClick}>
                <ImagePlus className="h-4 w-4" />
                <span>{t('Picture')}</span>
              </RibbonButton>
              <RibbonButton title={t('Insert Text Box')} disabled={!editor} onClick={handleInsertTextBox}>
                <FileText className="h-4 w-4" />
                <span>{t('Text Box')}</span>
              </RibbonButton>
              <RibbonButton title={t('Insert Link')} disabled={!editor} onClick={handleInsertLink}>
                <Link2 className="h-4 w-4" />
                <span>{t('Link')}</span>
              </RibbonButton>
              <RibbonButton title={t('Blank Page')} disabled={!editor} onClick={handleInsertBlankPage}>
                <span>{t('Blank Page')}</span>
              </RibbonButton>
              <RibbonButton title={t('Page Number')} disabled={!editor} onClick={handleInsertPageNumber}>
                <span>{t('Page Number')}</span>
              </RibbonButton>
              <RibbonButton title={t('Header and Footer')} disabled={!editor} onClick={handleInsertHeaderFooterBlock}>
                <span>{t('Header and Footer')}</span>
              </RibbonButton>
              <RibbonButton title={t('Page Break')} disabled={!editor} onClick={handleInsertPageBreak}>
                <span>{t('Page Break')}</span>
              </RibbonButton>
            </RibbonGroup>
            <div className="flex-1" />
            <div className="px-4 text-xs text-gray-500">
              {t('Insert merge fields, images, links, text boxes, or build a structured table inside the contract body.')}
            </div>
          </>
        )}

        {activeMenu === 'format' && (
          <>
            <RibbonGroup title={t('History')} className="gap-3">
              <RibbonButton
                title={t('Undo')}
                disabled={!editor}
                onClick={doUndo}
                className="px-2 h-8 min-w-8"
              >
                <Undo2 className="h-4 w-4" />
              </RibbonButton>
              <RibbonButton
                title={t('Redo')}
                disabled={!editor}
                onClick={doRedo}
                className="px-2 h-8 min-w-8"
              >
                <Redo2 className="h-4 w-4" />
              </RibbonButton>
            </RibbonGroup>

            <RibbonGroup title={t('Font')} className="gap-3">
              <select
                className="h-9 px-3 rounded-lg bg-white border border-[var(--panel-border)] text-sm min-w-[220px]"
                value={fontFamily}
                onChange={(e) => onChangeFontFamily(e.target.value)}
                title={t('Font Family')}
              >
                {WORD_FONT_OPTIONS.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>
              <select
                className="h-9 px-3 rounded-lg bg-white border border-[var(--panel-border)] text-sm w-[88px]"
                value={fontSize}
                onChange={(e) => onChangeFontSize(e.target.value)}
                title={t('Font Size')}
              >
                {['8pt', '9pt', '10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '20pt', '24pt', '28pt', '32pt'].map((s) => (
                  <option key={s} value={s}>
                    {s.replace('pt', '')}
                  </option>
                ))}
              </select>

              <RibbonButton
                title={t('Bold')}
                active={!!editor?.isActive('bold')}
                disabled={!editor || !can(() => editor.can().chain().focus().toggleBold().run())}
                onClick={() => editor?.chain().focus().toggleBold().run()}
              >
                <Bold className="h-4 w-4" />
              </RibbonButton>
              <RibbonButton
                title={t('Italic')}
                active={!!editor?.isActive('italic')}
                disabled={!editor || !can(() => editor.can().chain().focus().toggleItalic().run())}
                onClick={() => editor?.chain().focus().toggleItalic().run()}
              >
                <Italic className="h-4 w-4" />
              </RibbonButton>
              <RibbonButton
                title={t('Underline')}
                active={!!editor?.isActive('underline')}
                disabled={!editor || !can(() => editor.can().chain().focus().toggleUnderline().run())}
                onClick={() => editor?.chain().focus().toggleUnderline().run()}
              >
                <Underline className="h-4 w-4" />
              </RibbonButton>

              <label className="h-9 px-2 rounded-lg inline-flex items-center gap-2 hover:bg-black/5">
                <span className="text-xs opacity-80">{t('A')}</span>
                <input
                  type="color"
                  className="h-6 w-6 bg-transparent border-0 p-0"
                  onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()}
                  title={t('Text Color')}
                />
              </label>
            </RibbonGroup>

            <RibbonGroup title={t('Paragraph')} className="gap-3">
              <RibbonButton title={t('Bullets')} active={!!editor?.isActive('bulletList')} disabled={!editor} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
                <List className="h-4 w-4" />
              </RibbonButton>
              <RibbonButton title={t('Numbering')} active={!!editor?.isActive('orderedList')} disabled={!editor} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
                <ListOrdered className="h-4 w-4" />
              </RibbonButton>
              <RibbonButton title={t('Decrease Indent')} disabled={!editor} onClick={() => editor?.chain().focus().liftListItem('listItem').run()}>
                <IndentDecrease className="h-4 w-4" />
              </RibbonButton>
              <RibbonButton title={t('Increase Indent')} disabled={!editor} onClick={() => editor?.chain().focus().sinkListItem('listItem').run()}>
                <IndentIncrease className="h-4 w-4" />
              </RibbonButton>
              <RibbonButton title={t('Align Left')} disabled={!editor} onClick={() => editor?.chain().focus().setTextAlign('left').run()}>
                <AlignLeft className="h-4 w-4" />
              </RibbonButton>
              <RibbonButton title={t('Align Center')} disabled={!editor} onClick={() => editor?.chain().focus().setTextAlign('center').run()}>
                <AlignCenter className="h-4 w-4" />
              </RibbonButton>
              <RibbonButton title={t('Align Right')} disabled={!editor} onClick={() => editor?.chain().focus().setTextAlign('right').run()}>
                <AlignRight className="h-4 w-4" />
              </RibbonButton>
              <RibbonButton title={t('Justify')} disabled={!editor} onClick={() => editor?.chain().focus().setTextAlign('justify').run()}>
                <AlignJustify className="h-4 w-4" />
              </RibbonButton>
            </RibbonGroup>

            <RibbonGroup title={t('Styles')} className="gap-2 border-r-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative" ref={stylesRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setStylesOpen((v) => !v)
                      setHeadingOpen(false)
                    }}
                    className="w-[154px] h-10 rounded-xl border border-[var(--panel-border)] bg-white hover:bg-[#f8f8f8] px-3 inline-flex items-center justify-between shadow-sm"
                    title={t('Styles')}
                  >
                    <div className="flex flex-col items-start leading-tight">
                      <span className="text-[10px] uppercase tracking-[0.16em] text-gray-400">{t('Styles')}</span>
                      <span className="text-sm font-medium text-gray-900">Normal</span>
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-70" />
                  </button>

                  {stylesOpen && (
                    <div className="absolute left-0 top-[calc(100%+8px)] z-[30000] w-[220px] rounded-2xl border border-[var(--panel-border)] bg-white shadow-xl overflow-hidden">
                      {[
                        { key: 'normal', label: 'Normal', description: t('Default paragraph style'), run: () => editor?.chain().focus().setParagraph().run() },
                      ].map((x) => (
                        <button
                          key={x.key}
                          type="button"
                          className="w-full text-left px-4 py-3 hover:bg-black/5"
                          onClick={() => {
                            x.run?.()
                            setStylesOpen(false)
                          }}
                        >
                          <div className="text-sm font-semibold">{x.label}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{x.description}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative" ref={headingRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setHeadingOpen((v) => !v)
                      setStylesOpen(false)
                    }}
                    className="w-[190px] h-10 rounded-xl border border-[var(--panel-border)] bg-white hover:bg-[#f8f8f8] px-3 inline-flex items-center justify-between shadow-sm text-left"
                    title={t('Headings')}
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-gray-400">{t('Heading')}</div>
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {headingLabel}
                      </div>
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-70 shrink-0" />
                  </button>

                  {headingOpen && (
                    <div className="absolute left-0 top-[calc(100%+8px)] z-[30000] w-[240px] rounded-2xl border border-[var(--panel-border)] bg-white shadow-xl overflow-hidden">
                      {[
                        { key: 'normal', label: 'Normal', preview: 'Normal text', className: 'text-sm font-normal', run: () => editor?.chain().focus().setParagraph().run() },
                        { key: 'h1', label: 'Heading 1', preview: 'Main Title', className: 'text-xl font-extrabold', run: () => editor?.chain().focus().setHeading({ level: 1 }).run() },
                        { key: 'h2', label: 'Heading 2', preview: 'Section Title', className: 'text-lg font-bold', run: () => editor?.chain().focus().setHeading({ level: 2 }).run() },
                        { key: 'h3', label: 'Heading 3', preview: 'Subsection Title', className: 'text-base font-semibold', run: () => editor?.chain().focus().setHeading({ level: 3 }).run() },
                      ].map((x) => (
                        <button
                          key={x.key}
                          type="button"
                          className="w-full text-left px-4 py-3 hover:bg-black/5 border-b border-[var(--panel-border)] last:border-b-0"
                          onClick={() => {
                            x.run?.()
                            setHeadingOpen(false)
                          }}
                        >
                          <div className={`${x.className} text-gray-900 leading-none`}>{x.preview}</div>
                          <div className="text-xs text-gray-500 mt-1.5">{x.label}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </RibbonGroup>
          </>
        )}

        {activeMenu === 'view' && (
          <>
            <RibbonGroup title={t('View Options')} className="gap-3">
              <label className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-[var(--panel-border)] bg-white text-sm">
                <span className="text-xs uppercase tracking-[0.14em] text-gray-500">{t('Zoom')}</span>
                <select
                  className="bg-transparent outline-none text-sm min-w-[88px]"
                  value={zoomLevel}
                  onChange={(e) => setZoomLevel(Number(e.target.value) || 100)}
                >
                  {[75, 90, 100, 110, 125, 150].map((value) => (
                    <option key={value} value={value}>
                      {value}%
                    </option>
                  ))}
                </select>
              </label>

              <div className="inline-flex overflow-hidden rounded-xl border border-[var(--panel-border)] bg-white">
                <button
                  type="button"
                  className={`px-3 py-2 text-sm ${viewMode === 'onePage' ? 'bg-blue-500 text-white' : 'hover:bg-black/5'}`}
                  onClick={() => setViewMode('onePage')}
                >
                  {t('One Page')}
                </button>
                <button
                  type="button"
                  className={`px-3 py-2 text-sm ${viewMode === 'pageWidth' ? 'bg-blue-500 text-white' : 'hover:bg-black/5'}`}
                  onClick={() => setViewMode('pageWidth')}
                >
                  {t('Page Width')}
                </button>
              </div>

              <label className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-[var(--panel-border)] bg-white text-sm">
                <input
                  type="checkbox"
                  checked={showTableGridlines}
                  onChange={(e) => setShowTableGridlines(e.target.checked)}
                  className="h-4 w-4 accent-blue-600"
                />
                <span>{t('Table Gridlines')}</span>
              </label>
            </RibbonGroup>
          </>
        )}

        {activeMenu === 'help' && (
          <div className="w-full px-4 py-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl border border-[var(--panel-border)] bg-[#fafafa] p-3">
                <div className="font-semibold mb-1">{t('Edit')}</div>
                <div className="text-gray-600">{t('Use Undo, Redo, clipboard tools, and Find & Replace to refine existing content quickly.')}</div>
              </div>
              <div className="rounded-xl border border-[var(--panel-border)] bg-[#fafafa] p-3">
                <div className="font-semibold mb-1">{t('Insert')}</div>
                <div className="text-gray-600">{t('Insert merge fields like customer or contract data, or add a table for payment details.')}</div>
              </div>
              <div className="rounded-xl border border-[var(--panel-border)] bg-[#fafafa] p-3">
                <div className="font-semibold mb-1">{t('Format')}</div>
                <div className="text-gray-600">{t('Apply font, alignment, lists, and heading styles to keep contracts readable and professional.')}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {findOpen && (
        <div className="fixed inset-0 z-[40000]">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setFindOpen(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl border border-[var(--panel-border)] bg-white shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between gap-3 p-4 border-b border-[var(--panel-border)]">
                <div className="text-base font-semibold">{t('Find and Replace')}</div>
                <button type="button" className="p-2 rounded-lg hover:bg-black/5" onClick={() => setFindOpen(false)} title="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-1">
                  <div className="text-xs font-semibold opacity-70">{t('Find')}</div>
                  <input
                    className="w-full h-10 px-3 rounded-xl border border-[var(--panel-border)] outline-none"
                    value={findQuery}
                    onChange={(e) => setFindQuery(e.target.value)}
                    placeholder={t('Find')}
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold opacity-70">{t('Replace')}</div>
                  <input
                    className="w-full h-10 px-3 rounded-xl border border-[var(--panel-border)] outline-none"
                    value={replaceQuery}
                    onChange={(e) => setReplaceQuery(e.target.value)}
                    placeholder={t('Replace')}
                  />
                </div>
                <div className="flex flex-wrap gap-2 justify-end pt-2">
                  <button type="button" className="px-4 py-2 rounded-xl border border-[var(--panel-border)] hover:bg-black/5" onClick={doFindNext}>
                    {t('Find Next')}
                  </button>
                  <button type="button" className="px-4 py-2 rounded-xl border border-[var(--panel-border)] hover:bg-black/5" onClick={doReplaceOne}>
                    {t('Replace')}
                  </button>
                  <button type="button" className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700" onClick={doReplaceAll}>
                    {t('Replace All')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

const normalizeTablesForEditor = (html) => {
  const raw = String(html || '')
  if (!raw) return raw

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(raw, 'text/html')
    const body = doc?.body
    if (!body) return raw

    const tables = Array.from(body.querySelectorAll('table'))
    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll('tr'))
      if (rows.length === 0) {
        table.remove()
        continue
      }

      const maxCols = rows.reduce((max, row) => {
        const cells = Array.from(row.children).filter((el) => el?.tagName === 'TD' || el?.tagName === 'TH')
        const cols = cells.length
        return Math.max(max, cols)
      }, 0)

      if (!maxCols) {
        table.remove()
        continue
      }

      rows.forEach((row) => {
        const cells = Array.from(row.children).filter((el) => el?.tagName === 'TD' || el?.tagName === 'TH')
        if (!cells.length) {
          row.remove()
          return
        }

        // Flatten row/col spans to keep a stable rectangular table map for ProseMirror.
        cells.forEach((cell) => {
          const colSpan = Number(cell.getAttribute('colspan') || 1)
          const rowSpan = Number(cell.getAttribute('rowspan') || 1)
          if (colSpan !== 1) cell.setAttribute('colspan', '1')
          if (rowSpan !== 1) cell.setAttribute('rowspan', '1')
        })

        while (cells.length < maxCols) {
          const td = doc.createElement('td')
          td.innerHTML = '&nbsp;'
          row.appendChild(td)
          cells.push(td)
        }

        while (cells.length > maxCols) {
          const extra = cells.pop()
          try { extra?.remove() } catch {}
        }
      })
    }

    return body.innerHTML
  } catch {
    return raw
  }
}

export default function ContractsSettings() {
  const { t, i18n } = useTranslation()
  const isRTL = i18n.dir(i18n.language || 'en') === 'rtl'

  const shouldIgnoreNextEditorUpdateRef = useRef(false)

  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState([])
  const [projects, setProjects] = useState([])
  const [tenantInfo, setTenantInfo] = useState({
    id: '',
    name: '',
    description: '',
    logoUrl: '',
    phone: '',
    email: '',
    taxId: '',
    websiteUrl: '',
    addrLines: [],
    cityLine: '',
  })

  const [draft, setDraft] = useState(emptyDraft())
  const [activeId, setActiveId] = useState(null)
  const [pdfFile, setPdfFile] = useState(null)
  const [pdfObjectUrl, setPdfObjectUrl] = useState('')

  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [serverPreviewHtml, setServerPreviewHtml] = useState('')
  const [serverPreviewLoading, setServerPreviewLoading] = useState(false)
  const [pastePlainText, setPastePlainText] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [editorView, setEditorView] = useState('edit') // edit|preview
  const [templatesQuery, setTemplatesQuery] = useState('')
  const [viewMode, setViewMode] = useState('onePage')
  const [zoomLevel, setZoomLevel] = useState(100)
  const [showTableGridlines, setShowTableGridlines] = useState(false)

  const activeTemplate = useMemo(() => templates.find(tpl => tpl.id === activeId) || null, [templates, activeId])
  const activeProjectName = useMemo(() => {
    const id = Number(draft.project_id || 0)
    if (!id) return t('All')
    return projects.find(p => Number(p.id) === id)?.name || t('All')
  }, [draft.project_id, projects, t])

  const loadAll = async () => {
    setLoading(true)
    const [tplsRes, projRes, companyRes, smtpRes] = await Promise.allSettled([
      getContractTemplates(),
      api.get('/api/projects?all=1'),
      api.get('/api/company-info'),
      api.get('/api/smtp-settings'),
    ])

    if (tplsRes.status === 'fulfilled') {
      setTemplates(Array.isArray(tplsRes.value) ? tplsRes.value : [])
    } else {
      setTemplates([])
    }

    if (companyRes.status === 'fulfilled') {
      const tenant = companyRes.value?.data?.tenant || companyRes.value?.data?.data?.tenant || {}
      const companyProfile = extractTenantCompanyProfile(tenant)
      setTenantInfo((prev) => ({
        ...prev,
        id: tenant?.id || '',
        ...companyProfile,
        email: companyProfile.email || prev.email || '',
      }))
    } else {
      setTenantInfo((prev) => ({
        ...prev,
        id: '',
        name: '',
        description: '',
        logoUrl: '',
        phone: '',
        email: '',
        taxId: '',
        websiteUrl: '',
        addrLines: [],
        cityLine: '',
      }))
    }

    if (smtpRes.status === 'fulfilled') {
      const fromEmail = smtpRes.value?.data?.from_email || ''
      setTenantInfo((prev) => ({ ...prev, email: prev.email || fromEmail || '' }))
    } else {
      setTenantInfo((prev) => ({ ...prev, email: prev.email || '' }))
    }

    // Projects: ensure tenant-scoped list is populated (some APIs require tenant_id explicitly)
    const resolvedTenantId = companyRes.status === 'fulfilled'
      ? (companyRes.value?.data?.tenant?.id || companyRes.value?.data?.data?.tenant?.id || null)
      : null

    const normalizeProjects = (payload) => {
      // Avoid nested ternaries here (we've seen production builds throw TDZ/minify-related errors in this block).
      let list = []
      if (Array.isArray(payload)) {
        list = payload
      } else if (Array.isArray(payload?.data)) {
        list = payload.data
      } else if (Array.isArray(payload?.data?.data)) {
        list = payload.data.data
      }
      const tenantId = Number(resolvedTenantId || 0)
      if (!tenantId) return list
      // If projects include tenant_id, filter by it. Otherwise keep as-is.
      const hasTenantKey = list.some(p => p && Object.prototype.hasOwnProperty.call(p, 'tenant_id'))
      return hasTenantKey ? list.filter(p => Number(p?.tenant_id || 0) === tenantId) : list
    }

    let nextProjects = []
    if (projRes.status === 'fulfilled') {
      nextProjects = normalizeProjects(projRes.value?.data)
    }

    // Prefer explicit tenant_id fetch when tenant is known (ensures tenant-scoped dropdown).
    if (resolvedTenantId) {
      try {
        const res = await api.get('/api/projects', { params: { all: 1, tenant_id: resolvedTenantId } })
        const tenantProjects = normalizeProjects(res?.data)
        if (tenantProjects.length) nextProjects = tenantProjects
      } catch {
      }
    }

    if (nextProjects.length === 0) {
      try {
        const res = await api.get('/api/projects', { params: { all: 1, tenant_id: resolvedTenantId || undefined } })
        nextProjects = normalizeProjects(res?.data)
      } catch {
      }
    }

    setProjects(Array.isArray(nextProjects) ? nextProjects : [])

    setLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [])

  useEffect(() => {
    if (!pdfFile) {
      if (pdfObjectUrl) {
        try { URL.revokeObjectURL(pdfObjectUrl) } catch {}
      }
      setPdfObjectUrl('')
      return
    }

    const nextUrl = URL.createObjectURL(pdfFile)
    setPdfObjectUrl(nextUrl)
    return () => {
      try { URL.revokeObjectURL(nextUrl) } catch {}
    }
  }, [pdfFile])

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      TextStyleWordExtras,
      UnderlineExtension,
      Color,
      PageBreak,
      PageNumberToken,
      Image,
      Link.configure({
        openOnClick: true,
        autolink: true,
        defaultProtocol: 'https',
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    // Do not bind editor content to React state here; it causes re-initialization/cursor jumps on each keystroke.
    // We sync content explicitly when switching templates or starting a new template.
    content: '',
    editorProps: {
      attributes: {
        class:
          'tiptap-editor w-full min-h-[520px] p-4 bg-white text-black outline-none',
        dir: isRTL ? 'rtl' : 'ltr',
      },
    },
    onUpdate: ({ editor }) => {
      if (shouldIgnoreNextEditorUpdateRef.current) return
      setDirty(true)
      try {
        const html = editor.getHTML()
        setDraft((prev) => ({ ...prev, body: html }))
      } catch {
      }
    },
  })

  // Note: do not touch `editor.view.dom` here â€” the view may not be mounted yet and TipTap will throw.
  // Direction is controlled via `editorProps.attributes.dir` and the wrapper around `<EditorContent />`.

  const safeSetEditorContent = (html) => {
    const run = (attempt = 0) => {
      if (!editor || editor.isDestroyed) return

      // Accessing `editor.view.dom` (directly or indirectly) can throw before mount.
      // We treat failures as "not mounted yet" and retry a bit.
      let isMounted = false
      try {
        // `options.element` is set by <EditorContent /> once the view is mounted.
        isMounted = Boolean(editor?.options?.element)
      } catch {
        isMounted = false
      }

      if (isMounted) {
        try {
          shouldIgnoreNextEditorUpdateRef.current = true
          editor.commands.setContent(normalizeTablesForEditor(html), false)
        } catch {
        } finally {
          setTimeout(() => {
            shouldIgnoreNextEditorUpdateRef.current = false
          }, 0)
        }
        return
      }

      if (attempt >= 10) return
      setTimeout(() => run(attempt + 1), 50)
    }

    run(0)
  }

  useEffect(() => {
    if (!activeTemplate) return
    const nextDraft = {
      id: activeTemplate.id,
      name: activeTemplate.name || '',
      project_id: activeTemplate.project_id ?? '',
      status: activeTemplate.status || 'Active',
      content_type: activeTemplate.content_type || (activeTemplate.pdf_url ? 'pdf' : 'html'),
      body: activeTemplate.body || '',
      pdf_url: activeTemplate.pdf_url || '',
      pdf_original_name: activeTemplate.pdf_original_name || '',
    }
    setDraft(nextDraft)
    setPdfFile(null)
    setDirty(false)
    setLastSavedAt(null)
    setEditorView('edit')

    if (nextDraft.content_type === 'html') {
      safeSetEditorContent(nextDraft.body || '')
    }
  }, [activeTemplate, editor])

  const insertPlaceholder = (token) => {
    if (!token) return
    if (!editor) return
    editor.chain().focus().insertContent(token).run()
  }

  const onBodyPaste = (e) => {
    if (!pastePlainText) return
    if (!editor) return
    try {
      const text = e.clipboardData?.getData?.('text/plain') ?? ''
      if (!text) return
      e.preventDefault()
      editor.chain().focus().insertContent(text).run()
    } catch {
    }
  }

  const startNewTemplate = () => {
    setActiveId(null)
    const d = emptyDraft()
    setDraft(d)
    setPdfFile(null)
    setDirty(false)
    setLastSavedAt(null)
    setEditorView('edit')
    safeSetEditorContent('')
  }

  const save = async () => {
    const name = String(draft.name || '').trim()
    if (!name) return

    const projectId = draft.project_id ? Number(draft.project_id) : null
    const status = draft.status || 'Active'
    const contentType = draft.content_type || 'html'

    setSaving(true)
    try {
      let res
      if (contentType === 'pdf') {
        if (!pdfFile && !draft.pdf_url) {
          return
        }
        const fd = new FormData()
        fd.append('name', name)
        if (projectId) fd.append('project_id', String(projectId))
        fd.append('status', status)
        fd.append('content_type', 'pdf')
        if (pdfFile) fd.append('pdf', pdfFile)
        res = draft.id ? await updateContractTemplate(draft.id, fd) : await createContractTemplate(fd)
      } else {
        const rawHtml = editor ? editor.getHTML() : (draft.body || '')
        const normalizedHtml = normalizeTablesForEditor(rawHtml)
        const cleanedHtml = stripWordTipsFromHtml(normalizedHtml)
        const payload = {
          name,
          project_id: projectId,
          status,
          content_type: 'html',
          body: cleanedHtml,
          pdf_path: null,
        }
        res = draft.id ? await updateContractTemplate(draft.id, payload) : await createContractTemplate(payload)
      }

      await loadAll()
      setActiveId(res?.id ?? null)
      setPdfFile(null)
      setDirty(false)
      setLastSavedAt(new Date())
    } catch (error) {
      console.error('Failed to save contract template', error)
      const status = Number(error?.response?.status || 0)
      const serverMessage = String(error?.response?.data?.message || '').trim()
      if (status === 503 && serverMessage) {
        window.alert(serverMessage)
      } else {
        window.alert(serverMessage || t('Failed to save template. Please try again.'))
      }
    } finally {
      setSaving(false)
    }
  }

  const remove = async (tpl) => {
    if (!tpl?.id) return
    const ok = window.confirm(t('Delete this template?'))
    if (!ok) return

    try {
      await deleteContractTemplate(tpl.id)
      await loadAll()
      if (activeId === tpl.id) startNewTemplate()
    } catch (error) {
      console.error('Failed to delete contract template', error)
      const serverMessage = String(error?.response?.data?.message || '').trim()
      window.alert(serverMessage || t('Failed to delete template. Please try again.'))
    }
  }

  const previewHtml = () => {
    if (editor) {
      const normalizedHtml = normalizeTablesForEditor(editor.getHTML() || '')
      return stripWordTipsFromHtml(normalizedHtml)
    }
    return stripWordTipsFromHtml(normalizeTablesForEditor(draft.body || ''))
  }

  const fetchServerPreview = async () => {
    if (draft.content_type === 'pdf') return
    setServerPreviewLoading(true)
    try {
      const body = previewHtml()
      const res = await api.post('/api/contract-templates/preview', {
        template_id: activeId || null,
        project_id: draft.project_id || null,
        body,
        rtl: i18n.language === 'ar',
      }, { responseType: 'text' })
      setServerPreviewHtml(typeof res?.data === 'string' ? res.data : '')
    } catch {
      setServerPreviewHtml('')
    } finally {
      setServerPreviewLoading(false)
    }
  }

  useEffect(() => {
    if (!previewOpen) return
    if (draft.content_type === 'pdf') return
    fetchServerPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewOpen])

  const pdfPreviewUrl = pdfObjectUrl || draft.pdf_url || ''

  useEffect(() => {
    if (editorView !== 'preview') return
    if (draft.content_type === 'pdf') return
    const id = setTimeout(() => {
      fetchServerPreview()
    }, 600)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorView, draft.body, draft.project_id, activeId])

  const filteredTemplates = useMemo(() => {
    const q = String(templatesQuery || '').trim().toLowerCase()
    if (!q) return templates
    return templates.filter((tpl) => {
      const name = String(tpl?.name || '').toLowerCase()
      const project = String(tpl?.project?.name || '').toLowerCase()
      const status = String(tpl?.status || '').toLowerCase()
      return name.includes(q) || project.includes(q) || status.includes(q)
    })
  }, [templates, templatesQuery])

  const isNameValid = Boolean(String(draft.name || '').trim())
  const isPdfValid = draft.content_type !== 'pdf' ? true : Boolean(pdfFile || draft.pdf_url)
  const canSave = !saving && dirty && isNameValid && isPdfValid

  const templateTypeLabel = draft.content_type === 'pdf' ? t('PDF Template') : t('HTML Template')
  const saveStateLabel = saving
    ? t('Saving...')
    : dirty
      ? t('Unsaved changes')
      : lastSavedAt
        ? t('Saved')
        : ''

  return (
    <div className="p-6 space-y-6">
      <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className="w-1 h-8 bg-gradient-to-b from-blue-500 to-purple-600 rounded-full"></div>
        <h2 className="text-2xl font-bold">{t('Contracts Settings')}</h2>
        <span className="ml-auto text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800">{t('Admin Only')}</span>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* Editor */}
        <div className="order-2 glass-panel rounded-2xl p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-2 disabled:opacity-50"
              onClick={save}
              disabled={!canSave}
              title={t('Save')}
            >
              <Save className="w-4 h-4" />
              {t('Save')}
            </button>
            <button
              className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 inline-flex items-center gap-2"
              onClick={() => setPreviewOpen(true)}
              title={t('Preview')}
            >
              <Eye className="w-4 h-4" />
              {t('Preview')}
            </button>

            <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-[var(--content-text)] opacity-80">
              {saveStateLabel ? (
                <div className="inline-flex items-center gap-1.5">
                  {dirty ? <AlertCircle className="w-4 h-4 text-amber-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  <span>{saveStateLabel}</span>
                </div>
              ) : null}
              <span className="px-2 py-1 rounded-lg border border-[var(--panel-border)] bg-white/5">{templateTypeLabel}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold text-[var(--content-text)]">{t('Template Info')}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-[var(--content-text)] opacity-80">
                  {t('Template Name')} <span className="text-red-400">*</span>
                </label>
                <input
                  value={draft.name}
                  onChange={(e) => {
                    setDraft(prev => ({ ...prev, name: e.target.value }))
                    setDirty(true)
                  }}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--panel-border)] bg-gray-900/70 text-white"
                  placeholder={t('e.g. Contract (1)')}
                />
                {!isNameValid && <div className="mt-1 text-xs text-red-400">{t('Template name is required')}</div>}
              </div>
              <div>
                <label className="text-sm text-[var(--content-text)] opacity-80">{t('Project')}</label>
                <select
                  value={draft.project_id}
                  onChange={(e) => {
                    setDraft(prev => ({ ...prev, project_id: e.target.value }))
                    setDirty(true)
                  }}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--panel-border)] bg-gray-900/70 text-white"
                >
                  <option value="">{t('All Projects')}</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold text-[var(--content-text)]">{t('Content Type')}</div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-xl border border-[var(--panel-border)] overflow-hidden" role="tablist" aria-label="content-type">
                <button
                  type="button"
                  role="tab"
                  aria-selected={draft.content_type === 'html'}
                  className={`px-4 py-2 text-sm ${draft.content_type === 'html' ? 'bg-white/10' : 'bg-transparent hover:bg-white/5'}`}
                  onClick={() => {
                    setDraft(prev => ({ ...prev, content_type: 'html', pdf_url: '', pdf_original_name: '' }))
                    setPdfFile(null)
                    safeSetEditorContent(draft.body || '')
                    setDirty(true)
                    setEditorView('edit')
                  }}
                >
                  {t('HTML Template')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={draft.content_type === 'pdf'}
                  className={`px-4 py-2 text-sm ${draft.content_type === 'pdf' ? 'bg-white/10' : 'bg-transparent hover:bg-white/5'}`}
                  onClick={() => {
                    setDraft(prev => ({ ...prev, content_type: 'pdf' }))
                    safeSetEditorContent('')
                    setDirty(true)
                    setEditorView('edit')
                  }}
                >
                  {t('PDF Template')}
                </button>
              </div>

              <label className="ml-auto inline-flex items-center gap-2 cursor-pointer select-none text-xs text-[var(--content-text)] opacity-80">
                <input type="checkbox" checked={pastePlainText} onChange={(e) => setPastePlainText(e.target.checked)} />
                {t('Paste as plain text')}
              </label>
            </div>
          </div>

           {draft.content_type !== 'pdf' && (
            <WordLikeRibbon
              editor={editor}
              t={t}
              insertPlaceholder={insertPlaceholder}
              viewMode={viewMode}
              setViewMode={setViewMode}
              zoomLevel={zoomLevel}
              setZoomLevel={setZoomLevel}
              showTableGridlines={showTableGridlines}
              setShowTableGridlines={setShowTableGridlines}
            />
           )}

           {false && (
             <>
               <button
                 type="button"
                 onClick={() => editor?.chain().focus().toggleBold().run()}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 font-bold ${editor?.isActive('bold') ? 'bg-white/10' : ''}`}
                 disabled={!editor?.can().chain().focus().toggleBold().run()}
                 title={t('Bold')}
               >
                 B
               </button>
               <button
                 type="button"
                 onClick={() => editor?.chain().focus().toggleItalic().run()}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 italic ${editor?.isActive('italic') ? 'bg-white/10' : ''}`}
                 disabled={!editor?.can().chain().focus().toggleItalic().run()}
                 title={t('Italic')}
               >
                 I
               </button>
               <button
                 type="button"
                 onClick={() => {
                   if (!editor) return
                   if (typeof editor?.commands?.toggleUnderline !== 'function') return
                   editor.chain().focus().toggleUnderline().run()
                 }}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 underline ${editor?.isActive('underline') ? 'bg-white/10' : ''}`}
                 title={t('Underline')}
               >
                 U
               </button>
               <button
                 type="button"
                 onClick={() => editor?.chain().focus().toggleStrike().run()}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 line-through ${editor?.isActive('strike') ? 'bg-white/10' : ''}`}
                 title={t('Strike')}
               >
                 S
               </button>
               <div className="basis-full h-0" />

               <span className="w-px h-5 bg-[var(--panel-border)] mx-1" />

               <button
                 type="button"
                 onClick={() => editor?.chain().focus().setParagraph().run()}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 text-xs ${editor?.isActive('paragraph') ? 'bg-white/10' : ''}`}
               >
                 {t('P')}
               </button>
               <button
                 type="button"
                 onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 text-xs ${editor?.isActive('heading', { level: 1 }) ? 'bg-white/10' : ''}`}
               >
                 H1
               </button>
               <button
                 type="button"
                 onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 text-xs ${editor?.isActive('heading', { level: 2 }) ? 'bg-white/10' : ''}`}
               >
                 H2
               </button>
               <button
                 type="button"
                 onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 text-xs ${editor?.isActive('heading', { level: 3 }) ? 'bg-white/10' : ''}`}
               >
                 H3
               </button>

               <span className="w-px h-5 bg-[var(--panel-border)] mx-1" />
               <button
                 type="button"
                 onClick={() => editor?.chain().focus().toggleBulletList().run()}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 ${editor?.isActive('bulletList') ? 'bg-white/10' : ''}`}
                 title={t('Bullet List')}
               >
                 {t('â€¢ List')}
               </button>
               <button
                 type="button"
                 onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 ${editor?.isActive('orderedList') ? 'bg-white/10' : ''}`}
                 title={t('Ordered List')}
               >
                 {t('1. List')}
               </button>
               <button
                 type="button"
                 onClick={() => editor?.chain().focus().toggleBlockquote().run()}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 text-xs ${editor?.isActive('blockquote') ? 'bg-white/10' : ''}`}
                 title={t('Quote')}
               >
                 {t('Quote')}
               </button>

               <span className="w-px h-5 bg-[var(--panel-border)] mx-1" />
               <button type="button" onClick={() => editor?.chain().focus().setTextAlign('left').run()} className="px-2 py-1 rounded hover:bg-gray-100/10 text-xs">L</button>
               <button type="button" onClick={() => editor?.chain().focus().setTextAlign('center').run()} className="px-2 py-1 rounded hover:bg-gray-100/10 text-xs">C</button>
               <button type="button" onClick={() => editor?.chain().focus().setTextAlign('right').run()} className="px-2 py-1 rounded hover:bg-gray-100/10 text-xs">R</button>
               <button type="button" onClick={() => editor?.chain().focus().setTextAlign('justify').run()} className="px-2 py-1 rounded hover:bg-gray-100/10 text-xs">J</button>

               <div className="basis-full h-0" />

               <span className="w-px h-5 bg-[var(--panel-border)] mx-1" />
               <button
                 type="button"
                 onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                 className="px-2 py-1 rounded hover:bg-gray-100/10 text-xs"
                 title={t('Insert Table')}
               >
                 {t('Table')}
               </button>

               <span className="w-px h-5 bg-[var(--panel-border)] mx-1" />
               <label className="text-xs opacity-80 flex items-center gap-2 px-2">
                 {t('Color')}
                 <input
                   type="color"
                   className="h-6 w-6 bg-transparent border-0 p-0"
                   onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()}
                   title={t('Text Color')}
                 />
               </label>

                <select
                  className="px-3 py-2 rounded-lg bg-blue-600/10 border border-blue-500/30 text-sm min-w-[220px]"
                  defaultValue=""
                  onChange={(e) => {
                    const v = e.target.value
                    if (v) insertPlaceholder(v)
                    e.target.value = ''
                  }}
                  title={t('Insert Field')}
                >
                  <option value="">{t('+ Insert Field')}</option>
                  <option value="{{contract_number}}">{t('Contract No.')}</option>
                  <option value="{{contract_date}}">{t('Contract Date')}</option>
                  <option value="{{customer_name}}">{t('Customer Name')}</option>
                  <option value="{{customer_phone}}">{t('Customer Phone')}</option>
                  <option value="{{unit_code}}">{t('Unit Code')}</option>
                 <option value="{{project_name}}">{t('Project')}</option>
                 <option value="{{total_price}}">{t('Total Price')}</option>
                 <option value="{{payment_plan_table}}">{t('Payment Plan Table')}</option>
                 <option value="{{installments_table}}">{t('Installments Table')}</option>
               </select>

               <button
                 type="button"
                 onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
                 className="ml-auto px-2 py-1 rounded hover:bg-gray-100/10 text-xs opacity-80"
               >
                 {t('Clear format')}
               </button>
             </>
           )}

          {draft.content_type === 'pdf' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--panel-border)] cursor-pointer hover:bg-white/5">
                  <Upload className="w-4 h-4" />
                  <span className="text-sm">{t('Browse PDF')}</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null
                      setPdfFile(file)
                      setDraft(prev => ({ ...prev, content_type: 'pdf', pdf_original_name: file?.name || prev.pdf_original_name }))
                      setDirty(true)
                      setEditorView('edit')
                    }}
                  />
                </label>
                {(pdfFile || draft.pdf_url) && (
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border border-[var(--panel-border)] hover:bg-white/5 inline-flex items-center gap-2"
                      onClick={() => {
                        setPdfFile(null)
                        setDraft(prev => ({ ...prev, content_type: 'html', pdf_url: '', pdf_original_name: '' }))
                        safeSetEditorContent(draft.body || '')
                        setDirty(true)
                        setEditorView('edit')
                      }}
                      title={t('Remove PDF')}
                    >
                    <X className="w-4 h-4" />
                    {t('Remove PDF')}
                  </button>
                )}
                <div className="text-sm opacity-70">
                  {pdfFile?.name || draft.pdf_original_name || (draft.pdf_url ? t('PDF attached') : t('No PDF selected'))}
                </div>
              </div>

              {!isPdfValid && (
                <div className="text-xs text-red-400">{t('Please upload a PDF file')}</div>
              )}

              <ContractPageFrame
                viewMode={viewMode}
                zoomLevel={zoomLevel}
                showTableGridlines={showTableGridlines}
                isRTL={isRTL}
                tenantInfo={tenantInfo}
                tenantLabel={t('Tenant')}
              >
                {pdfPreviewUrl ? (
                  <div className="w-full">
                    <iframe
                      title="contract-pdf"
                      src={pdfPreviewUrl}
                      className="w-full h-[70vh] rounded-lg border border-gray-200"
                    />
                  </div>
                ) : (
                  <div className="text-sm text-gray-600">{t('Upload a PDF to use as the contract template.')}</div>
                )}
              </ContractPageFrame>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-xl border border-[var(--panel-border)] overflow-hidden">
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-sm ${editorView === 'edit' ? 'bg-white/10' : 'hover:bg-white/5'}`}
                    onClick={() => setEditorView('edit')}
                  >
                    {t('Edit')}
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-sm ${editorView === 'preview' ? 'bg-white/10' : 'hover:bg-white/5'}`}
                    onClick={() => setEditorView('preview')}
                  >
                    {t('Live Preview')}
                  </button>
                </div>

                {editorView === 'preview' && (
                  <button
                    type="button"
                    className="ml-auto px-3 py-1.5 rounded-lg border border-[var(--panel-border)] hover:bg-white/5 inline-flex items-center gap-2 text-sm disabled:opacity-50"
                    onClick={fetchServerPreview}
                    disabled={serverPreviewLoading}
                    title={t('Refresh preview')}
                  >
                    <RefreshCcw className="w-4 h-4" />
                    {t('Refresh')}
                  </button>
                )}
              </div>

              <ContractPageFrame
                viewMode={viewMode}
                zoomLevel={zoomLevel}
                showTableGridlines={showTableGridlines}
                isRTL={isRTL}
                tenantInfo={tenantInfo}
                tenantLabel={t('Tenant')}
              >
                {editorView === 'preview' ? (
                  serverPreviewLoading ? (
                    <div className="text-sm opacity-70">{t('Loading...')}</div>
                  ) : (
                    <iframe
                      title="contract-template-live-preview"
                      srcDoc={serverPreviewHtml || `<!doctype html><html><body>${previewHtml()}</body></html>`}
                      className="w-full h-[70vh] rounded-lg border border-gray-200"
                    />
                  )
                ) : (
              <div
                onPaste={onBodyPaste}
                dir={isRTL ? 'rtl' : 'ltr'}
                className={showTableGridlines ? 'contracts-gridlines-on' : ''}
              >
                    <EditorContent editor={editor} />
                  </div>
                )}
              </ContractPageFrame>
            </div>
          )}

          <div className="rounded-xl border border-[var(--panel-border)] bg-blue-500/10 p-3 text-xs text-[var(--content-text)]">
            <div className="font-semibold mb-1">{t('Header & Footer')}</div>
            <div className="opacity-80">{t('Header & footer are automatically added from company settings (logo, tenant name, phone, email, tax).')}</div>
            <div className="opacity-80 mt-1">{t('Tip: copy from Word and paste here, or upload a PDF to keep exact formatting.')}</div>
          </div>
        </div>

        {/* Templates list */}
        <div className="order-1 glass-panel rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
                <FolderKanban className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold">{t('Contracts Templates')}</div>
                <div className="text-xs opacity-70">{t('Choose a template or create a new one before editing the contract body.')}</div>
              </div>
            </div>
            <button
              className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-2"
              onClick={startNewTemplate}
              title={t('Add template')}
            >
              <FilePlus2 className="w-4 h-4" />
              {t('Add template')}
            </button>
          </div>

          <input
            value={templatesQuery}
            onChange={(e) => setTemplatesQuery(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--panel-border)] bg-gray-900/40 text-white"
            placeholder={t('Search templates...')}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-[var(--panel-border)] bg-white/[0.04] px-4 py-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] opacity-60">
                <FileText className="w-4 h-4" />
                {t('Templates')}
              </div>
              <div className="mt-2 text-2xl font-semibold">{templates.length}</div>
              <div className="text-xs opacity-70 mt-1">{t('Available in this tenant')}</div>
            </div>
            <div className="rounded-2xl border border-[var(--panel-border)] bg-white/[0.04] px-4 py-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] opacity-60">
                <Search className="w-4 h-4" />
                {t('Filtered')}
              </div>
              <div className="mt-2 text-2xl font-semibold">{filteredTemplates.length}</div>
              <div className="text-xs opacity-70 mt-1">{templatesQuery ? t('Matching your search') : t('Visible right now')}</div>
            </div>
            <div className="rounded-2xl border border-[var(--panel-border)] bg-white/[0.04] px-4 py-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] opacity-60">
                <Sparkles className="w-4 h-4" />
                {t('Current')}
              </div>
              <div className="mt-2 text-base font-semibold truncate">{activeTemplate?.name || t('New template')}</div>
              <div className="text-xs opacity-70 mt-1">{activeTemplate ? t('Ready to edit') : t('Start from scratch')}</div>
            </div>
          </div>

          <div className="overflow-auto rounded-xl border border-[var(--panel-border)]">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100/10">
                <tr>
                  <th className="text-left px-3 py-2">{t('Template Name')}</th>
                  <th className="text-left px-3 py-2">{t('Project')}</th>
                  <th className="text-left px-3 py-2">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="px-3 py-3 opacity-70" colSpan={3}>{t('Loading...')}</td></tr>
                ) : templates.length === 0 ? (
                  <tr>
                    <td className="px-3 py-5 opacity-80" colSpan={3}>
                      <div className="text-sm font-medium">{t('No templates yet')}</div>
                      <div className="text-xs opacity-70 mt-1">{t('Create your first contract template to start printing contracts.')}</div>
                      <button
                        className="mt-3 px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-2"
                        onClick={startNewTemplate}
                      >
                        <FilePlus2 className="w-4 h-4" />
                        {t('Create Template')}
                      </button>
                    </td>
                  </tr>
                ) : filteredTemplates.length === 0 ? (
                  <tr><td className="px-3 py-3 opacity-70" colSpan={3}>{t('No matching templates')}</td></tr>
                ) : (
                  filteredTemplates.map(tpl => {
                    const isActive = tpl.id === activeId
                    const isGlobal = !tpl.project_id && !tpl.project
                    const typeLabel = (tpl.content_type || (tpl.pdf_url ? 'pdf' : 'html')).toLowerCase() === 'pdf' ? t('PDF') : t('HTML')
                    return (
                      <tr key={tpl.id} className={`border-t border-[var(--panel-border)] ${isActive ? 'bg-blue-500/10' : 'hover:bg-white/5'}`}>
                        <td className="px-3 py-2">
                          <button className="text-left w-full" onClick={() => setActiveId(tpl.id)}>
                            <div className="font-medium">{tpl.name}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs opacity-80">
                              <span className="px-2 py-0.5 rounded border border-[var(--panel-border)] bg-white/5">{tpl.status || 'Active'}</span>
                              <span className="px-2 py-0.5 rounded border border-[var(--panel-border)] bg-white/5">{typeLabel}</span>
                              <span className="px-2 py-0.5 rounded border border-[var(--panel-border)] bg-white/5">{isGlobal ? t('Global') : t('Project')}</span>
                            </div>
                          </button>
                        </td>
                        <td className="px-3 py-2">{tpl.project?.name || t('All')}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <button className="p-2 rounded hover:bg-white/10" onClick={() => { setActiveId(tpl.id); setPreviewOpen(true) }} title={t('Preview')}>
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              className="p-2 rounded hover:bg-white/10 disabled:opacity-40"
                              disabled={(tpl.content_type || (tpl.pdf_url ? 'pdf' : 'html')) === 'pdf'}
                              onClick={async () => {
                                // Duplicate HTML templates only (PDF needs a binary re-upload)
                                if ((tpl.content_type || (tpl.pdf_url ? 'pdf' : 'html')) === 'pdf') return
                                const payload = {
                                  name: `${tpl.name || t('Template')} ${t('(Copy)')}`,
                                  project_id: tpl.project_id ?? null,
                                  status: tpl.status || 'Active',
                                  content_type: 'html',
                                  body: tpl.body || '',
                                  pdf_path: null,
                                }
                                const created = await createContractTemplate(payload)
                                await loadAll()
                                setActiveId(created?.id ?? null)
                              }}
                              title={t('Duplicate')}
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button className="p-2 rounded hover:bg-white/10 text-red-400" onClick={() => remove(tpl)} title={t('Delete')}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Preview modal */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-4"
          onMouseDown={() => { setPreviewOpen(false); setServerPreviewHtml('') }}
        >
          <div className="w-full max-w-4xl rounded-2xl card border border-[var(--panel-border)] overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--panel-border)] flex items-center justify-between">
              <div className="font-semibold">{t('Preview')}</div>
              <button className="px-3 py-1.5 rounded-lg hover:bg-white/10" onClick={() => { setPreviewOpen(false); setServerPreviewHtml('') }}>{t('Close')}</button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-auto">
              <div className="mb-3 text-sm opacity-80">
                <div><span className="opacity-70">{t('Template')}:</span> {draft.name || activeTemplate?.name || '-'}</div>
                <div><span className="opacity-70">{t('Project')}:</span> {activeTemplate?.project?.name || activeProjectName}</div>
              </div>
              {draft.content_type === 'pdf' ? (
                <ContractPageFrame
                  viewMode={viewMode}
                  zoomLevel={zoomLevel}
                  showTableGridlines={showTableGridlines}
                  isRTL={isRTL}
                  tenantInfo={tenantInfo}
                  tenantLabel={t('Tenant')}
                >
                  {pdfPreviewUrl ? (
                    <iframe
                      title="contract-pdf-preview"
                      src={pdfPreviewUrl}
                      className="w-full h-[70vh] rounded-lg border border-gray-200"
                    />
                  ) : (
                    <div className="text-sm text-gray-600">{t('No PDF selected')}</div>
                  )}
                </ContractPageFrame>
              ) : (
                <ContractPageFrame
                  viewMode={viewMode}
                  zoomLevel={zoomLevel}
                  showTableGridlines={showTableGridlines}
                  isRTL={isRTL}
                  tenantInfo={tenantInfo}
                  tenantLabel={t('Tenant')}
                >
                  {serverPreviewLoading ? (
                    <div className="text-sm opacity-70">{t('Loading...')}</div>
                  ) : (
                    <iframe
                      title="contract-template-preview"
                      srcDoc={serverPreviewHtml || `<!doctype html><html><body>${previewHtml()}</body></html>`}
                      className="w-full h-[70vh] rounded-lg border border-gray-200"
                    />
                  )}
                </ContractPageFrame>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
