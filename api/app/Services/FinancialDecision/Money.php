<?php

namespace App\Services\FinancialDecision;

final class Money
{
    public const SCALE = 12;

    public const DISPLAY_SCALE = 2;

    public const ALLOCATION_TOLERANCE_RATIO = '0.0001';

    public static function of(mixed $value): string
    {
        if ($value === null || $value === '') {
            return bcadd('0', '0', self::SCALE);
        }

        if (is_bool($value)) {
            return $value ? '1' : '0';
        }

        $raw = trim((string) $value);
        $raw = str_replace([',', ' '], '', $raw);
        if ($raw === '' || ! is_numeric($raw)) {
            return bcadd('0', '0', self::SCALE);
        }

        return bcadd($raw, '0', self::SCALE);
    }

    public static function add(string $left, string $right): string
    {
        return bcadd($left, $right, self::SCALE);
    }

    public static function sub(string $left, string $right): string
    {
        return bcsub($left, $right, self::SCALE);
    }

    public static function mul(string $left, string $right): string
    {
        return bcmul($left, $right, self::SCALE);
    }

    public static function div(string $left, string $right): string
    {
        if (bccomp($right, '0', self::SCALE) === 0) {
            throw new \InvalidArgumentException('Division by zero.');
        }

        return bcdiv($left, $right, self::SCALE);
    }

    public static function cmp(string $left, string $right): int
    {
        return bccomp($left, $right, self::SCALE);
    }

    public static function abs(string $value): string
    {
        return self::cmp($value, '0') < 0 ? self::mul($value, '-1') : $value;
    }

    public static function pow(string $base, string $exponent): string
    {
        if (self::cmp($exponent, '0') === 0) {
            return bcadd('1', '0', self::SCALE);
        }

        $integer = bcadd($exponent, '0', 0);
        if (self::cmp($exponent, $integer) === 0) {
            return bcpow($base, $integer, self::SCALE);
        }

        return bcadd((string) pow((float) $base, (float) $exponent), '0', self::SCALE);
    }

    public static function roundHalfUp(string $value, int $scale = self::DISPLAY_SCALE): string
    {
        $factor = bcpow('10', (string) ($scale + 1), 0);
        $scaled = bcmul($value, $factor, 0);
        $sign = self::cmp($value, '0') < 0 ? -1 : 1;
        $last = (int) substr($scaled, -1);
        $trimmed = substr($scaled, 0, -1) ?: '0';
        if ($last >= 5) {
            $trimmed = (string) ((int) $trimmed + $sign);
        }

        $divisor = bcpow('10', (string) $scale, 0);

        return bcdiv($trimmed, $divisor, $scale);
    }

    public static function allocationTolerance(string $netAmount): string
    {
        $ratioTolerance = self::mul(self::abs($netAmount), self::ALLOCATION_TOLERANCE_RATIO);
        $absoluteFloor = '0.01';

        return self::cmp($ratioTolerance, $absoluteFloor) > 0 ? $ratioTolerance : $absoluteFloor;
    }
}
