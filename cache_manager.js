#!/usr/bin/env node

/**
 * Cache Manager for TikTok CCT Scraper
 * Manages caching of scraped data to avoid re-scraping unchanged content
 */

const fs = require('fs').promises;
const path = require('path');

class CacheManager {
  constructor(cacheDir = 'data/cache') {
    this.cacheDir = cacheDir;
    this.cacheMaxAge = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
  }

  async ensureCacheDir() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {}
  }

  /**
   * Generate cache key for a country/tab combination
   */
  getCacheKey(country, tab) {
    return `${country}_${tab}.json`;
  }

  /**
   * Get cache file path
   */
  getCachePath(country, tab) {
    return path.join(this.cacheDir, this.getCacheKey(country, tab));
  }

  /**
   * Check if cache exists and is fresh
   */
  async isCacheFresh(country, tab) {
    try {
      const cachePath = this.getCachePath(country, tab);
      const stats = await fs.stat(cachePath);
      const age = Date.now() - stats.mtimeMs;

      if (age < this.cacheMaxAge) {
        const ageMinutes = Math.round(age / 60000);
        return { fresh: true, age: ageMinutes };
      }

      return { fresh: false, age: Math.round(age / 60000) };
    } catch (error) {
      return { fresh: false, age: null };
    }
  }

  /**
   * Load cached data
   */
  async loadCache(country, tab) {
    try {
      const cachePath = this.getCachePath(country, tab);
      const data = await fs.readFile(cachePath, 'utf-8');
      const cached = JSON.parse(data);

      return {
        success: true,
        data: cached.songs || [],
        cachedAt: cached.cached_at,
        songCount: cached.total_songs
      };
    } catch (error) {
      return { success: false, data: [], error: error.message };
    }
  }

  /**
   * Save data to cache
   */
  async saveCache(country, tab, songs) {
    await this.ensureCacheDir();

    const cachePath = this.getCachePath(country, tab);
    const cacheData = {
      country,
      tab,
      cached_at: new Date().toISOString(),
      total_songs: songs.length,
      songs
    };

    await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8');

    return {
      success: true,
      path: cachePath,
      songCount: songs.length
    };
  }

  /**
   * Get cache statistics for all cached countries/tabs
   */
  async getCacheStats() {
    await this.ensureCacheDir();

    const stats = [];

    try {
      const files = await fs.readdir(this.cacheDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.cacheDir, file);
          const fileStats = await fs.stat(filePath);
          const age = Date.now() - fileStats.mtimeMs;
          const ageHours = Math.round(age / 3600000);
          const fresh = age < this.cacheMaxAge;

          // Parse filename
          const [country, tab] = file.replace('.json', '').split('_');

          stats.push({
            country,
            tab,
            fresh,
            ageHours,
            ageMinutes: Math.round(age / 60000),
            size: fileStats.size,
            path: filePath
          });
        }
      }
    } catch (error) {
      // Cache directory might be empty
    }

    return stats;
  }

  /**
   * Clear old cache entries
   */
  async clearStaleCache() {
    const stats = await this.getCacheStats();
    let cleared = 0;

    for (const stat of stats) {
      if (!stat.fresh) {
        await fs.unlink(stat.path);
        cleared++;
      }
    }

    return { cleared, remaining: stats.length - cleared };
  }

  /**
   * Clear all cache
   */
  async clearAllCache() {
    try {
      await fs.rm(this.cacheDir, { recursive: true, force: true });
      await this.ensureCacheDir();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = CacheManager;
