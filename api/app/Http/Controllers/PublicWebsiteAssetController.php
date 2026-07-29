<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class PublicWebsiteAssetController extends Controller
{
    public function show(Request $request, string $path)
    {
        $normalizedPath = ltrim($path, '/');

        if (!preg_match('/^\d+\/website(?:\/|$)/', $normalizedPath)) {
            abort(404);
        }

        $disk = Storage::disk('tenants');

        if (!$disk->exists($normalizedPath)) {
            abort(404);
        }

        $mime = $disk->mimeType($normalizedPath) ?: 'application/octet-stream';

        return response($disk->get($normalizedPath), 200, [
            'Content-Type' => $mime,
            'Cache-Control' => 'public, max-age=31536000',
        ]);
    }
}
