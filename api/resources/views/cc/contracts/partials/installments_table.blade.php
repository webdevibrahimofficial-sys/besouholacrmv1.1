@php
  $list = $installments ?? collect();
  $showStatus = (bool) ($show_status ?? false);
  $showPaid = (bool) ($show_paid ?? false);
@endphp

@if($list->count() === 0)
  <div class="muted" style="font-size:13px">No installments</div>
@else
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Due Date</th>
        <th style="text-align:right">Amount</th>
        @if($showPaid)
          <th style="text-align:right">Paid</th>
        @endif
        @if($showStatus)
          <th>Status</th>
        @endif
      </tr>
    </thead>
    <tbody>
      @foreach($list as $inst)
        <tr>
          <td>#{{ $inst->installment_number }}</td>
          <td>{{ optional($inst->due_date)->toDateString() ?? (string) ($inst->due_date ?? '') }}</td>
          <td style="text-align:right">{{ number_format((float) ($inst->amount ?? 0), 2) }}</td>
          @if($showPaid)
            <td style="text-align:right">{{ number_format((float) ($inst->paid_amount ?? 0), 2) }}</td>
          @endif
          @if($showStatus)
            <td>{{ $inst->status ?? '' }}</td>
          @endif
        </tr>
      @endforeach
    </tbody>
  </table>
@endif

