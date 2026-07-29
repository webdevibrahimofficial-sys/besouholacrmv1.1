<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TelesalesDashboardSummaryResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return is_array($this->resource) ? $this->resource : [];
    }
}
