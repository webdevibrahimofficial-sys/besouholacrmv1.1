/* global jest, describe, test, expect */

import { fireEvent, render, screen } from '@testing-library/react'
import SearchableSelect from './SearchableSelect'

describe('SearchableSelect creatable', () => {
  test('allows typing a custom value that is not in the list', () => {
    const onChange = jest.fn()
    render(
      <SearchableSelect
        options={[{ value: 'Consulting', label: 'Consulting' }]}
        value=""
        onChange={onChange}
        placeholder="Service Type"
        creatable
        showAllOption={false}
      />
    )

    fireEvent.change(screen.getByPlaceholderText('Service Type'), {
      target: { value: 'Implementation' },
    })

    expect(onChange).toHaveBeenCalledWith('Implementation')
  })

  test('allows typing a custom value when the list is empty', () => {
    const onChange = jest.fn()
    render(
      <SearchableSelect
        options={[]}
        value=""
        onChange={onChange}
        placeholder="Service Type"
        creatable
        showAllOption={false}
      />
    )

    fireEvent.change(screen.getByPlaceholderText('Service Type'), {
      target: { value: 'Custom Type' },
    })

    expect(onChange).toHaveBeenCalledWith('Custom Type')
  })

  test('still allows picking an existing option', () => {
    const onChange = jest.fn()
    render(
      <SearchableSelect
        options={[
          { value: 'Consulting', label: 'Consulting' },
          { value: 'Maintenance', label: 'Maintenance' },
        ]}
        value=""
        onChange={onChange}
        placeholder="Service Type"
        creatable
        showAllOption={false}
      />
    )

    fireEvent.focus(screen.getByPlaceholderText('Service Type'))
    fireEvent.click(screen.getByText('Consulting'))

    expect(onChange).toHaveBeenCalledWith('Consulting')
  })
})
