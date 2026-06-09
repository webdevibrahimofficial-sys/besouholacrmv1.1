<?php

namespace App\Services;

use App\Models\WebsiteHomepageSection;
use App\Models\WebsiteService;
use App\Models\WebsiteSetting;
use Illuminate\Support\Str;

class WebsiteCmsBootstrapService
{
    public function ensureForTenant(int $tenantId): void
    {
        if (!WebsiteSetting::withoutGlobalScopes()->where('tenant_id', $tenantId)->exists()) {
            WebsiteSetting::withoutGlobalScopes()->create([
                'tenant_id' => $tenantId,
                'company_name' => 'Be Souhola',
                'logo_url' => 'https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/49e5fc512fe9f5468e81f2135e55bdb4.png',
                'phone' => '+1 (555) 234-5678',
                'email' => 'sales@besouhola.com',
                'whatsapp' => null,
                'address' => '200 Tech Boulevard, Suite 400, Innovation City, CA 94102',
                'social_links' => [
                    'facebook' => 'https://www.facebook.com/profile.php?id=61587661674565',
                ],
                'primary_color' => '#9372FF',
                'seo_title' => 'Be Souhola - CRM Platform for Real Estate & Business',
                'seo_description' => 'Be Souhola is a leading CRM platform designed for real estate professionals and businesses.',
                'is_published' => true,
            ]);
        }

        if (!WebsiteHomepageSection::withoutGlobalScopes()->where('tenant_id', $tenantId)->exists()) {
            $sections = [
                [
                    'type' => 'hero',
                    'title' => 'Hero',
                    'sort_order' => 10,
                    'content' => [
                        'badge' => 'AI-Powered CRM Platform',
                        'headline' => 'Turn Every Lead Into',
                        'headline_accent' => 'Revenue Growth',
                        'subtitle' => 'Be Souhola helps real estate teams and growing businesses capture leads, automate follow-ups, and close deals faster — all from one intelligent CRM.',
                        'primary_cta' => 'Book a Free Demo',
                        'secondary_cta' => 'Explore Solutions',
                        'form_title' => 'Get started today',
                        'form_subtitle' => 'Fill in your details and our team will reach out within 24 hours.',
                        'trust_points' => [
                            '500+ businesses',
                            'AI-powered automation',
                            'Enterprise-grade security',
                        ],
                    ],
                ],
                [
                    'type' => 'services_intro',
                    'title' => 'Services Intro',
                    'sort_order' => 20,
                    'content' => [
                        'title' => 'PLATFORM',
                        'title_accent' => 'FEATURES',
                        'description' => 'Be Souhola is a software company specializing in developing advanced Customer Relationship Management (CRM) solutions designed to support business growth and enhance operational efficiency.',
                        'tags' => ['CRM', 'Real Estate', 'AI Automation', 'Analytics'],
                    ],
                ],
                [
                    'type' => 'cta',
                    'title' => 'CTA',
                    'sort_order' => 30,
                    'content' => [
                        'headline' => 'Ready to Transform Your',
                        'headline_accent' => 'Business',
                        'subtitle' => 'Join hundreds of businesses already using Be Souhola to streamline operations, boost sales, and build stronger client relationships.',
                        'highlights' => [
                            'Boost conversion rates by up to 38%',
                            'Go live in days, not months',
                            'Dedicated onboarding support',
                        ],
                    ],
                ],
            ];

            foreach ($sections as $section) {
                WebsiteHomepageSection::withoutGlobalScopes()->create([
                    'tenant_id' => $tenantId,
                    ...$section,
                    'is_active' => true,
                ]);
            }
        }

        if (!WebsiteService::withoutGlobalScopes()->where('tenant_id', $tenantId)->exists()) {
            $services = [
                [
                    'name' => 'Client Relationship Management',
                    'short_description' => 'Centralize all client interactions, projects, and sales pipelines in one intelligent platform.',
                    'description' => 'Centralize all client interactions, projects, and sales pipelines in one intelligent platform. Track every touchpoint, automate follow-ups, and never miss an opportunity to close deals.',
                ],
                [
                    'name' => 'Real-time Analytics & Reporting',
                    'short_description' => 'Make data-driven decisions with comprehensive dashboards and real-time insights.',
                    'description' => 'Make data-driven decisions with comprehensive dashboards and real-time insights. Monitor sales performance, track KPIs, and identify trends before your competition does.',
                ],
                [
                    'name' => 'AI-Powered Automation',
                    'short_description' => 'Leverage intelligent automation and predictive insights to streamline workflows.',
                    'description' => 'Leverage intelligent automation and predictive insights to streamline workflows. Let AI handle routine tasks while your team focuses on building relationships and closing deals.',
                ],
                [
                    'name' => 'Customizable Platform',
                    'short_description' => 'Adaptable to multiple industries with a strong focus on real estate.',
                    'description' => 'Adaptable to multiple industries with a strong focus on real estate. Configure workflows, fields, and processes to match your unique business requirements without writing code.',
                ],
                [
                    'name' => 'Team Collaboration',
                    'short_description' => 'Align teams and streamline operations with shared workspaces and task management.',
                    'description' => 'Align teams and streamline operations with shared workspaces, task management, and real-time communication. Keep everyone on the same page from sales to customer success.',
                ],
                [
                    'name' => 'Mobile-First Design',
                    'short_description' => 'Access your CRM anywhere, anytime with our responsive mobile platform.',
                    'description' => 'Access your CRM anywhere, anytime with our responsive mobile platform. Manage clients, update deals, and stay productive whether you are in the office or on the go.',
                ],
            ];

            foreach ($services as $index => $service) {
                WebsiteService::withoutGlobalScopes()->create([
                    'tenant_id' => $tenantId,
                    'name' => $service['name'],
                    'slug' => Str::slug($service['name']),
                    'short_description' => $service['short_description'],
                    'description' => $service['description'],
                    'cta_text' => 'Request a Demo',
                    'form_name' => 'Service Form - ' . $service['name'],
                    'sort_order' => ($index + 1) * 10,
                    'is_active' => true,
                ]);
            }
        }
    }
}
