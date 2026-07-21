<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TelesalesLeadResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $data = parent::toArray($request);

        $data['display_stage'] = $this->display_stage ?? null;
        $data['display_stage_key'] = $this->display_stage_key ?? null;
        $data['assigned_to_name'] = $this->assigned_to_name ?? null;
        $data['convert_by_name'] = $this->convert_by_name ?? null;
        $data['convert_to_name'] = $this->convert_to_name ?? null;
        $data['permissions'] = $this->permissions ?? [];

        return $data;
    }
}
