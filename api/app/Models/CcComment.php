<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CcComment extends Model
{
    use HasFactory;

    protected $table = 'cc_comments';

    protected $fillable = [
        'tenant_id',
        'related_type',
        'related_id',
        'comment',
        'created_by',
    ];

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}

