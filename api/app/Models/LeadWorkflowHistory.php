<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class LeadWorkflowHistory extends Model
{
    use BelongsToTenant;

    protected $table = 'lead_workflow_history';

    protected $fillable = [
        'tenant_id',
        'lead_id',
        'from_workflow',
        'to_workflow',
        'from_stage_id',
        'to_stage_id',
        'action',
        'performed_by',
        'meta_data',
    ];

    protected $casts = [
        'meta_data' => 'array',
    ];

    public function performedByUser()
    {
        return $this->belongsTo(User::class, 'performed_by');
    }
}
