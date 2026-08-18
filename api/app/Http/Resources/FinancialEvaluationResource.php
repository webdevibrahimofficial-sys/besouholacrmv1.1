<?php

namespace App\Http\Resources;

use App\Services\FinancialDecision\Dto\FinancialDecision;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FinancialEvaluationResource extends JsonResource
{
    /**
     * @param  FinancialDecision  $resource
     */
    public function __construct(
        $resource,
        private readonly array $cashFlows = [],
        private readonly array $input = [],
        private readonly ?int $evaluationId = null,
        private readonly string $locale = 'en',
        private readonly string $message = '',
    ) {
        parent::__construct($resource);
    }

    public function toArray(Request $request): array
    {
        return $this->toPublicArray();
    }

    public function toPublicArray(): array
    {
        /** @var FinancialDecision $decision */
        $decision = $this->resource;

        return self::stripTrace([
            'ok' => true,
            'evaluation_id' => $this->evaluationId,
            'decision' => $decision->decision,
            'status' => $decision->status,
            'reasons' => $decision->reasons,
            'warnings' => $decision->warnings,
            'metrics' => $decision->metrics->toArray(),
            'assumptions_snapshot' => $decision->assumptionsSnapshot,
            'policy_snapshot' => $decision->policySnapshot,
            'input_source' => $decision->inputSource,
            'engine_version' => $decision->engineVersion,
            'recommendations' => $decision->recommendations,
            'cash_flows' => $this->cashFlows,
            'input' => $this->input,
            'locale' => $this->locale,
            'message' => $this->message,
        ]);
    }

    public static function stripTrace(array $payload): array
    {
        unset($payload['calculation_trace']);

        foreach ($payload as $key => $value) {
            if (is_array($value)) {
                $payload[$key] = self::stripTrace($value);
            }
        }

        return $payload;
    }
}
