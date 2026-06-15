import React from 'react';
import { Helmet } from 'react-helmet';

const siteUrl = 'https://besouhola.com';

const LegalPageLayout = ({
  title,
  accent,
  description,
  effectiveDate,
  sections = [],
  canonicalPath,
}) => {
  return (
    <div className="bg-[#0C0D0D] text-white">
      <Helmet>
        <title>{title} | Be Souhola CRM</title>
        <meta name="description" content={description} />
        {canonicalPath ? <link rel="canonical" href={`${siteUrl}${canonicalPath}`} /> : null}
        <meta property="og:title" content={`${title} | Be Souhola CRM`} />
        <meta property="og:description" content={description} />
        {canonicalPath ? <meta property="og:url" content={`${siteUrl}${canonicalPath}`} /> : null}
        <meta property="og:type" content="article" />
        <meta name="twitter:title" content={`${title} | Be Souhola CRM`} />
        <meta name="twitter:description" content={description} />
      </Helmet>

      <section className="relative overflow-hidden py-24 sm:py-32">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(147,114,255,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(55,121,255,0.16),transparent_28%)]" />
        <div className="relative container mx-auto px-6">
          <div className="max-w-4xl">
            <p className="mb-4 text-sm uppercase tracking-[0.35em] text-gray-400">
              Legal
            </p>
            <h1 className="text-5xl font-bold leading-tight md:text-7xl">
              {title.split(' ').slice(0, -1).join(' ')}{' '}
              <span className="text-accent-purple">{accent}</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-gray-300">
              Effective date: {effectiveDate}
            </p>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-gray-400">
              {description}
            </p>
          </div>
        </div>
      </section>

      <section className="pb-24 sm:pb-32">
        <div className="container mx-auto px-6">
          <div className="mx-auto grid max-w-4xl gap-6">
            {sections.map((section) => (
              <article
                key={section.title}
                className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-sm transition-transform duration-300 hover:-translate-y-0.5 sm:p-8"
              >
                <h2 className="text-2xl font-semibold text-white">{section.title}</h2>

                {section.body?.length ? (
                  <div className="mt-4 space-y-4 leading-relaxed text-gray-300">
                    {section.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                ) : null}

                {section.list?.length ? (
                  <ul className="mt-4 space-y-3 leading-relaxed text-gray-300">
                    {section.list.map((item) => (
                      <li key={item} className="flex gap-3">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-purple" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default LegalPageLayout;
