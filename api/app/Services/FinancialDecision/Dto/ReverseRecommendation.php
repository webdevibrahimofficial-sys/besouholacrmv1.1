<?php

namespace App\Services\FinancialDecision\Dto;

final class ReverseRecommendation
{
    /**
     * @param  list<array{code:string,value:string,unit:string,target_decision:string}>  $items
     */
    public function __construct(
        public readonly array $items = [],
    ) {
    }

    public function toArray(): array
    {
        return [
            'items' => $this->items,
        ];
    }

    /**
     * @return list<array{code:string,value:string,unit:string,target_decision:string}>
     */
    public function items(): array
    {
        return $this->items;
    }
}
