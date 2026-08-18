<?php

namespace App\Support;

class StartCodeGenerator
{
    /**
     * @return array{prefix:string,startNumber:int,numberWidth:int}
     */
    public static function parse(string $startCode, string $fallbackPrefix = ''): array
    {
        $startCode = trim($startCode);
        $fallbackPrefix = (string) $fallbackPrefix;

        if ($startCode !== '' && preg_match('/^([^\d]*)(\d+)$/', $startCode, $matches)) {
            $prefix = $matches[1] !== '' ? $matches[1] : $fallbackPrefix;

            return [
                'prefix' => $prefix,
                'startNumber' => (int) $matches[2],
                'numberWidth' => max(1, strlen($matches[2])),
            ];
        }

        if ($startCode !== '' && ! preg_match('/\d/', $startCode)) {
            $prefix = str_ends_with($startCode, '-') ? $startCode : $startCode.'-';

            return [
                'prefix' => $prefix,
                'startNumber' => 1,
                'numberWidth' => 4,
            ];
        }

        return [
            'prefix' => $fallbackPrefix,
            'startNumber' => 1,
            'numberWidth' => 4,
        ];
    }

    /**
     * @param  iterable<int,mixed>  $existingCodes
     */
    public static function next(iterable $existingCodes, string $startCode, string $fallbackPrefix = '', ?callable $isTaken = null): string
    {
        $parsed = self::parse($startCode, $fallbackPrefix);
        $prefix = $parsed['prefix'];
        $width = $parsed['numberWidth'];
        $maxNum = $parsed['startNumber'] - 1;
        $pattern = $prefix === ''
            ? '/^(\d+)$/'
            : '/^'.preg_quote($prefix, '/').'(\d+)$/';

        foreach ($existingCodes as $code) {
            $code = trim((string) $code);
            if ($code === '' || ! preg_match($pattern, $code, $matches)) {
                continue;
            }

            $num = (int) $matches[1];
            if ($num > $maxNum) {
                $maxNum = $num;
            }
            $width = max($width, strlen($matches[1]));
        }

        for ($i = 1; $i < 10000; $i++) {
            $candidate = $prefix.str_pad((string) ($maxNum + $i), $width, '0', STR_PAD_LEFT);
            if ($isTaken && $isTaken($candidate)) {
                continue;
            }

            return $candidate;
        }

        return $prefix.now()->format('YmdHis');
    }
}
