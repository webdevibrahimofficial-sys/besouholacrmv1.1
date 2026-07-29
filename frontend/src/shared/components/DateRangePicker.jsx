import { createPortal } from 'react-dom'
import DatePicker from 'react-datepicker'

const formatLocalISODate = (date) => {
  if (!date) return ''
  const offset = date.getTimezoneOffset()
  const localDate = new Date(date.getTime() - offset * 60 * 1000)
  return localDate.toISOString().split('T')[0]
}

const parseISODate = (value) => {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export default function DateRangePicker({
  from,
  to,
  onChange,
  isRTL = false,
  placeholderText,
  className,
  wrapperClassName = 'w-full',
  ...props
}) {
  const placeholder = placeholderText || (isRTL ? 'من - إلى' : 'From - To')

  return (
    <DatePicker
      popperContainer={({ children }) => createPortal(children, document.body)}
      selectsRange={true}
      startDate={parseISODate(from)}
      endDate={parseISODate(to)}
      showMonthDropdown
      showYearDropdown
      dropdownMode="select"
      yearDropdownItemNumber={12}
      onChange={(update) => {
        const [start, end] = update || []
        onChange?.({
          from: formatLocalISODate(start),
          to: formatLocalISODate(end),
        })
      }}
      isClearable={true}
      placeholderText={placeholder}
      className={className}
      wrapperClassName={wrapperClassName}
      dateFormat="yyyy-MM-dd"
      {...props}
    />
  )
}


