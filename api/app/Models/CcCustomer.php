<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CcCustomer extends TenantModel
{
    use HasFactory;

    protected $table = 'cc_customers';

    protected $fillable = [
        'tenant_id',
        'lead_id',
        'project_id',
        'sales_owner_id',
        'name',
        'phone',
        'email',
        'source',
        'last_comments',
        'meta_data',
    ];

    protected $casts = [
        'meta_data' => 'array',
    ];

    public function units()
    {
        return $this->hasMany(CcCustomerUnit::class, 'customer_id');
    }

    public function project()
    {
        return $this->belongsTo(Project::class, 'project_id');
    }

    public function salesOwner()
    {
        return $this->belongsTo(User::class, 'sales_owner_id');
    }

    public function contracts()
    {
        return $this->hasMany(CcContract::class, 'customer_id');
    }
}
