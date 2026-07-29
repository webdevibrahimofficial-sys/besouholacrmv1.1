<?php

namespace App\Console\Commands;

use App\Models\SystemSetting;
use App\Services\IntegrationSecretsService;
use Illuminate\Console\Command;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Crypt;

class EncryptSecretsCommand extends Command
{
    protected $signature = 'settings:encrypt-secrets {--dry-run : Show what would be encrypted without saving}';

    protected $description = 'Encrypt legacy plaintext integration secrets in system_settings';

    public function __construct(protected IntegrationSecretsService $secrets)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $keys = [
            'google_client_secret',
        ];

        $encrypted = 0;

        foreach ($keys as $key) {
            $setting = SystemSetting::where('key', $key)->first();
            if (!$setting || trim((string) $setting->value) === '') {
                continue;
            }

            try {
                Crypt::decryptString((string) $setting->value);
                continue;
            } catch (DecryptException) {
                // plaintext legacy value — encrypt below
            }

            if ($this->option('dry-run')) {
                $this->line("Would encrypt {$key}");
            } else {
                $setting->value = $this->secrets->encryptSecret((string) $setting->value);
                $setting->save();
                $this->info("Encrypted {$key}");
            }

            $encrypted++;
        }

        if ($encrypted === 0) {
            $this->info('No plaintext secrets found to encrypt.');
        }

        return self::SUCCESS;
    }
}
