<?php

namespace App\Services;

use App\Models\WebsiteCareerPage;
use App\Models\WebsiteCareerRole;
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
                        'headline' => 'One Intelligent CRM Built for Your Growth',
                        'headline_accent' => '',
                        'subtitle' => 'Be Souhola adapts to your workflow. Capture leads, automate follow-ups, and close deals faster whether you are a growing business or a specialized real estate team.',
                        'primary_cta' => 'Request Demo',
                        'secondary_cta' => 'Explore Features',
                        'form_title' => 'Book Your Free Demo',
                        'form_subtitle' => 'Tell us what you need and our team will contact you within 24 hours.',
                        'form_badge' => 'CRM Demo',
                        'form_side_title' => 'Why Teams Choose Us',
                        'form_button_text' => 'Request Demo',
                        'name_label' => 'Full name *',
                        'name_placeholder' => 'John Doe',
                        'phone_label' => 'Phone number *',
                        'phone_placeholder' => '+20 100 000 0000',
                        'email_label' => 'Email address',
                        'email_placeholder' => 'you@company.com',
                        'service_label' => 'Service interested in',
                        'service_placeholder' => 'Select your business type',
                        'message_label' => 'Notes',
                        'message_placeholder' => 'Anything we should know before we contact you?',
                        'privacy_note' => 'Your data stays private and is only used to contact you.',
                        'success_title' => 'Thank you!',
                        'success_message' => 'We received your request. Our team will contact you shortly.',
                        'success_reset_text' => 'Submit another request',
                        'trust_points' => [
                            '500+ businesses',
                            'AI-powered automation',
                            'Enterprise-grade security',
                        ],
                        'benefit_points' => [
                            'Free consultation',
                            'Response within 24 hours',
                            'No commitment required',
                        ],
                        'form_panel_points' => [
                            'Setup support included',
                            'Tailored walkthrough',
                            'Clear next steps',
                        ],
                        'service_options' => [
                            'General Business CRM (Sales & Marketing)',
                            'Real Estate CRM (Property & Lead Management)',
                            'Other',
                        ],
                        'stats' => [
                            ['value' => '500+', 'label' => 'Teams onboarded'],
                            ['value' => '24h', 'label' => 'Average first response'],
                            ['value' => '38%', 'label' => 'Faster deal closing'],
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

        if (!WebsiteCareerPage::withoutGlobalScopes()->where('tenant_id', $tenantId)->exists()) {
            WebsiteCareerPage::withoutGlobalScopes()->create([
                'tenant_id' => $tenantId,
                'is_active' => true,
                'content' => [
                    'badge' => 'Careers at Be Souhola',
                    'title' => 'Build the Future of CRM With Us',
                    'subtitle' => 'Join Be Souhola to build CRM, automation, and lead management tools used by growing businesses.',
                    'primary_cta' => 'View Open Roles',
                    'secondary_cta' => 'Send Your Profile',
                    'roles_title' => 'Open Positions',
                    'roles_heading' => 'Current opportunities',
                    'roles_subtitle' => 'Do not see the perfect fit? Reach out anyway. Strong operators often create their own lane.',
                    'hiring_badge' => 'Now Hiring',
                    'availability_note' => 'Currently hiring for Engineering, Sales, and Customer Success roles.',
                    'highlights_title' => 'Why Join Be Souhola?',
                    'highlights_heading' => 'A clearer path from craft to impact',
                    'values_title' => 'Culture & Values',
                    'values_heading' => 'How we work together',
                    'values_subtitle' => 'We care about ownership, sharp execution, and a working style that helps good people do their best work.',
                    'benefits_title' => 'Benefits & Environment',
                    'benefits_heading' => 'A setup built for momentum',
                    'general_application_badge' => 'General application',
                    'general_application_heading' => 'Do not see the right role?',
                    'general_application_subtitle' => 'Send your profile anyway. If your background fits an upcoming role, we would still love to hear from you.',
                    'general_application_button_text' => 'Send Your Profile',
                    'general_form_headline' => 'Send your profile',
                    'general_form_subtitle' => 'No perfect match yet? Send your profile here instead of a service request. Our hiring team will review it as a career application.',
                    'sidebar_badge' => 'Why join us',
                    'sidebar_cards' => [
                        ['title' => 'Product-led', 'description' => 'Ship visible work that customers use every day.'],
                        ['title' => 'High ownership', 'description' => 'Work closely with design, growth, and customer teams.'],
                        ['title' => 'Real impact', 'description' => 'Help shape how growing businesses operate at scale.'],
                    ],
                    'role_filters' => ['All', 'Engineering', 'Sales', 'Customer Success'],
                    'highlights' => [
                        ['title' => 'Real Product Impact', 'description' => 'Your work ships into a live CRM used in sales, operations, and customer growth workflows.'],
                        ['title' => 'Modern SaaS Stack', 'description' => 'We build across React, Laravel, automation systems, analytics, and scalable internal tooling.'],
                        ['title' => 'Growth Culture', 'description' => 'You will work with teammates who value iteration, responsibility, and continuous improvement.'],
                        ['title' => 'Remote-Friendly Workflow', 'description' => 'Clear async communication, documented decisions, and room for focused deep work.'],
                    ],
                    'values' => [
                        ['title' => 'Ownership', 'description' => 'We trust people to drive outcomes and improve what they touch.'],
                        ['title' => 'Customer First', 'description' => 'We build around clarity, reliability, and solving real operational problems.'],
                        ['title' => 'Build Fast', 'description' => 'Speed matters, but we aim for speed with judgment rather than chaos.'],
                        ['title' => 'Quality Matters', 'description' => 'Premium details, stable systems, and thoughtful UX are part of the product.'],
                    ],
                    'benefits' => [
                        ['title' => 'Flexible Work Rhythm', 'description' => 'Balanced collaboration time with uninterrupted focus blocks for meaningful progress.'],
                        ['title' => 'Product Ownership', 'description' => 'Engineers, designers, and operators contribute ideas instead of only taking tickets.'],
                        ['title' => 'Learning Momentum', 'description' => 'Hands-on exposure to CRM systems, growth loops, automation, and real customer feedback.'],
                        ['title' => 'Strong Team Access', 'description' => 'Direct collaboration with decision-makers across product, sales, and operations.'],
                    ],
                ],
            ]);
        }

        if (!WebsiteCareerRole::withoutGlobalScopes()->where('tenant_id', $tenantId)->exists()) {
            $roles = [
                [
                    'slug' => 'frontend-react-developer',
                    'title' => 'Frontend React Developer',
                    'department' => 'Engineering',
                    'location' => 'Remote / Hybrid',
                    'work_type' => 'Remote-friendly',
                    'employment_type' => 'Full-time',
                    'experience_level' => 'Mid-level',
                    'summary' => 'Craft polished interfaces for the website, CRM modules, and conversion-focused user journeys.',
                    'description' => 'You will help shape the visual and interaction quality of the Be Souhola ecosystem, from landing pages to product surfaces. This role blends frontend craftsmanship with product thinking and performance awareness.',
                    'responsibilities' => [
                        'Build responsive, premium-feeling interfaces with React.',
                        'Translate product direction into scalable UI patterns.',
                        'Improve page performance, clarity, and interaction quality.',
                        'Collaborate with backend and growth teams on full customer journeys.',
                    ],
                    'requirements' => [
                        'Strong React and JavaScript fundamentals.',
                        'Solid CSS/Tailwind and responsive layout experience.',
                        'Ability to improve existing code without unnecessary rewrites.',
                        'Good product judgment and attention to visual quality.',
                    ],
                    'benefits' => ['Flexible workflow', 'High ownership', 'Cross-functional collaboration'],
                ],
                [
                    'slug' => 'laravel-backend-developer',
                    'title' => 'Laravel Backend Developer',
                    'department' => 'Engineering',
                    'location' => 'Hybrid / Cairo',
                    'work_type' => 'Hybrid',
                    'employment_type' => 'Full-time',
                    'experience_level' => 'Mid-level',
                    'summary' => 'Design and maintain backend services powering CRM workflows, integrations, and data-heavy operations.',
                    'description' => 'This role focuses on building reliable backend systems for lead management, automation, website integrations, and admin tooling. You will work closely with frontend and product to keep delivery fast and stable.',
                    'responsibilities' => [
                        'Build APIs and services in Laravel for product and website workflows.',
                        'Improve data models, validation, and operational reliability.',
                        'Support integrations with lead sources and internal tools.',
                        'Help maintain performance and deployment quality across environments.',
                    ],
                    'requirements' => [
                        'Strong Laravel and relational database experience.',
                        'Comfort with API design and operational debugging.',
                        'Ability to reason about business rules and edge cases.',
                        'Clear communication and ownership mindset.',
                    ],
                    'benefits' => ['Meaningful product scope', 'Operational autonomy', 'Long-term system ownership'],
                ],
                [
                    'slug' => 'sales-specialist',
                    'title' => 'Sales Specialist',
                    'department' => 'Sales',
                    'location' => 'Hybrid / Cairo',
                    'work_type' => 'Hybrid',
                    'employment_type' => 'Full-time',
                    'experience_level' => 'Mid-level',
                    'summary' => 'Turn qualified pipeline into strong customer conversations and help growing teams adopt the platform.',
                    'description' => 'You will work closely with inbound opportunities, demos, follow-ups, and practical customer discovery. The role blends consultative selling with real exposure to CRM workflows and business operations.',
                    'responsibilities' => [
                        'Run product demos and qualification conversations.',
                        'Maintain clear follow-ups across active opportunities.',
                        'Coordinate with customer success for smooth handoff after closing.',
                        'Surface recurring objections and market feedback to the wider team.',
                    ],
                    'requirements' => [
                        'Strong communication and consultative selling skills.',
                        'Comfort presenting software products clearly and confidently.',
                        'Organized follow-up discipline and CRM hygiene.',
                        'Bias toward ownership and measurable outcomes.',
                    ],
                    'benefits' => ['Visible revenue impact', 'Fast learning curve', 'Tight collaboration with product'],
                ],
                [
                    'slug' => 'customer-success-specialist',
                    'title' => 'Customer Success Specialist',
                    'department' => 'Customer Success',
                    'location' => 'On-site / Cairo',
                    'work_type' => 'On-site',
                    'employment_type' => 'Full-time',
                    'experience_level' => 'Associate to Mid-level',
                    'summary' => 'Help customers onboard smoothly, adopt the platform faster, and turn product value into long-term retention.',
                    'description' => 'You will work closely with customers after signup to guide setup, answer questions, and surface product improvement opportunities. It is a high-context role with visible impact on retention and satisfaction.',
                    'responsibilities' => [
                        'Support onboarding and adoption for new customers.',
                        'Translate customer feedback into product insights.',
                        'Coordinate with sales and product on account health.',
                        'Maintain a premium, clear support experience.',
                    ],
                    'requirements' => [
                        'Strong communication skills in customer-facing settings.',
                        'Comfort learning CRM workflows and explaining them clearly.',
                        'Organized follow-up and documentation habits.',
                        'Empathy, ownership, and calm under pressure.',
                    ],
                    'benefits' => ['Visible customer impact', 'Tight product feedback loop', 'Career growth path'],
                ],
                [
                    'slug' => 'digital-marketing-specialist',
                    'title' => 'Digital Marketing Specialist',
                    'department' => 'Sales',
                    'location' => 'Remote / Hybrid',
                    'work_type' => 'Remote-friendly',
                    'employment_type' => 'Full-time',
                    'experience_level' => 'Mid-level',
                    'summary' => 'Drive qualified pipeline through paid acquisition, conversion improvements, and campaign reporting.',
                    'description' => 'You will operate across performance strategy, campaign testing, landing page insights, and messaging refinement. This role is ideal for someone who likes measurable outcomes and tight collaboration with product.',
                    'responsibilities' => [
                        'Manage and optimize performance campaigns across key channels.',
                        'Coordinate landing-page experiments and conversion insights.',
                        'Track results, reporting quality, and acquisition efficiency.',
                        'Work with design and content on stronger campaign execution.',
                    ],
                    'requirements' => [
                        'Hands-on digital marketing and performance campaign experience.',
                        'Comfort reading metrics and acting on them quickly.',
                        'Clear experimentation mindset.',
                        'Ability to collaborate across growth and product teams.',
                    ],
                    'benefits' => ['Fast iteration loop', 'Direct ROI visibility', 'Cross-channel experimentation'],
                ],
            ];

            foreach ($roles as $index => $role) {
                WebsiteCareerRole::withoutGlobalScopes()->create([
                    'tenant_id' => $tenantId,
                    ...$role,
                    'sort_order' => ($index + 1) * 10,
                    'is_featured' => $index < 3,
                    'is_active' => true,
                ]);
            }
        }
    }
}
