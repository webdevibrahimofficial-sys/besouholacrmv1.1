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
        $logger = activity('super_admin')
            ->withProperties($properties)
            ->event($event);

        if ($actor) {
            $logger->causedBy($actor);
        }

        if ($subject) {
            $logger->performedOn($subject);
        }

        $logger->log($description);
    }
}
