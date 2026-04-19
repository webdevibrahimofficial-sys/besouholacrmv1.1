<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ContractTemplate extends Model
{
    use HasFactory;

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

    protected $appends = [
        'pdf_url',
    ];

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function project()
    {
        return $this->belongsTo(Project::class, 'project_id');
    }

    public function getPdfUrlAttribute()
    {
        if (!$this->pdf_path) return null;
        return asset('storage/' . ltrim((string) $this->pdf_path, '/'));
    }
}
