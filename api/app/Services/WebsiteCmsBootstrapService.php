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
    private function homepageSections(): array
    {
        return [
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
                    'dashboard_panel' => [
                        'title' => 'Dashboard',
                        'demo_cta_text' => 'See how it works',
                        'pipeline_title' => 'Pipeline stages',
                        'pipeline_stages' => [
                            ['label' => 'TOTAL LEADS', 'value' => '248', 'color' => 'blue'],
                            ['label' => 'NEW', 'value' => '86', 'color' => 'green'],
                            ['label' => 'DUPLICATE', 'value' => '32', 'color' => 'red'],
                            ['label' => 'PENDING', 'value' => '98', 'color' => 'yellow'],
                            ['label' => 'COLD CALLS', 'value' => '32', 'color' => 'orange'],
                        ],
                        'delay_leads_count' => '18',
                        'delay_leads_title' => 'Delay Leads',
                        'delay_leads_description' => 'Leads need follow-up',
                        'delay_leads_helper_text' => 'Take action to close more deals',
                        'ranking' => [
                            ['name' => 'Ahmed Mohamed', 'actions' => 128],
                            ['name' => 'Mona Adel', 'actions' => 96],
                            ['name' => 'Omar Mostafa', 'actions' => 74],
                        ],
                        'ranking_title' => 'Ranking',
                        'ranking_actions_label' => 'Actions',
                        'ranking_cta_text' => 'View full ranking ->',
                    ],
                    'outer_stats' => [
                        ['value' => '500+', 'label' => 'Businesses trust us'],
                        ['value' => '24h', 'label' => 'Avg response time'],
                        ['value' => '38%', 'label' => 'Faster deal closing'],
                    ],
                    'stats' => [
                        ['value' => '500+', 'label' => 'Teams onboarded'],
                        ['value' => '24h', 'label' => 'Average first response'],
                        ['value' => '38%', 'label' => 'Faster deal closing'],
                    ],
                ],
            ],
            [
                'type' => 'trusted_clients',
                'title' => 'Trusted Clients',
                'sort_order' => 15,
                'content' => [
                    'eyebrow' => 'Trusted by industry leaders',
                    'highlight_text' => '50+ industries/businesses',
                    'headline_suffix' => 'trust Be Souhola',
                    'clients' => [
                        'Meridian Properties',
                        'Skyline Realty Group',
                        'Urban Development Partners',
                        'Coastal Estates',
                        'PropTech Innovations',
                        'Thompson & Associates',
                    ],
                ],
            ],
            [
                'type' => 'about',
                'title' => 'About',
                'sort_order' => 18,
                'content' => [
                    'primary_enabled' => true,
                    'primary_image_url' => 'https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/charlesdeluvio-lks7vei-eag-unsplash-7Or6F.jpg',
                    'primary_image_alt' => 'Modern office with technology team collaborating on CRM development',
                    'primary_title' => "We're passionate about",
                    'primary_title_accent' => 'business transformation',
                    'primary_card_one_title' => 'CRM platform powered by artificial intelligence',
                    'primary_card_one_body' => 'This platform enables organizations to manage their relationships and operations more efficiently while keeping pace with digital transformation and the future vision.',
                    'primary_card_two_title' => 'Focus on measurable impact',
                    'primary_card_two_body' => 'Our mission is to empower companies to build a smart business ecosystem that connects sales teams, customer service, and management within one flexible and customizable platform. We aim to enhance customer experience, improve operational efficiency, and support decision-making through real-time analytics and intelligent AI-driven tools, ensuring sustainable growth and long-term competitive advantage.',
                    'secondary_enabled' => true,
                    'secondary_image_url' => 'https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/whatsapp-image-2026-02-16-at-9.34.48-pm-1-crJEf.jpeg',
                    'secondary_image_alt' => 'Diverse team collaborating on CRM strategy and implementation',
                    'secondary_title' => 'Your success, our',
                    'secondary_title_accent' => 'technology',
                    'secondary_card_one_title' => 'Our vision for the future',
                    'secondary_card_one_body' => 'Our vision is to become the leading technology partner for companies in the real estate sector and other industries by providing an integrated CRM platform powered by artificial intelligence. This platform enables organizations to manage their relationships and operations more efficiently while keeping pace with digital transformation and the future vision.',
                    'secondary_card_two_title' => 'Built for scalability and growth',
                    'secondary_card_two_body' => 'This platform enables organizations to manage their relationships and operations more efficiently while keeping pace with digital transformation and the future vision. From startups to enterprise organizations, Be Souhola scales with your business.',
                ],
            ],
            [
                'type' => 'portfolio',
                'title' => 'Portfolio',
                'sort_order' => 19,
                'content' => [
                    'eyebrow' => 'Industry Solutions',
                    'title' => 'Real results across',
                    'title_accent' => 'multiple industries',
                    'description' => 'Discover how Be Souhola empowers businesses across real estate, property management, and professional services to achieve measurable growth and operational excellence.',
                    'cards' => [
                        [
                            'slug' => 'real-estate-pipeline',
                            'title' => 'Real Estate Sales Pipeline',
                            'metric' => 'Increased sales by 47%',
                            'description' => 'Complete sales pipeline management for real estate firms with automated lead tracking and deal progression.',
                            'image_url' => 'https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/tech-daily-lkyv7faumza-unsplash-2-FOBCl.jpg',
                            'image_alt' => 'Real estate CRM dashboard showing sales pipeline and property listings on a laptop',
                        ],
                        [
                            'slug' => 'property-management',
                            'title' => 'Property Management Operations',
                            'metric' => 'Manages 850+ properties',
                            'description' => 'Streamlined property management operations with tenant tracking, maintenance scheduling, and financial reporting.',
                            'image_url' => 'https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/gemini_generated_image_n6u5epn6u5epn6u5-5abrf-2-W2Hon.jpg',
                            'image_alt' => 'Property management dashboard displaying tenant information and maintenance schedules on a tablet',
                        ],
                        [
                            'slug' => 'multi-industry-tracking',
                            'title' => 'Multi-Industry Client Tracking',
                            'metric' => 'Reduced admin time by 62%',
                            'description' => 'Customizable client relationship management adapted for healthcare, consulting, and professional services sectors.',
                            'image_url' => 'https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/sumup-vsyr_mbh7q4-unsplash-2-Hxitr.jpg',
                            'image_alt' => 'Business analytics dashboard showing client tracking metrics and performance data on a smartphone',
                        ],
                    ],
                ],
            ],
            [
                'type' => 'testimonials',
                'title' => 'Testimonials',
                'sort_order' => 22,
                'content' => [
                    'title' => 'Businesses that',
                    'title_accent' => 'transformed',
                    'title_suffix' => 'with Be Souhola',
                    'testimonials' => [
                        [
                            'name' => 'Marcus Rivera',
                            'role' => 'VP of Sales, Meridian Properties',
                            'content' => 'Be Souhola transformed how we manage client relationships and increased our sales pipeline visibility by 53%. The real-time analytics help us identify opportunities we were missing before.',
                            'avatar' => 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
                        ],
                        [
                            'name' => 'Priya Sharma',
                            'role' => 'Operations Director, Skyline Realty Group',
                            'content' => 'The customizable workflows saved our team 12 hours every week. We can finally focus on building relationships instead of drowning in spreadsheets and manual data entry.',
                            'avatar' => 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
                        ],
                        [
                            'name' => 'James Chen',
                            'role' => 'CEO, Urban Development Partners',
                            'content' => 'We manage over 600 properties across three cities, and Be Souhola keeps everything organized in one place. The AI-powered insights have helped us make faster, data-driven decisions.',
                            'avatar' => 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
                        ],
                        [
                            'name' => 'Sofia Martinez',
                            'role' => 'Sales Manager, Coastal Estates',
                            'content' => 'Our conversion rate increased by 38% within the first quarter. The automated follow-ups ensure we never miss a lead, and the mobile app keeps us productive on the go.',
                            'avatar' => 'https://images.unsplash.com/photo-1580489944761-15a19d654956?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
                        ],
                        [
                            'name' => 'David Thompson',
                            'role' => 'Managing Partner, Thompson & Associates',
                            'content' => 'Be Souhola adapted perfectly to our consulting firm. The platform is flexible enough to handle our unique workflows while powerful enough to scale as we grow.',
                            'avatar' => 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
                        ],
                        [
                            'name' => 'Aisha Okonkwo',
                            'role' => 'Head of Customer Success, PropTech Innovations',
                            'content' => 'The real-time collaboration features keep our entire team aligned. We reduced our sales cycle by 22% and improved customer satisfaction scores across the board.',
                            'avatar' => 'https://images.unsplash.com/photo-1517841905240-472988babdf9?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
                        ],
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
                'type' => 'lead_leak_detector',
                'title' => 'Lead Leak Detector',
                'sort_order' => 21,
                'content' => [
                    'eyebrow' => 'Free sales audit',
                    'title' => 'Are leads slipping through your pipeline?',
                    'subtitle' => 'Answer 7 quick questions and uncover the top three sales leaks holding your team back in under 60 seconds.',
                    'items' => [
                        'First-response speed',
                        'Lead leakage points',
                        'Follow-up consistency',
                    ],
                    'button_text' => 'Start the audit',
                    'floating_button_text' => 'Test your pipeline',
                    'app_eyebrow' => 'Mobile app',
                    'app_headline' => 'Manage leads, teams, and projects from anywhere',
                    'app_description' => 'Give your sales team a fast mobile workspace to follow up leads, manage tasks, and stay updated in the field.',
                    'app_image_url' => '',
                    'app_highlights' => [
                        'Lead follow-up',
                        'Team tasks',
                        'Real estate inventory',
                        'Instant reminders',
                    ],
                    'app_title' => 'Be Souhola Mobile App',
                    'app_subtitle' => 'A polished mobile workspace for sales teams, projects, and daily follow-up.',
                    'app_items' => [
                        'Leads',
                        'Tasks',
                        'Projects',
                        'Reports',
                    ],
                    'app_button_text' => 'See the mobile app in action',
                    'app_availability_text' => 'Mobile app available for your sales team',
                    'integration_eyebrow' => 'Live integrations',
                    'integration_headline' => 'Plug every lead source into one CRM flow',
                    'integration_description' => 'Show that Meta, website forms, chat, ads, WhatsApp, and notifications all land inside one connected operating layer for your sales team.',
                    'integration_highlights' => [
                        'Unified lead intake',
                        'Live source visibility',
                        'Faster follow-up handoff',
                    ],
                    'integration_title' => 'Live Integration Badge',
                    'integration_subtitle' => 'Show that every lead source, chat, and notification flow can live inside one connected CRM engine.',
                    'integration_items' => [
                        'Meta Leads',
                        'Website Forms',
                        'Website Chat',
                        'Google Ads',
                        'WhatsApp',
                        'Email Notifications',
                    ],
                    'integration_button_text' => 'See the audit in action',
                    'result_cta_text' => 'Book a result-based demo',
                    'result_secondary_text' => 'See how Be Souhola closes these leaks',
                    'modal_title' => 'Lead Leak Detector',
                    'modal_subtitle' => 'A guided sales health check that shows where your pipeline is losing qualified leads before they turn into revenue.',
                    'modal_note' => '7 quick questions. No sensitive financial data. Instant result.',
                    'modal_start_text' => 'Start diagnosis',
                    'report_prompt' => 'Want a walkthrough tailored to your result? See how Be Souhola fixes these leaks with automation, alerts, and performance reporting.',
                    'solution_heading' => 'Your Issue -> Be Souhola Solution',
                    'estimated_loss_label' => 'Estimated revenue drag',
                    'estimated_loss_low' => 'Minor leakage pressure',
                    'estimated_loss_medium' => 'Moderate leakage pressure',
                    'estimated_loss_high' => 'High leakage pressure',
                    'risk_low_label' => 'Low',
                    'risk_medium_label' => 'Medium',
                    'risk_high_label' => 'High',
                    'leak_labels' => [
                        'speed' => 'First-contact delay',
                        'followup' => 'Follow-up process',
                        'visibility' => 'Sales visibility',
                        'handoff' => 'Lead assignment flow',
                        'qualification' => 'Lead qualification',
                    ],
                    'solution_map' => [
                        'speed' => 'Instant alerts and automatic lead routing',
                        'followup' => 'Follow-up reminders and structured cadences',
                        'visibility' => 'Live team performance dashboards',
                        'handoff' => 'Ownership rules and SLA tracking',
                        'qualification' => 'Structured intake forms and lead scoring',
                    ],
                    'questions' => [
                        [
                            'prompt' => 'How long does it usually take before your team makes the first contact with a new lead?',
                            'options' => [
                                ['label' => 'Less than 5 minutes', 'score' => 100, 'leak' => 'speed'],
                                ['label' => '5 to 30 minutes', 'score' => 82, 'leak' => 'speed'],
                                ['label' => '30 minutes to 2 hours', 'score' => 56, 'leak' => 'speed'],
                                ['label' => 'More than 2 hours', 'score' => 24, 'leak' => 'speed'],
                                ['label' => 'We do not know', 'score' => 18, 'leak' => 'visibility'],
                            ],
                        ],
                        [
                            'prompt' => 'How are new leads assigned to the sales team today?',
                            'options' => [
                                ['label' => 'Automatically and instantly', 'score' => 100, 'leak' => 'handoff'],
                                ['label' => 'Manually but with clear ownership', 'score' => 78, 'leak' => 'handoff'],
                                ['label' => 'Shared inbox or group chat', 'score' => 46, 'leak' => 'handoff'],
                                ['label' => 'Often unclear or delayed', 'score' => 20, 'leak' => 'handoff'],
                            ],
                        ],
                        [
                            'prompt' => 'What usually happens if a lead does not respond after the first outreach?',
                            'options' => [
                                ['label' => 'Automatic reminders keep follow-up consistent', 'score' => 100, 'leak' => 'followup'],
                                ['label' => 'The team follows up manually with a process', 'score' => 74, 'leak' => 'followup'],
                                ['label' => 'Follow-up depends on each rep', 'score' => 42, 'leak' => 'followup'],
                                ['label' => 'Many leads are forgotten', 'score' => 12, 'leak' => 'followup'],
                            ],
                        ],
                        [
                            'prompt' => 'How visible is team performance across the pipeline?',
                            'options' => [
                                ['label' => 'We have live dashboards by stage and owner', 'score' => 100, 'leak' => 'visibility'],
                                ['label' => 'We review reports weekly', 'score' => 76, 'leak' => 'visibility'],
                                ['label' => 'Mostly spreadsheets and manual checks', 'score' => 40, 'leak' => 'visibility'],
                                ['label' => 'Very limited visibility', 'score' => 14, 'leak' => 'visibility'],
                            ],
                        ],
                        [
                            'prompt' => 'How are leads qualified before sales spends time on them?',
                            'options' => [
                                ['label' => 'Clear qualification rules and forms', 'score' => 100, 'leak' => 'qualification'],
                                ['label' => 'Some qualification questions exist', 'score' => 70, 'leak' => 'qualification'],
                                ['label' => 'Qualification is inconsistent', 'score' => 38, 'leak' => 'qualification'],
                                ['label' => 'Almost no qualification process', 'score' => 16, 'leak' => 'qualification'],
                            ],
                        ],
                        [
                            'prompt' => 'How many channels feed leads into your pipeline?',
                            'options' => [
                                ['label' => 'All channels flow into one system', 'score' => 100, 'leak' => 'handoff'],
                                ['label' => 'Most channels are connected', 'score' => 78, 'leak' => 'handoff'],
                                ['label' => 'Some channels are disconnected', 'score' => 44, 'leak' => 'visibility'],
                                ['label' => 'Many channels are handled separately', 'score' => 18, 'leak' => 'visibility'],
                            ],
                        ],
                        [
                            'prompt' => 'When a manager asks where deals are getting stuck, how fast can the team answer?',
                            'options' => [
                                ['label' => 'Immediately with live pipeline data', 'score' => 100, 'leak' => 'visibility'],
                                ['label' => 'Within the same day', 'score' => 74, 'leak' => 'visibility'],
                                ['label' => 'It takes manual digging', 'score' => 36, 'leak' => 'visibility'],
                                ['label' => 'We usually cannot answer clearly', 'score' => 10, 'leak' => 'visibility'],
                            ],
                        ],
                    ],
                ],
            ],
            [
                'type' => 'stats',
                'title' => 'Stats',
                'sort_order' => 28,
                'content' => [
                    'title' => 'Numbers that',
                    'title_accent' => 'speak for themselves',
                    'items' => [
                        ['number' => '12,000+', 'label' => 'Active Users', 'description' => 'Businesses trust Be Souhola'],
                        ['number' => '50+', 'label' => 'Industries/Businesses', 'description' => 'Across real estate and enterprise sectors'],
                        ['number' => '99.9%', 'label' => 'Uptime', 'description' => 'Reliable performance you can count on'],
                        ['number' => '24/7', 'label' => 'Real-time Processing', 'description' => 'Instant data synchronization'],
                    ],
                ],
            ],
            [
                'type' => 'faq',
                'title' => 'FAQ',
                'sort_order' => 29,
                'content' => [
                    'eyebrow' => 'Common questions',
                    'title' => 'Everything you need',
                    'title_accent' => 'to know',
                    'items' => [
                        [
                            'question' => 'How long does it take to set up Be Souhola?',
                            'answer' => 'Most teams are fully onboarded within 2-3 business days with guided setup support included.',
                        ],
                        [
                            'question' => 'Can I import my existing leads from Excel or another CRM?',
                            'answer' => 'Yes. Be Souhola supports bulk lead import via Excel/CSV, and our team can help map your existing data fields.',
                        ],
                        [
                            'question' => 'Does Be Souhola work for non-real-estate businesses?',
                            'answer' => 'Absolutely. The platform is customizable for sales-driven businesses across consulting, healthcare, education, and more.',
                        ],
                        [
                            'question' => 'Is WhatsApp integration included in all plans?',
                            'answer' => 'WhatsApp support depends on your setup and plan configuration, and our team can help you choose the right rollout.',
                        ],
                        [
                            'question' => 'Can I control which features my team sees?',
                            'answer' => 'Yes. Role-based access control helps define exactly what each user can see and do inside the platform.',
                        ],
                    ],
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
                    'button_text' => 'Start Now',
                    'highlights' => [
                        'Boost conversion rates by up to 38%',
                        'Go live in days, not months',
                        'Dedicated onboarding support',
                    ],
                ],
            ],
        ];
    }

    public function ensureForTenant(int $tenantId): void
    {
        if (!WebsiteSetting::withoutGlobalScopes()->where('tenant_id', $tenantId)->exists()) {
            WebsiteSetting::withoutGlobalScopes()->create([
                'tenant_id' => $tenantId,
                'company_name' => 'Be Souhola',
                'logo_url' => null,
                'phone' => '+1 (555) 234-5678',
                'email' => 'sales@besouhola.com',
                'whatsapp' => null,
                'address' => '200 Tech Boulevard, Suite 400, Innovation City, CA 94102',
                'website_url' => 'https://besouhola.com',
                'social_links' => [
                    'facebook' => 'https://www.facebook.com/profile.php?id=61587661674565',
                    'whatsapp' => null,
                ],
                'contact_page_content' => [
                    'headline' => "Let's",
                    'headline_accent' => 'connect',
                    'description' => 'Schedule a demo, get support, or learn how Be Souhola can transform your business operations.',
                    'sales_label' => 'Sales & Demos',
                    'phone_label' => 'Phone',
                    'whatsapp_label' => 'WhatsApp',
                    'address_label' => 'Our Office',
                    'website_label' => 'Website',
                    'website_text' => 'besouhola.com',
                    'website_url' => 'https://besouhola.com',
                    'social_label' => 'Facebook',
                    'form_title' => 'Request a demo',
                    'form_subtitle' => 'Complete the form below and our team will get back to you shortly.',
                ],
                'nav_links' => [
                    ['name' => 'Services', 'href' => '/#services'],
                    ['name' => 'About', 'href' => '/#about'],
                    ['name' => 'Portfolio', 'href' => '/#portfolio'],
                    ['name' => 'Testimonials', 'href' => '/#testimonials'],
                    ['name' => 'Careers', 'href' => '/career'],
                ],
                'nav_cta_text' => 'Book Free Demo',
                'nav_cta_href' => '/contact',
                'footer_sections' => [
                    [
                        'title' => 'Company',
                        'links' => [
                            ['name' => 'Contact', 'href' => '/contact', 'external' => false],
                            ['name' => 'Careers', 'href' => '/career', 'external' => false],
                            ['name' => 'Privacy Policy', 'href' => '/privacy', 'external' => false],
                            ['name' => 'Terms & Conditions', 'href' => '/terms', 'external' => false],
                            ['name' => 'Data Processing & Security', 'href' => '/data-processing-security', 'external' => false],
                        ],
                    ],
                    [
                        'title' => 'Quick Links',
                        'links' => [
                            ['name' => 'Visit Main Site', 'href' => '{main_website}', 'external' => true],
                        ],
                    ],
                ],
                'footer_quick_links' => [
                    ['name' => 'Services', 'href' => '/#services'],
                    ['name' => 'About', 'href' => '/#about'],
                    ['name' => 'Portfolio', 'href' => '/#portfolio'],
                    ['name' => 'Testimonials', 'href' => '/#testimonials'],
                ],
                'footer_tagline' => 'Built for better follow-up, clearer pipelines, and smarter growth.',
                'footer_description' => 'Be Souhola is a CRM platform designed for real estate teams and ambitious businesses that need clearer pipelines, faster follow-up, and better visibility across operations.',
                'whatsapp_float' => [
                    'enabled' => false,
                    'message' => "Hi, I'd like to learn more about Be Souhola CRM.",
                    'tooltip' => 'Chat with us',
                ],
                'pages_seo' => [
                    'home' => [
                        'title' => 'Be Souhola - CRM Platform for Real Estate & Business',
                        'description' => 'Be Souhola is a leading CRM platform designed for real estate professionals and businesses.',
                        'canonical' => 'https://besouhola.com',
                    ],
                    'contact' => [
                        'title' => 'Contact Be Souhola - Schedule Your Demo',
                        'description' => 'Get in touch with Be Souhola to schedule a demo, request support, or learn how our CRM platform can transform your business operations.',
                        'canonical' => 'https://besouhola.com/contact',
                    ],
                    'career' => [
                        'title' => 'Careers at Be Souhola CRM',
                        'description' => 'Explore career opportunities at Be Souhola CRM and help build a smarter growth platform for ambitious teams.',
                        'canonical' => 'https://besouhola.com/career',
                    ],
                    'privacy' => [
                        'title' => 'Privacy Policy | Be Souhola CRM',
                        'description' => 'This Privacy Policy governs how Be Souhola CRM collects, uses, processes, stores, and protects personal and business-related information.',
                        'canonical' => 'https://besouhola.com/privacy',
                    ],
                    'terms' => [
                        'title' => 'Terms & Conditions | Be Souhola CRM',
                        'description' => 'These Terms & Conditions govern the use of the Be Souhola CRM mobile application, web application, and related services provided by Be Souhola.',
                        'canonical' => 'https://besouhola.com/terms',
                    ],
                    'data_processing_security' => [
                        'title' => 'Data Processing & Security Statement | Be Souhola CRM',
                        'description' => 'This statement describes the general principles applied by Be Souhola CRM in connection with data processing, confidentiality, hosting, and security.',
                        'canonical' => 'https://besouhola.com/data-processing-security',
                    ],
                ],
                'primary_color' => '#9372FF',
                'seo_title' => 'Be Souhola - CRM Platform for Real Estate & Business',
                'seo_description' => 'Be Souhola is a leading CRM platform designed for real estate professionals and businesses.',
                'is_published' => true,
            ]);
        }

        foreach ($this->homepageSections() as $section) {
            $exists = WebsiteHomepageSection::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->where('type', $section['type'])
                ->exists();

            if (!$exists) {
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
