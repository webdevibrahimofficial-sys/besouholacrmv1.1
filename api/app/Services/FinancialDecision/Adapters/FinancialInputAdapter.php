<?php

namespace App\Services\FinancialDecision\Adapters;

use App\Models\User;
use App\Services\FinancialDecision\Dto\FinancialInputSource;
use App\Services\FinancialDecision\Dto\FinancialOffer;
use App\Services\FinancialDecision\Dto\StructuredFinancialRequest;

interface FinancialInputAdapter
{
    /**
     * @return array{
     *   ok:bool,
     *   status:?string,
     *   reasons:list<string>,
     *   offer:?FinancialOffer,
     *   allocations:list<array<string,mixed>>,
     *   source:FinancialInputSource,
     *   evaluable:?array{type:string,id:int}
     * }
     */
    public function resolve(User $user, StructuredFinancialRequest $request, string $startDate): array;
}
