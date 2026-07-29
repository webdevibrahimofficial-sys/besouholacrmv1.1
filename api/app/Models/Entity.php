<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;

class Entity extends Model
{
    public const SUPPORTED_KEYS = [
        'leads',
        'customers',
        'items',
        'brokers',
        'properties',
        'requests',
        'realEstateRequests',
        'developers',
    ];

    protected $fillable = ['key'];

    public static function supportedKeys(): array
    {
        return Arr::sort(static::SUPPORTED_KEYS);
    }

    public static function ensureSupported(string $key): ?self
    {
        if (!in_array($key, static::SUPPORTED_KEYS, true)) {
            return null;
        }

        return static::firstOrCreate(['key' => $key]);
    }

    public function fields()
    {
        return $this->hasMany(Field::class)->orderBy('sort_order');
    }
}
