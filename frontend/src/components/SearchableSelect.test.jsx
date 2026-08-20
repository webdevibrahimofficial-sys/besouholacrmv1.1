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

describe('SearchableSelect outside click', () => {
  test('closes when clicking outside even if a parent stops mousedown propagation', () => {
    const onChange = jest.fn()
    render(
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <SearchableSelect
          options={[
            { value: 'a', label: 'Item A' },
            { value: 'b', label: 'Item B' },
          ]}
          value=""
          onChange={onChange}
          placeholder="Select Item"
          showAllOption={false}
        />
        <button type="button">Outside field</button>
      </div>
    )

    fireEvent.click(screen.getByText('Select Item'))
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByText('Outside field'))
    expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument()
  })

  test('opens on trigger click even when a parent stops mousedown propagation', () => {
    const onChange = jest.fn()
    render(
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <SearchableSelect
          options={[
            { value: 'a', label: 'Item A' },
            { value: 'b', label: 'Item B' },
          ]}
          value=""
          onChange={onChange}
          placeholder="Select Item"
          showAllOption={false}
        />
      </div>
    )

    fireEvent.click(screen.getByText('Select Item'))
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()
  })

  test('closes on Escape', () => {
    const onChange = jest.fn()
    render(
      <SearchableSelect
        options={[{ value: 'a', label: 'Item A' }]}
        value=""
        onChange={onChange}
        placeholder="Select Item"
        showAllOption={false}
      />
    )

    fireEvent.click(screen.getByText('Select Item'))
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument()
  })

  test('does not open when disabled', () => {
    const onChange = jest.fn()
    render(
      <SearchableSelect
        options={[{ value: 'a', label: 'Item A' }]}
        value=""
        onChange={onChange}
        placeholder="Select Item"
        showAllOption={false}
        disabled
      />
    )

    fireEvent.click(screen.getByText('Select Item'))
    expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument()
  })
})
