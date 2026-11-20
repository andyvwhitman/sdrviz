import { api } from "$lib/api/client";
import type { FeedConfig, FeedHealth, Frequency, GeoRoute } from "./types";

/**
 * The configuration resources this screen edits over REST: frequencies (for a feed's hears list) and the route
 * geometry for the coverage thumbnail. Live state (health, coverage, key-ups) stays in the live store.
 */
class Catalogue {
  frequencies = $state<Frequency[]>([]);
  routes = $state<GeoRoute[]>([]);
  loaded = $state(false);

  async load(): Promise<void> {
    this.frequencies = (await api.frequencies.list()) as unknown as Frequency[];
    this.loaded = true;
  }

  private routesRequest: Promise<void> | null = null;

  /**
   * Route geometry for the coverage thumbnail. It loads on its own so a slow or failed catalogue
   * request cannot leave the thumbnail empty; a failure is forgotten so the next call retries.
   */
  loadRoutes(): Promise<void> {
    this.routesRequest ??= (async () => {
      const geo = (await api.geo.routes()) as { routes?: GeoRoute[] };
      this.routes = geo.routes ?? [];
    })().catch(() => {
      this.routesRequest = null;
    });
    return this.routesRequest;
  }

  // -- feeds ---------------------------------------------------------------------------------

  feedConfig = async (id: string): Promise<FeedConfig> => pickConfig((await api.feeds.get(id)) as unknown as FeedConfig);
  feedHealth = (id: string, minutes = 15): Promise<FeedHealth> => api.feeds.health(id, minutes) as unknown as Promise<FeedHealth>;

  /** Enable or disable a feed: PUT takes the whole configuration. */
  async setFeedEnabled(id: string, enabled: boolean): Promise<void> {
    await api.feeds.update(id, { ...(await this.feedConfig(id)), enabled });
  }

  async saveFeed(feed: FeedConfig, isNew: boolean): Promise<void> {
    await (isNew ? api.feeds.create({ ...feed }) : api.feeds.update(feed.id, { ...feed }));
  }

  deleteFeed = (id: string): Promise<void> => api.feeds.remove(id);
  ackFeed = (id: string): Promise<unknown> => api.feeds.ack(id);
}

const CONFIG_KEYS = ["id", "name", "short", "site", "lat", "lon", "coverage_radius_km", "hears", "driver", "host", "port", "center_mhz", "sample_rate_msps", "gain_db", "ppm", "noise_floor_dbfs", "enabled", "sim"] as const;

/** A feed view carries live health next to its configuration; keep only the configuration. */
export const pickConfig = (view: FeedConfig): FeedConfig =>
  Object.fromEntries(CONFIG_KEYS.map((key) => [key, view[key]])) as unknown as FeedConfig;

export const catalogue = new Catalogue();
