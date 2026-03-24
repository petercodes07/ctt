#!/usr/bin/env node

/**
 * Scan History Manager
 * Stores and manages historical scan data for comparison and analysis
 */

const fs = require('fs').promises;
const path = require('path');

class ScanHistory {
  constructor(storageDir = 'data/scan_history') {
    this.storageDir = storageDir;
    this.indexFile = path.join(storageDir, 'index.json');
  }

  /**
   * Ensure storage directory exists
   */
  async ensureStorageDir() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {}
  }

  /**
   * Load the scan index
   */
  async loadIndex() {
    try {
      const data = await fs.readFile(this.indexFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      // Index doesn't exist yet
      return { scans: [] };
    }
  }

  /**
   * Save the scan index
   */
  async saveIndex(index) {
    await this.ensureStorageDir();
    await fs.writeFile(this.indexFile, JSON.stringify(index, null, 2), 'utf-8');
  }

  /**
   * Store a scan result
   * @param {Object} options - Scan metadata
   * @param {Array} popularSongs - Popular tab songs
   * @param {Array} breakoutSongs - Breakout tab songs (optional)
   * @returns {Object} Stored scan metadata
   */
  async storeScan(options, popularSongs, breakoutSongs = []) {
    const {
      country = 'US',
      maxSongs = 50,
      newToTop100 = false,
      newFromHistory = false,
      newFromHistoryDays = 7,
      approvedForBusiness = false,
      searchQuery = null
    } = options;

    await this.ensureStorageDir();

    // Generate timestamp and scan ID
    const timestamp = new Date().toISOString();
    const scanId = timestamp.replace(/[:.]/g, '-').replace('T', '_').split('Z')[0];

    // Create scan metadata
    const scanMeta = {
      scanId,
      timestamp,
      country,
      maxSongs,
      filters: {
        newToTop100,
        newFromHistory,
        newFromHistoryDays,
        approvedForBusiness,
        searchQuery
      },
      stats: {
        popularCount: popularSongs.length,
        breakoutCount: breakoutSongs.length,
        totalSongs: popularSongs.length + breakoutSongs.length
      }
    };

    // Save scan data files
    const scanDir = path.join(this.storageDir, scanId);
    await fs.mkdir(scanDir, { recursive: true });

    // Save popular songs
    if (popularSongs.length > 0) {
      const popularFile = path.join(scanDir, 'popular.json');
      await fs.writeFile(popularFile, JSON.stringify({
        ...scanMeta,
        tab: 'popular',
        songs: popularSongs
      }, null, 2), 'utf-8');
    }

    // Save breakout songs
    if (breakoutSongs.length > 0) {
      const breakoutFile = path.join(scanDir, 'breakout.json');
      await fs.writeFile(breakoutFile, JSON.stringify({
        ...scanMeta,
        tab: 'breakout',
        songs: breakoutSongs
      }, null, 2), 'utf-8');
    }

    // Save combined metadata
    const metaFile = path.join(scanDir, 'metadata.json');
    await fs.writeFile(metaFile, JSON.stringify(scanMeta, null, 2), 'utf-8');

    // Update index
    const index = await this.loadIndex();
    index.scans.unshift(scanMeta); // Add to beginning (most recent first)

    // Keep only last 100 scans in index
    if (index.scans.length > 100) {
      index.scans = index.scans.slice(0, 100);
    }

    await this.saveIndex(index);

    return {
      success: true,
      scanId,
      timestamp,
      path: scanDir,
      ...scanMeta.stats
    };
  }

  /**
   * Get the most recent scan
   * @param {Object} filters - Optional filters (country, tab)
   */
  async getLatestScan(filters = {}) {
    const index = await this.loadIndex();

    if (index.scans.length === 0) {
      return null;
    }

    // Filter scans if needed
    let scans = index.scans;
    if (filters.country) {
      scans = scans.filter(s => s.country === filters.country);
    }

    if (scans.length === 0) {
      return null;
    }

    const latestScan = scans[0];
    return await this.loadScan(latestScan.scanId);
  }

  /**
   * Load a specific scan by ID
   */
  async loadScan(scanId) {
    const scanDir = path.join(this.storageDir, scanId);

    try {
      const metaFile = path.join(scanDir, 'metadata.json');
      const metadata = JSON.parse(await fs.readFile(metaFile, 'utf-8'));

      // Load popular songs
      let popularSongs = [];
      try {
        const popularFile = path.join(scanDir, 'popular.json');
        const popularData = JSON.parse(await fs.readFile(popularFile, 'utf-8'));
        popularSongs = popularData.songs || [];
      } catch (e) {}

      // Load breakout songs
      let breakoutSongs = [];
      try {
        const breakoutFile = path.join(scanDir, 'breakout.json');
        const breakoutData = JSON.parse(await fs.readFile(breakoutFile, 'utf-8'));
        breakoutSongs = breakoutData.songs || [];
      } catch (e) {}

      return {
        ...metadata,
        popular: popularSongs,
        breakout: breakoutSongs
      };
    } catch (error) {
      throw new Error(`Failed to load scan ${scanId}: ${error.message}`);
    }
  }

  /**
   * Get all scans for a specific country
   */
  async getScansByCountry(country) {
    const index = await this.loadIndex();
    return index.scans.filter(s => s.country === country);
  }

  /**
   * Get scans within a date range
   */
  async getScansInRange(startDate, endDate) {
    const index = await this.loadIndex();
    const start = new Date(startDate);
    const end = new Date(endDate);

    return index.scans.filter(s => {
      const scanDate = new Date(s.timestamp);
      return scanDate >= start && scanDate <= end;
    });
  }

  /**
   * Get song URLs seen for a country/tab within the previous N days.
   * Excludes today's scans so "new" means unseen before today.
   */
  async getSeenSongUrls(country, tab = 'popular', days = 7, referenceDate = new Date()) {
    const index = await this.loadIndex();
    const normalizedTab = tab || 'popular';
    const startOfToday = new Date(referenceDate);
    startOfToday.setHours(0, 0, 0, 0);

    const windowStart = new Date(startOfToday);
    windowStart.setDate(windowStart.getDate() - days);

    const matchingScans = index.scans.filter(scan => {
      if (scan.country !== country) {
        return false;
      }

      const scanDate = new Date(scan.timestamp);
      return scanDate >= windowStart && scanDate < startOfToday;
    });

    const seenUrls = new Set();

    for (const scan of matchingScans) {
      const scanDir = path.join(this.storageDir, scan.scanId);
      const scanFile = path.join(scanDir, `${normalizedTab}.json`);

      try {
        const scanData = JSON.parse(await fs.readFile(scanFile, 'utf-8'));
        for (const song of scanData.songs || []) {
          if (song.url) {
            seenUrls.add(song.url);
          }
        }
      } catch (error) {}
    }

    return seenUrls;
  }

  /**
   * Get scan statistics
   */
  async getStats() {
    const index = await this.loadIndex();

    if (index.scans.length === 0) {
      return {
        totalScans: 0,
        countries: [],
        dateRange: null
      };
    }

    const countries = [...new Set(index.scans.map(s => s.country))];
    const dates = index.scans.map(s => new Date(s.timestamp));

    return {
      totalScans: index.scans.length,
      countries: countries,
      countryCounts: countries.map(country => ({
        country,
        count: index.scans.filter(s => s.country === country).length
      })),
      dateRange: {
        oldest: new Date(Math.min(...dates)).toISOString(),
        newest: new Date(Math.max(...dates)).toISOString()
      },
      recentScans: index.scans.slice(0, 5)
    };
  }

  /**
   * Delete old scans (older than specified days)
   */
  async cleanupOldScans(daysToKeep = 30) {
    const index = await this.loadIndex();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const scansToKeep = [];
    const scansToDelete = [];

    for (const scan of index.scans) {
      const scanDate = new Date(scan.timestamp);
      if (scanDate >= cutoffDate) {
        scansToKeep.push(scan);
      } else {
        scansToDelete.push(scan);
      }
    }

    // Delete old scan directories
    for (const scan of scansToDelete) {
      const scanDir = path.join(this.storageDir, scan.scanId);
      try {
        await fs.rm(scanDir, { recursive: true, force: true });
      } catch (e) {}
    }

    // Update index
    index.scans = scansToKeep;
    await this.saveIndex(index);

    return {
      deleted: scansToDelete.length,
      remaining: scansToKeep.length
    };
  }
}

