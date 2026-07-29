<table>
  <thead>
    <tr>
      <th>Item</th>
      <th style="text-align:right">Value</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Reservation</td>
      <td style="text-align:right">{{ number_format((float) ($reservation_amount ?? 0), 2) }}</td>
    </tr>
    <tr>
      <td>Down Payment</td>
      <td style="text-align:right">{{ number_format((float) ($down_payment ?? 0), 2) }}</td>
    </tr>
    <tr>
      <td>Delivery Payment</td>
      <td style="text-align:right">{{ number_format((float) ($delivery_payment ?? 0), 2) }}</td>
    </tr>
    <tr>
      <td>Installment Type</td>
      <td style="text-align:right">{{ $installment_type ?? '' }}</td>
    </tr>
    <tr>
      <td>Installment Count</td>
      <td style="text-align:right">{{ (int) ($installment_count ?? 0) }}</td>
    </tr>
    <tr>
      <td>Installment Value</td>
      <td style="text-align:right">{{ number_format((float) ($installment_value ?? 0), 2) }}</td>
    </tr>
  </tbody>
</table>

