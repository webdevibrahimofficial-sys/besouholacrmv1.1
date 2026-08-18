<?php

namespace App\Services\FinancialDecision\Dto;

final class NpvResult
{
    /**
     * @param  list<array{sequence:int,amount:string,date:string,days:int,t:string,pv:string}>  $trace
     */
    public function __construct(
        public readonly string $npv,
        public readonly array $trace,
    ) {
    }
}
