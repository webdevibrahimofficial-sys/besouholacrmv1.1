import {
  clearStoredLeadsListState,
  emptyLeadsListState,
  leadsListStorageKey,
  loadStoredLeadsListState,
  mergeLeadsListState,
  readLeadsFiltersFromSearch,
  sameStringArray,
  saveStoredLeadsListState,
  stripDashboardSrcParam,
  stripLeadPreviewParams,
} from './leadsListPersistence'

describe('leadsListPersistence', () => {
  test('keeps my-leads and all-leads storage keys separate', () => {
    expect(leadsListStorageKey('/leads')).toBe('besouhola:leads-list:/leads')
    expect(leadsListStorageKey('/leads/my-leads')).toBe('besouhola:leads-list:/leads/my-leads')
  })

  test('reads dashboard and stage filters from the query string', () => {
    const parsed = readLeadsFiltersFromSearch('?src=dashboard&stage=follow-up&assigned_to=12,15&s=ahmed')
    expect(parsed.fromDashboard).toBe(true)
    expect(parsed.present).toEqual({
      searchTerm: 'ahmed',
      stageFilter: ['follow-up'],
      salesPersonFilter: ['12', '15'],
    })
  })

  test('does not treat a missing stage param as a present empty filter', () => {
    const parsed = readLeadsFiltersFromSearch('')
    expect(parsed.fromDashboard).toBe(false)
    expect(parsed.present).toEqual({})
  })

  test('merges stored filters with URL params without wiping missing keys', () => {
    const stored = {
      ...emptyLeadsListState(),
      stageFilter: ['follow up'],
      sourceFilter: ['Facebook'],
      currentPage: 3,
      scrollY: 840,
    }
    const merged = mergeLeadsListState({
      urlFilters: readLeadsFiltersFromSearch('?s=mona'),
      stored,
      pathname: '/leads',
    })
    expect(merged.searchTerm).toBe('mona')
    expect(merged.stageFilter).toEqual(['follow up'])
    expect(merged.sourceFilter).toEqual(['Facebook'])
    expect(merged.currentPage).toBe(3)
    expect(merged.scrollY).toBe(840)
  })

  test('dashboard links without assigned_to clear only that filter', () => {
    const stored = {
      ...emptyLeadsListState(),
      stageFilter: ['follow up'],
      salesPersonFilter: ['9'],
    }
    const merged = mergeLeadsListState({
      urlFilters: readLeadsFiltersFromSearch('?src=dashboard&stage=new'),
      stored,
      pathname: '/leads',
    })
    expect(merged.stageFilter).toEqual(['new'])
    expect(merged.salesPersonFilter).toEqual([])
  })

  test('locks my-leads assignee to the current user', () => {
    const merged = mergeLeadsListState({
      urlFilters: readLeadsFiltersFromSearch('?assigned_to=99'),
      stored: { salesPersonFilter: ['12'] },
      pathname: '/leads/my-leads',
      userId: 7,
    })
    expect(merged.salesPersonFilter).toEqual(['7'])
  })

  test('strips preview params without dropping saved filters', () => {
    expect(stripLeadPreviewParams('?stage=follow-up&lead_id=44&action_id=9&tab=overview'))
      .toBe('?stage=follow-up')
    expect(stripDashboardSrcParam('?src=dashboard&stage=new')).toBe('?stage=new')
  })

  test('saves and restores list state from session storage', () => {
    const storage = {
      data: {},
      getItem(key) { return this.data[key] || null },
      setItem(key, value) { this.data[key] = String(value) },
      removeItem(key) { delete this.data[key] },
    }

    saveStoredLeadsListState('/leads', {
      stageFilter: ['follow up'],
      currentPage: 2,
      scrollY: 640,
    }, storage)

    expect(loadStoredLeadsListState('/leads', storage)).toMatchObject({
      stageFilter: ['follow up'],
      currentPage: 2,
      scrollY: 640,
    })

    clearStoredLeadsListState('/leads', storage)
    expect(loadStoredLeadsListState('/leads', storage)).toBeNull()
  })

  test('sameStringArray compares filter values as strings', () => {
    expect(sameStringArray(['1', 2], [1, '2'])).toBe(true)
    expect(sameStringArray(['follow up'], [])).toBe(false)
  })
})
