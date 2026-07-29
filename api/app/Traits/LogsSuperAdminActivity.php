<?php

namespace App\Traits;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Spatie\Permission\Models\Role;

trait LogsSuperAdminActivity
{
    protected function logSuperAdminActivity(
        ?User $actor,
        string $event,
        string $description,
        Model|Role|null $subject = null,
        array $properties = []
    ): void {
        try {
            $logger = activity('super_admin')
                ->withProperties($properties)
                ->event($event);

            if ($subject) {
                $logger->performedOn($subject);
            }

            if ($actor) {
                $logger->causedBy($actor);
            }

            $logger->log($description);
        } catch (\Throwable $exception) {
            report($exception);
        }
    }
}
