import React from 'react';
import { motion } from 'framer-motion';
import { useWebsiteContent } from '@/context/WebsiteContentContext';
import { normalizeWebsiteAssetUrl } from '@/lib/websiteAssets';

const getClientMark = (name) => {
  const normalized = String(name || '').trim();
  if (!normalized) return 'BS';

  const words = normalized.split(/\s+/).filter(Boolean);
  if (/^[\u0600-\u06FF]/.test(normalized)) {
    return normalized.slice(0, 2);
  }

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
};

const ClientLogo = ({ client }) => {
  const [hasImageError, setHasImageError] = React.useState(false);
  const logoUrl = normalizeWebsiteAssetUrl(client.logo_url);

  if (!logoUrl || hasImageError) {
    return (
      <div className="relative z-10 flex w-full flex-col items-center justify-center gap-2 text-center transition duration-300 group-hover:scale-[1.04]">
        <span className="flex h-16 w-16 items-center justify-center rounded-full border border-accent-purple/35 bg-accent-purple/10 text-xl font-bold text-white shadow-[0_0_28px_rgba(147,114,255,0.18)] sm:h-20 sm:w-20 sm:text-2xl">
          {getClientMark(client.name)}
        </span>
        <span className="text-sm font-semibold leading-snug text-gray-200 transition group-hover:text-white sm:text-base">
          {client.name}
        </span>
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={`${client.name || 'Client'} logo`}
      className="relative z-10 max-h-[52px] max-w-[58%] object-contain transition duration-500 ease-out group-hover:-translate-y-1 group-hover:scale-[1.08] group-hover:drop-shadow-[0_0_18px_rgba(147,114,255,0.35)] sm:max-h-[64px] sm:max-w-[56%] lg:max-h-[72px] lg:max-w-[52%]"
      loading="lazy"
      onError={() => setHasImageError(true)}
    />
  );
};

const normalizeTrustedClientsCopy = (content = {}) => ({
  ...content,
  highlight_text:
    content.highlight_text === '8+ trusted partners'
      ? '8+ brands'
      : content.highlight_text,
  headline_suffix:
    content.headline_suffix === 'build with Be Souhola'
      ? 'trust Be Souhola'
      : content.headline_suffix,
});

const TrustedClientsHeadline = ({ trustedClients }) => {
  const highlightText = trustedClients?.highlight_text || '8+ brands';
  const suffix = trustedClients?.headline_suffix || 'trust Be Souhola';
  const brand = 'Be Souhola';
  const [beforeBrand, afterBrand = ''] = suffix.includes(brand)
    ? suffix.split(brand)
    : [`${suffix} `, ''];

  return (
    <h3 className="text-3xl font-bold leading-tight text-white md:text-4xl">
      <span className="bg-gradient-to-r from-[#A78BFA] to-accent-purple bg-clip-text text-transparent">
        {highlightText}
      </span>{' '}
      {beforeBrand}
      <span className="bg-gradient-to-r from-accent-purple to-[#C4B5FD] bg-clip-text text-transparent">
        {brand}
      </span>
      {afterBrand}
    </h3>
  );
};

const TrustedClients = () => {
  const { trustedClients: rawTrustedClients } = useWebsiteContent();
  const trustedClients = normalizeTrustedClientsCopy(rawTrustedClients);
  const clients = Array.isArray(trustedClients.clients)
    ? trustedClients.clients
        .map((client) => {
          if (typeof client === 'string') {
            return { name: client, logo_url: '' };
          }

          return {
            name: client?.name || '',
            logo_url: client?.logo_url || client?.logo || '',
          };
        })
        .filter((client) => client.name || client.logo_url)
    : [];
  const carouselClients = clients.length > 0 ? [...clients, ...clients] : [];

  return (
    <section className="relative overflow-hidden border-y border-white/10 bg-[#080910] py-16 sm:py-20">
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(147,114,255,0.13),transparent_36%),radial-gradient(circle_at_52%_100%,rgba(59,130,246,0.08),transparent_36%)]" />
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 mb-9 max-w-3xl text-left sm:mb-11"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-gray-400 sm:text-sm">
            {trustedClients?.eyebrow || 'Trusted by growing brands'}
          </p>
          <TrustedClientsHeadline trustedClients={trustedClients} />
          <span className="mt-5 flex h-px w-32 items-center justify-center bg-gradient-to-r from-accent-purple/75 via-accent-purple/45 to-transparent shadow-[0_0_20px_rgba(147,114,255,0.75)]">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-purple shadow-[0_0_18px_rgba(147,114,255,0.95)]" />
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.55 }}
          className="trusted-clients-carousel relative z-10 mx-auto max-w-7xl overflow-hidden rounded-lg bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_26px_80px_rgba(0,0,0,0.22)]"
        >
          <span className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
          <span className="pointer-events-none absolute inset-x-14 bottom-0 h-px bg-gradient-to-r from-transparent via-accent-purple/16 to-transparent" />
          <div className="client-logo-carousel-track flex w-max">
            {carouselClients.map((client, index) => (
              <div
                key={`${client.name || 'client'}-${index}`}
                aria-hidden={index >= clients.length}
                className="group relative flex h-[112px] w-[190px] shrink-0 items-center justify-center overflow-hidden border-l border-white/[0.055] px-5 transition duration-500 ease-out hover:-translate-y-1 hover:bg-white/[0.04] sm:h-[132px] sm:w-[235px] lg:h-[144px] lg:w-[280px]"
              >
                <span className="pointer-events-none absolute inset-x-8 top-1/2 h-12 -translate-y-1/2 rounded-full bg-accent-purple/0 blur-2xl transition duration-300 group-hover:bg-accent-purple/12" />
                <span className="pointer-events-none absolute inset-y-6 left-0 w-px bg-gradient-to-b from-transparent via-accent-purple/0 to-transparent transition duration-500 group-hover:via-accent-purple/45" />
                <span className="pointer-events-none absolute -left-16 top-0 h-full w-12 skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/14 to-transparent opacity-0 blur-[1px] transition-all duration-700 group-hover:left-[115%] group-hover:opacity-100" />
                <ClientLogo client={client} />
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default TrustedClients;
