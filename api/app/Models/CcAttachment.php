<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class CcAttachment extends TenantModel
{
    use HasFactory;

    protected $table = 'cc_attachments';

    protected $fillable = [
        'tenant_id',
        'related_type',
        'related_id',
        'file_path',
        'file_type',
        'uploaded_by',
        'meta_data',
    ];

    protected $casts = [
        'meta_data' => 'array',
    ];

    protected $appends = [
        'url',
        'original_name',
        'size',
        'mime',
    ];

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function getUrlAttribute(): ?string
    {
        $path = (string) ($this->file_path ?? '');
        if ($path === '') return null;

        try {
            return Storage::disk('public')->url($path);
        } catch (\Throwable $e) {
            return null;
        }
    }

    public function getOriginalNameAttribute(): ?string
    {
        $meta = is_array($this->meta_data) ? $this->meta_data : [];

        return isset($meta['original_name']) ? (string) $meta['original_name'] : null;
    }

    public function getSizeAttribute(): ?int
    {
        $meta = is_array($this->meta_data) ? $this->meta_data : [];

        return isset($meta['size']) ? (int) $meta['size'] : null;
    }

    public function getMimeAttribute(): ?string
    {
        $meta = is_array($this->meta_data) ? $this->meta_data : [];
        $mime = $meta['mime'] ?? ($this->file_type ?? null);

        return $mime ? (string) $mime : null;
    }
}