module.exports = ScanHistory;

// CLI usage
if (require.main === module) {
  const scanHistory = new ScanHistory();

  const command = process.argv[2];

  async function main() {
    switch (command) {
      case 'stats':
        const stats = await scanHistory.getStats();
        console.log('\n📊 Scan History Statistics\n');
        console.log(`Total scans: ${stats.totalScans}`);
        console.log(`Countries tracked: ${stats.countries.join(', ')}`);
        if (stats.dateRange) {
          console.log(`Date range: ${stats.dateRange.oldest} to ${stats.dateRange.newest}`);
        }
        console.log('\nRecent scans:');
        stats.recentScans.forEach(scan => {
          console.log(`  - ${scan.timestamp} | ${scan.country} | ${scan.stats.totalSongs} songs`);
        });
        break;

      case 'cleanup':
        const days = parseInt(process.argv[3]) || 30;
        const result = await scanHistory.cleanupOldScans(days);
        console.log(`\n🧹 Cleanup complete: Deleted ${result.deleted} scans, kept ${result.remaining}\n`);
        break;

      case 'latest':
        const country = process.argv[3] || 'US';
        const latest = await scanHistory.getLatestScan({ country });
        if (latest) {
          console.log(`\n📅 Latest scan for ${country}:`);
          console.log(`Timestamp: ${latest.timestamp}`);
          console.log(`Popular songs: ${latest.popular.length}`);
          console.log(`Breakout songs: ${latest.breakout.length}`);
        } else {
          console.log(`\n❌ No scans found for ${country}\n`);
        }
        break;

      default:
        console.log(`
Usage: node scan_history.js <command>

Commands:
  stats              Show scan history statistics
  cleanup [days]     Delete scans older than N days (default: 30)
  latest [country]   Show latest scan for a country (default: US)
        `);
    }
  }

  main().catch(console.error);
}
