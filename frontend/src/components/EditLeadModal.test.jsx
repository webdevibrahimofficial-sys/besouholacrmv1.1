import { render, screen, waitFor } from '@testing-library/react'
import EditLeadModal from './EditLeadModal'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}))

jest.mock('../shared/context/ThemeProvider.jsx', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light' }),
}))

jest.mock('../shared/context/AppStateProvider.jsx', () => ({
  useAppState: () => ({
    crmSettings: { defaultCountryCode: '+20' },
    user: { id: 1, name: 'Test User', role: 'Admin' },
    company: { company_type: 'General' },
  }),
}))

jest.mock('../hooks/useStages', () => ({
  useStages: () => ({ stages: [] }),
}))

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}))

jest.mock('./SearchableSelect', () => {
  return function MockSearchableSelect() {
    return <div data-testid="searchable-select" />
  }
})

jest.mock('./DynamicFieldRenderer', () => {
  return function MockDynamicFieldRenderer() {
    return null
  }
})

const mockApiGet = jest.fn()
jest.mock('../utils/api', () => ({
  api: {
    get: (...args) => mockApiGet(...args),
    put: jest.fn(),
  },
}))

describe('EditLeadModal phone parsing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockApiGet.mockImplementation((url) => {
      if (url === '/api/sources?active=1') return Promise.resolve({ data: { data: [] } })
      if (url === '/api/campaigns') return Promise.resolve({ data: { data: [] } })
      if (url === '/api/users') return Promise.resolve({ data: { data: [] } })
      if (url === '/api/items?all=1') return Promise.resolve({ data: { data: [] } })
      if (url === '/api/projects?all=1') return Promise.resolve({ data: { data: [] } })
      return Promise.resolve({ data: { data: [] } })
    })
  })

  test('uses meta_data.phone_country for local Gulf numbers and strips leading 0', async () => {
    render(
      <EditLeadModal
        isOpen={true}
        onClose={jest.fn()}
        onSave={jest.fn()}
        canEditInfo={false}
        canEditPhone={true}
        lead={{
          id: 1,
          name: 'Test Lead',
          source: 'Cold Call',
          phone: '0562131256',
          meta_data: { phone_country: '+966' },
        }}
      />
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('+966')).toBeInTheDocument()
    })

    expect(screen.getByDisplayValue('562131256')).toBeInTheDocument()
  })
})

