<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Traits\BelongsToTenant;

class Customer extends Model
{
    use BelongsToTenant;
    use SoftDeletes;

    protected $guarded = [];

    protected $casts = [
        'meta_data' => 'array',
        'deleted_at' => 'datetime',
    ];

    public function customFieldValues()
    {
        return $this->hasMany(FieldValue::class, 'record_id');
    }

    public function assignee()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function deletedByUser()
    {
        return $this->belongsTo(User::class, 'deleted_by');
    }
}
