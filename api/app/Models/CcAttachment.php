<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CcAttachment extends Model
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

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}

