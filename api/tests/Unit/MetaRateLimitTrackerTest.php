<?php

namespace Tests\Unit;

use App\Services\MetaRateLimitTracker;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class MetaRateLimitTrackerTest extends TestCase
{
    public function test_records_counter_and_recent_events(): void
    {
        Cache::flush();

        $tracker = new MetaRateLimitTracker();
        $tracker->record('/me/accounts', 17, 'User request limit reached');
        $tracker->record('/page/leadgen_forms', 4, 'Application request limit reached');

        $this->assertSame(2, $tracker->countLast24Hours());

        $recent = $tracker->recentEvents();
        $this->assertCount(2, $recent);
        $this->assertSame('/page/leadgen_forms', $recent[0]['endpoint']);
        $this->assertSame(4, $recent[0]['code']);
    }
}
