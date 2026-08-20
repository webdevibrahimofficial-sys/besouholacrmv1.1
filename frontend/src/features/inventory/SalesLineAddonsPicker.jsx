import SearchableSelect from '../../components/SearchableSelect'
import {
  applyAddonSelectionToLine,
  computeLineAddonsTotal,
  getAddonLineAmount,
  getSalesLineLabels,
  isServiceSalesLine,
  resolveSelectedAddons,
  resolveLineAddonIds,
} from './salesLineCatalog'

/**
 * Multi-select add-ons for a sales line (quotation / order / invoice).
 * Mirrors general-inventory reservation UX: select from item catalog addons,
 * show period (services) or qty (products), and roll amounts into the line.
 */
export default function SalesLineAddonsPicker({
  line,
  catalogAddons = [],
  onChange,
  isRTL = false,
  disabled = false,
  isDark = false,
  compact = false,
}) {
  const labels = getSalesLineLabels(isRTL)
  const serviceLine = isServiceSalesLine(line)
  const available = Array.isArray(catalogAddons) && catalogAddons.length > 0
    ? catalogAddons
    : (Array.isArray(line?.available_addons) && line.available_addons.length > 0
      ? line.available_addons
      : [])
  const selected = resolveSelectedAddons(line, available)
  const addonsTotal = computeLineAddonsTotal(line, available)
  const emptyLabel = line?.name ? labels.noAddonsForItem : labels.selectItemFirst

  const muted = isDark ? 'text-gray-400' : 'text-slate-500'
  const panel = isDark
    ? 'border-gray-700/80 bg-gray-800/40'
    : 'border-gray-200 bg-white'
  const chip = isDark
    ? 'bg-gray-900/70 border border-gray-700 text-gray-300'
    : 'bg-slate-50 border border-gray-200 text-slate-700'
  const emptyBox = isDark
    ? 'border-gray-700 bg-gray-900/30 text-gray-400'
    : 'border-gray-200 bg-slate-50/80 text-slate-500'
  const selectClass = isDark
    ? 'bg-gray-800 border-gray-700 text-white h-10 min-h-10 rounded-md'
    : 'bg-white border-gray-300 text-theme-text h-10 min-h-10 rounded-md'

  const handleChange = (value) => {
    if (disabled || typeof onChange !== 'function') return
    onChange(applyAddonSelectionToLine(line, value, available))
  }

  return (
    <div
      className={`rounded-lg border ${panel} ${compact ? 'p-3 space-y-2' : 'p-3.5 space-y-2.5'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <label className={`block text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-300' : 'text-slate-600'}`}>
          {labels.addonsDetails}
        </label>
        {selected.length > 0 ? (
          <span className={`text-[11px] font-medium tabular-nums ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
            {selected.length}
          </span>
        ) : null}
      </div>
      <SearchableSelect
        options={available.map((addon) => ({
          value: String(addon.id),
          label: addon.name || '',
        }))}
        value={resolveLineAddonIds(line).map((id) => String(id))}
        onChange={handleChange}
        placeholder={line?.name ? (available.length ? labels.selectAddons : labels.noAddonsForItem) : labels.selectItemFirst}
        noResultsLabel={emptyLabel}
        isRTL={isRTL}
        multiple
        showAllOption={false}
        disabled={disabled || !line?.name || available.length === 0}
        className={selectClass}
      />
      {selected.length > 0 ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-2">
            {selected.map((addon) => (
              <div
                key={addon.id}
                className={`inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2 text-xs ${chip}`}
              >
                <span className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {addon.name || '—'}
                </span>
                <span className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 ${muted}`}>
                  {serviceLine ? (
                    <span>{labels.addonPeriod}: {addon.period || '—'}</span>
                  ) : (
                    <span>{labels.addonQty}: {Number(addon.quantity || 0)}</span>
                  )}
                  <span>{labels.addonPrice}: {Number(addon.price || 0).toLocaleString()}</span>
                  <span className={`font-semibold ${isDark ? 'text-gray-200' : 'text-slate-800'}`}>
                    {labels.addonTotal}: {getAddonLineAmount(addon, serviceLine).toLocaleString()}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <div className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-slate-600'}`}>
            {labels.addonsAmount}: {addonsTotal.toLocaleString()}
          </div>
        </div>
      ) : (
        <div className={`rounded-md border border-dashed px-3 py-2.5 text-xs ${emptyBox}`}>
          {labels.noAddonsSelected}
        </div>
      )}
    </div>
  )
}
