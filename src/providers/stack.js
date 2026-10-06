import { CostManager } from '../cost/cost-manager.js';
import { CircuitBreaker } from '../cost/circuit-breaker.js';
import { UsageRepo } from '../cost/usage-repo.js';
import { ApifyProvider } from './apify-provider.js';
import { RapidApiProvider } from './rapidapi-provider.js';
import { BrightDataProvider } from './brightdata-provider.js';
import { LobstrProvider } from './lobstr-provider.js';
import { ProviderRouter } from './router.js';
import { FEATURE } from './provider-interface.js';

/**
 * Assembles the cost/provider stack.
 *
 * One factory so the poller, the server and the CLI all build an identical
 * stack, and so a test can swap the Apify transport with a single `runner`
 * override.
 *
 * Registration order does not decide precedence — the router sorts candidates by
 * tier (free before low_cost before premium) and then by health score, and skips
 * any provider whose quota is spent. Adding a provider here is all that is
 * needed for it to join the fallback chain.
 *
 * A provider with no credentials reports `enabled: false` and is simply never
 * chosen, so all four can be registered unconditionally.
 */
export function createStack(store, config, { runner = null, storiesFetcher = null, providers = null, logger = console } = {}) {
  const repo = new UsageRepo(store);
  const costManager = new CostManager(store, config, { repo });
  const breaker = new CircuitBreaker(store, {
    repo,
    failureThreshold: config.circuitFailureThreshold ?? 3,
    cooldownMs: (config.circuitCooldownMinutes ?? 15) * 60 * 1000,
  });

  const apifyOpts = {};
  if (runner) apifyOpts.runner = runner;
  if (storiesFetcher) apifyOpts.storiesFetcher = storiesFetcher;

  const rapidApiKey = config.rapidapi?.key;
  const rapidProviders = rapidApiKey ? [
    {
      name: 'rapidapi-moadnaciri02',
      key: rapidApiKey,
      host: 'instagram-profile-data-scraper.p.rapidapi.com',
      profilePath: '/instagram/profile',
      usernameParam: 'username',
      hdAvatarField: 'profile_pic_url_hd',
      storiesPath: null,
      highlightsPath: null
    },
    {
      name: 'rapidapi-api14',
      key: rapidApiKey,
      host: 'instagram-scraper-api14.p.rapidapi.com',
      profilePath: '/v1/info',
      usernameParam: 'username_or_id_or_url',
      hdAvatarField: 'profilePicUrlHD'
    },
    {
      name: 'rapidapi-cheapest',
      key: rapidApiKey,
      host: 'instagram-cheapest.p.rapidapi.com',
      profilePath: '/api/v1/instagram/user',
      usernameParam: 'username',
      hdAvatarField: 'profile_pic_url_hd',
      storiesPath: null,
      highlightsPath: null
    },
    {
      name: 'rapidapi-jotucker',
      key: rapidApiKey,
      host: 'instagram-scraper2.p.rapidapi.com',
      profilePath: '/user_info',
      usernameParam: 'user_id',
      hdAvatarField: 'profile_pic_url_hd',
      storiesPath: null,
      highlightsPath: null
    },
    {
      name: 'rapidapi-20251',
      key: rapidApiKey,
      host: 'instagram-scraper-20251.p.rapidapi.com',
      profilePath: '/userinfo/',
      usernameParam: 'username_or_id',
      hdAvatarField: 'profile_pic_url_hd',
      storiesPath: null,
      highlightsPath: null
    }
  ].map(r => new RapidApiProvider({ ...config, rapidapi: { ...config.rapidapi, ...r } })) : [new RapidApiProvider(config)];

  const apifyProviders = [];
  if (config.apifyToken || !config.storiesToken) {
    apifyProviders.push(new ApifyProvider(config, {
      name: 'apify',
      features: [FEATURE.PROFILE, ...(!config.storiesToken && config.storiesActor ? [FEATURE.STORIES] : [])],
      enabled: !!config.apifyToken,
      ...apifyOpts
    }));
  }
  if (config.storiesToken && config.storiesActor) {
    apifyProviders.push(new ApifyProvider(config, {
      name: 'apify-stories',
      features: [FEATURE.STORIES],
      enabled: true,
      ...apifyOpts
    }));
  }

  const list = providers || [
    ...rapidProviders,
    ...apifyProviders,
    new BrightDataProvider(config),
    new LobstrProvider(config),
  ];
  const router = new ProviderRouter({ providers: list, costManager, breaker, logger });

  return { repo, costManager, breaker, router, providers: list };
}
