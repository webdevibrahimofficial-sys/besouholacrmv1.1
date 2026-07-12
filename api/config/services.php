<?php

return [

    /*
     |--------------------------------------------------------------------------
     | Third Party Services
     |--------------------------------------------------------------------------
     |
     | This file is for storing the credentials for third party services such
     | as Mailgun, Postmark, AWS and more. This file provides the de facto
     | location for this type of information, allowing packages to have
     | a conventional file to locate the various service credentials.
     |
     */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'website_sync' => [
        'token' => env('WEBSITE_SYNC_TOKEN', 'your-secret-token-here'),
    ],

    'facebook' => [
        'client_id' => env('FACEBOOK_CLIENT_ID'),
        'client_secret' => env('FACEBOOK_CLIENT_SECRET'),
        'redirect' => env('FACEBOOK_REDIRECT_URI'),
        'verify_token' => env('FACEBOOK_VERIFY_TOKEN', env('META_VERIFY_TOKEN')),
        'minimal_scopes' => ['public_profile', 'email'],
        'scopes' => array_values(array_filter(array_map(
            'trim',
            explode(',', env('FACEBOOK_SCOPES', 'public_profile,email,pages_show_list,pages_read_engagement,ads_read,leads_retrieval,business_management,pages_manage_metadata'))
        ))),
    ],

    'meta' => [
        'mock_mode' => env('META_MOCK_MODE', false),
        'mock_on_local' => env('META_MOCK_ON_LOCAL', false),
        'oauth_minimal_scopes' => env('META_OAUTH_MINIMAL_SCOPES', false),
    ],

    'whatsapp' => [
        'webhook_verify_token' => env('WHATSAPP_WEBHOOK_VERIFY_TOKEN'),
    ],

    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => env('GOOGLE_ADS_REDIRECT_URI', env('GOOGLE_REDIRECT_URI')),
        'ads' => [
            'developer_token' => env('GOOGLE_ADS_DEVELOPER_TOKEN'),
            'login_customer_id' => env('GOOGLE_ADS_LOGIN_CUSTOMER_ID'),
            'mock_mode' => env('GOOGLE_ADS_MOCK_MODE', false),
            'mock_rate_limit' => env('GOOGLE_ADS_MOCK_RATE_LIMIT', 50),
            'mock_failure_probability' => env('GOOGLE_ADS_MOCK_FAILURE_PROBABILITY', 0.0),
            'mock_token_expire_min' => env('GOOGLE_ADS_MOCK_TOKEN_EXPIRE_MIN', 60),
        ],
    ],

    'wa_mirror' => [
        'url' => env('WA_MIRROR_SERVICE_URL', 'http://127.0.0.1:3000'),
        'token' => env('WA_MIRROR_INTERNAL_TOKEN'),
    ],

];
