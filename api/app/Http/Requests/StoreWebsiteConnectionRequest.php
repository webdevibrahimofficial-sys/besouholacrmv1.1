<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreWebsiteConnectionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user();
    }

    public function rules(): array
    {
        $tenantId = $this->user()?->tenant_id;

        return [
            'name' => ['required', 'string', 'max:255'],
            'url' => ['nullable', 'url', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
            'allowed_origins' => ['nullable', 'array'],
            'allowed_origins.*' => ['url', 'max:255'],
            'allow_all_origins_for_testing' => ['sometimes', 'boolean'],
            'default_campaign_id' => [
                'nullable',
                'integer',
                Rule::exists('campaigns', 'id')->where(fn ($query) => $query->where('tenant_id', $tenantId)),
            ],
            'default_source_id' => [
                'nullable',
                'integer',
                Rule::exists('sources', 'id')->where(fn ($query) => $query->where('tenant_id', $tenantId)),
            ],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            $allowAll = (bool) $this->boolean('allow_all_origins_for_testing');
            $origins = $this->input('allowed_origins');
            $hasOrigins = is_array($origins) && count(array_filter($origins, fn ($origin) => filled($origin))) > 0;

            if (app()->environment('production') && !$allowAll && !$hasOrigins) {
                $validator->errors()->add('allowed_origins', 'Allowed origins are required in production when testing mode is disabled.');
            }
        });
    }
}
