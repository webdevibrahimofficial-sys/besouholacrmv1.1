<?php

namespace App\Http\Requests;

use App\Models\WebsiteIntakeLog;
use App\Services\WebsiteApiKeyService;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class WebsiteCareerApplicationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'full_name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['required', 'string', 'max:50'],
            'role_slug' => ['nullable', 'string', 'max:255'],
            'role_title' => ['nullable', 'string', 'max:255'],
            'current_role' => ['nullable', 'string', 'max:255'],
            'years_experience' => ['nullable', 'string', 'max:50'],
            'location' => ['nullable', 'string', 'max:255'],
            'work_preference' => ['nullable', 'string', 'max:80'],
            'linkedin_url' => ['nullable', 'url', 'max:500'],
            'portfolio_url' => ['nullable', 'url', 'max:500'],
            'salary_expectation' => ['nullable', 'string', 'max:120'],
            'availability' => ['nullable', 'string', 'max:120'],
            'motivation' => ['nullable', 'string', 'max:4000'],
            'biggest_achievement' => ['nullable', 'string', 'max:4000'],
            'cover_letter' => ['nullable', 'string', 'max:4000'],
            'answers' => ['nullable', 'array'],
            'answers.*' => ['nullable', 'string', 'max:4000'],
            'meta' => ['nullable', 'array'],
            'cv' => ['required', 'file', 'mimes:pdf,doc,docx', 'max:5120'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $meta = $this->input('meta');
        $answers = $this->input('answers');

        $normalized = [];

        if (is_string($meta)) {
          $decodedMeta = json_decode($meta, true);
          if (json_last_error() === JSON_ERROR_NONE && is_array($decodedMeta)) {
              $normalized['meta'] = $decodedMeta;
          }
        }

        if (is_string($answers)) {
          $decodedAnswers = json_decode($answers, true);
          if (json_last_error() === JSON_ERROR_NONE && is_array($decodedAnswers)) {
              $normalized['answers'] = $decodedAnswers;
          }
        }

        if (!empty($normalized)) {
            $this->merge($normalized);
        }
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
            'status' => 'career_validation_failed',
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
        return $this->except(['api_key', 'apiKey', 'cv']);
    }
}
