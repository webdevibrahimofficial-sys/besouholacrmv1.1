<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContractTemplate extends Model
{
    protected $table = 'contract_templates';

    protected $fillable = [
        'tenant_id',
        'project_id',
        'name',
        'content_type',
        'body',
        'pdf_path',
        'pdf_original_name',
        'status',
    ];

    protected $casts = [
        'tenant_id' => 'integer',
        'project_id' => 'integer',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class, 'project_id');
    }
}
