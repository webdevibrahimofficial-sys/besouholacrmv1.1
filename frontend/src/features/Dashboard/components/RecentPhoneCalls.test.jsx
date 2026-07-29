/* global jest, describe, beforeEach, afterEach, test, expect */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import RecentPhoneCalls from './RecentPhoneCalls'

const mockApiGet = jest.fn()

jest.mock('@utils/api', () => ({
  api: {
    get: (...args) => mockApiGet(...args),
  },
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: 'en' },
  }),
}))

jest.mock('@shared/context/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light' }),
}))

jest.mock('@shared/context/AppStateProvider', () => ({
  useAppState: () => ({
    crmSettings: { defaultCountryCode: '+20', maskMobileNumbers: false },
  }),
}))

jest.mock('@shared/components/EnhancedLeadDetailsModal', () => {
  return function MockEnhancedLeadDetailsModal() {
    return null
  }
})

const call = (id, createdAt) => ({
  id,
  employeeName: 'Adam',
  leadName: `Lead ${id}`,
  leadId: id,
  phoneNumber: '+20 1000000001',
  phoneCountry: '+20',
  callType: 'outgoing',
  duration: '00:00',
  notes: '',
  createdAt,
})

describe('RecentPhoneCalls range filters', () => {
  let consoleErrorSpy

  beforeEach(() => {
    jest.clearAllMocks()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      const message = String(args[0] || '')
      if (message.includes('not wrapped in act')) return
      console.warn(...args)
    })
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0)
    const threeDaysAgo = new Date(today)
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    const oldCall = new Date(today)
    oldCall.setDate(oldCall.getDate() - 40)

    mockApiGet.mockResolvedValue({
      data: [
        call(1, today.toISOString()),
        call(2, threeDaysAgo.toISOString()),
        call(3, oldCall.toISOString()),
      ],
    })
  })

  afterEach(() => {
    consoleErrorSpy?.mockRestore()
  })

  test('filters by today, last 7 days, and all using API call dates', async () => {
    const onCountChange = jest.fn()
    render(<RecentPhoneCalls onCountChange={onCountChange} />)

    await waitFor(() => {
      expect(screen.getByText('Lead 1')).toBeInTheDocument()
    })

    expect(screen.queryByText('Lead 2')).not.toBeInTheDocument()
    expect(screen.queryByText('Lead 3')).not.toBeInTheDocument()
    expect(onCountChange).toHaveBeenLastCalledWith(1)

    fireEvent.click(screen.getByRole('button', { name: '7 Days' }))
    expect(screen.getByText('Lead 1')).toBeInTheDocument()
    expect(screen.getByText('Lead 2')).toBeInTheDocument()
    expect(screen.queryByText('Lead 3')).not.toBeInTheDocument()
    expect(onCountChange).toHaveBeenLastCalledWith(2)

    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getByText('Lead 1')).toBeInTheDocument()
    expect(screen.getByText('Lead 2')).toBeInTheDocument()
    expect(screen.getByText('Lead 3')).toBeInTheDocument()
    expect(onCountChange).toHaveBeenLastCalledWith(3)
  })
})
