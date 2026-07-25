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
        $data['transfer_from_assignee_id'] = $this->transfer_from_assignee_id ?? null;
        $data['transfer_from_assignee_name'] = $this->transfer_from_assignee_name ?? null;
        $data['transfer_to_assignee_id'] = $this->transfer_to_assignee_id ?? null;
        $data['transfer_to_assignee_name'] = $this->transfer_to_assignee_name ?? null;
        $data['transfer_assign_role'] = $this->transfer_assign_role ?? null;
        $data['transfer_history_id'] = $this->transfer_history_id ?? null;
        $data['transfer_stage'] = $this->transfer_stage ?? null;
        $data['transfer_history_option'] = $this->transfer_history_option ?? null;
        $data['transfer_from_stage_name'] = $this->transfer_from_stage_name ?? null;
        $data['transfer_to_stage_name'] = $this->transfer_to_stage_name ?? null;
        $data['permissions'] = $this->permissions ?? [];

        return $data;
    }
}
