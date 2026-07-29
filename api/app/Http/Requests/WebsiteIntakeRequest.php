<?php

namespace App\Http\Requests;

use App\Models\WebsiteIntakeLog;
use App\Services\WebsiteApiKeyService;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class WebsiteIntakeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['required', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'message' => ['nullable', 'string', 'max:2000'],
            'source' => ['nullable', 'string', 'max:100'],
            'meta' => ['nullable', 'array'],
        ];
    }

    protected function failedValidation(Validator $validator): void
    {
        $apiKey = (string) $this->route('apiKey');
        $connection = null;

        if ($apiKey !== '') {
            $connection = app(WebsiteApiKeyService::class)->resolveConnection($apiKey);
        }

        WebsiteIntakeLog::create([
            'tenant_id' => $connection?->tenant_id,
            'website_connection_id' => $connection?->id,
            'status' => 'validation_failed',
            'payload' => $this->safePayload(),
            'error_message' => json_encode($validator->errors()->toArray(), JSON_UNESCAPED_UNICODE),
            'ip_address' => $this->ip(),
            'origin' => $this->headers->get('Origin'),
            'user_agent' => $this->userAgent(),
        ]);

        throw new HttpResponseException(
            response()->json(['errors' => $validator->errors()], 422)
        );
    }

    private function safePayload(): array
    {
        return $this->except(['api_key', 'apiKey']);
    }
}
