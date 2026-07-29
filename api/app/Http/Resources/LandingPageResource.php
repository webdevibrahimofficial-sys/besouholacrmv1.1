<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LandingPageResource extends JsonResource
{
    private function resolveFrontendOrigin(Request $request): string
    {
        $candidates = [
            $request->headers->get('origin'),
            $request->headers->get('referer'),
            config('app.frontend_url'),
            $request->getSchemeAndHttpHost(),
        ];

        foreach ($candidates as $candidate) {
            $value = trim((string) $candidate);
            if ($value === '') {
                continue;
            }

            if (str_contains($value, '://')) {
                $parts = parse_url($value);
                $scheme = $parts['scheme'] ?? null;
                $host = $parts['host'] ?? null;
                if (!$scheme || !$host) {
                    continue;
                }

                $port = isset($parts['port']) ? ':' . $parts['port'] : '';
                return rtrim($scheme . '://' . $host . $port, '/');
            }
        }

        return '';
    }

    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $meta = is_array($this->meta_data) ? $this->meta_data : [];
        $origin = $this->resolveFrontendOrigin($request);

        $leadContext = null;
        if (!empty($meta['lead_project_id'])) {
            $leadContext = [
                'type' => 'project',
                'id' => $meta['lead_project_id'],
                'name' => $meta['lead_project_name'] ?? null,
            ];
        } elseif (!empty($meta['lead_unit_id'])) {
            $leadContext = [
                'type' => 'unit',
                'id' => $meta['lead_unit_id'],
                'name' => $meta['lead_unit_name'] ?? null,
            ];
        } elseif (!empty($meta['lead_item_id'])) {
            $leadContext = [
                'type' => 'item',
                'id' => $meta['lead_item_id'],
                'name' => $meta['lead_item_name'] ?? null,
            ];
        }

        return [
            'id' => $this->id,
            'name' => $this->title, // Frontend expects 'name'
            'title' => $this->title,
            'slug' => $this->slug,
            'url' => $origin !== '' ? ($origin . '/p/' . rawurlencode((string) $this->slug)) : null,
            'description' => $this->description,
            'source' => $this->source,
            'campaign' => $this->campaign ? $this->campaign->name : null,
            'campaignId' => $this->campaign_id,
            'leadContext' => $leadContext,
            'email' => $this->email,
            'phone' => $this->phone,
            'theme' => $this->theme,
            'logo' => $this->logo,
            'cover' => $this->cover,
            'facebook' => $this->facebook,
            'instagram' => $this->instagram,
            'twitter' => $this->twitter,
            'linkedin' => $this->linkedin,
            'headerScript' => $this->header_script,
            'headerScriptEnabled' => (bool)$this->header_script_enabled,
            'bodyScript' => $this->body_script,
            'bodyScriptEnabled' => (bool)$this->body_script_enabled,
            'pixelId' => $this->pixel_id,
            'isPixelEnabled' => (bool)$this->is_pixel_enabled,
            'gtmId' => $this->gtm_id,
            'isGtmEnabled' => (bool)$this->is_gtm_enabled,
            'media' => $meta['media'] ?? [],
            'property' => $meta['property'] ?? [], // If property details are stored here
            'visitors' => $this->visits,
            'leads' => $this->conversions,
            'conversionRate' => $this->visits > 0 ? round(($this->conversions / $this->visits) * 100, 2) : 0,
            'isActive' => (bool)$this->is_active,
            'createdBy' => $this->created_by,
            'createdAt' => $this->created_at,
        ];
    }
}
