<?php

namespace App\Services\AiCopilot;

use Carbon\Carbon;

class CopilotNotificationTimeBucket
{
    public const TYPE_LEAD_INTELLIGENCE = 'lead_intelligence';

    public const TYPE_LEAD_RESCUE = 'lead_rescue';

    public const TYPE_ESCALATION = 'escalation';

    public const TYPE_LOST_DETECTIVE = 'lost_detective';

    /** Minutes per bucket for each notification type. */
    protected const BUCKET_MINUTES = [
        self::TYPE_LEAD_INTELLIGENCE => 45,
        self::TYPE_LEAD_RESCUE => 360,
        self::TYPE_ESCALATION => 1440,
        self::TYPE_LOST_DETECTIVE => 1440,
    ];

    public function compute(string $type, ?Carbon $at = null): string
    {
        $at = $at ?? now();
        $minutes = (int) self::BUCKET_MINUTES[$type] ?? 45;
        $totalMinutes = ((int) $at->format('H')) * 60 + (int) $at->format('i');
        $bucketStart = intdiv($totalMinutes, $minutes) * $minutes;
        $bucketHour = intdiv($bucketStart, 60);
        $bucketMinute = $bucketStart % 60;

        return sprintf(
            '%s-%02d%02d',
            $at->format('Ymd'),
            $bucketHour,
            $bucketMinute
        );
    }
}
