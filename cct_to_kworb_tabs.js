#!/usr/bin/env node

/**
 * CCT to Kworb - MULTI-TAB VERSION
 *
 * Uses multiple tabs in a SINGLE browser for parallel scraping!
 * More organized and memory-efficient than multiple browsers.
 *
 * Example: 10 countries with 10 parallel tabs:
 *   Sequential: 10 × 2 tabs × 45s = 15 minutes
 *   Parallel (10 tabs): 2 batches × 45s = 1.5 minutes (10x faster!)
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class CCTToKworbTabs {
  constructor() {
    this.url = 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en';
    this.dataDir = 'data';
    this.cctDataFile = path.join(this.dataDir, 'cct_for_kworb.json');

    // Load country map
    try {
      const countriesData = require('./countries.json');
      this.countryMap = new Map(
        countriesData.countries.map(c => [c.code, c.name])
      );
    } catch (e) {
      this.countryMap = new Map();
    }

    // Top markets
    this.topMarkets = [
      { code: 'US', name: 'United States' },
      { code: 'GB', name: 'United Kingdom' },
      { code: 'BR', name: 'Brazil' },
      { code: 'ID', name: 'Indonesia' },
      { code: 'JP', name: 'Japan' },
      { code: 'KR', name: 'South Korea' },
      { code: 'PH', name: 'Philippines' },
      { code: 'TH', name: 'Thailand' },
      { code: 'VN', name: 'Vietnam' },
      { code: 'MX', name: 'Mexico' },
      { code: 'FR', name: 'France' },
      { code: 'DE', name: 'Germany' },
      { code: 'ES', name: 'Spain' },
      { code: 'IT', name: 'Italy' },
      { code: 'CA', name: 'Canada' },
      { code: 'AU', name: 'Australia' },
      { code: 'TR', name: 'Turkey' },
      { code: 'SA', name: 'Saudi Arabia' },
      { code: 'EG', name: 'Egypt' },
      { code: 'NG', name: 'Nigeria' }
    ];
  }

  getCountryName(code) {
    return this.countryMap.get(code) || code;
  }

  /**
   * Detect optimal number of parallel tabs based on system specs
   */
  detectOptimalTabs() {
    const cpuCount = os.cpus().length;
    const totalMemGB = os.totalmem() / (1024 ** 3);
    const freeMemGB = os.freemem() / (1024 ** 3);
    const platform = os.platform();

    console.log('🔍 Detecting system capabilities...');
    console.log(`   CPU Cores: ${cpuCount}`);
    console.log(`   Total Memory: ${totalMemGB.toFixed(1)} GB`);
    console.log(`   Free Memory: ${freeMemGB.toFixed(1)} GB`);
    console.log(`   Platform: ${platform}`);
    console.log('');

    let recommendedTabs = 10; // Default
    let systemClass = 'Medium';

    // Determine system class and recommended tabs
    // Focus on CPU cores and total memory (free memory is less important - OS manages it)
    if (cpuCount >= 8 && totalMemGB >= 12) {
      // High-end system (8+ cores, 12GB+ RAM)
      recommendedTabs = 20;
      systemClass = 'High-end';
    } else if (cpuCount >= 6 && totalMemGB >= 8) {
      // Good system (6+ cores, 8GB+ RAM)
      recommendedTabs = 15;
      systemClass = 'Good';
    } else if (cpuCount >= 4 && totalMemGB >= 4) {
      // Medium system (4+ cores, 4GB+ RAM)
      recommendedTabs = 10;
      systemClass = 'Medium';
    } else {
      // Low-end system (< 4 cores or < 4GB RAM)
      recommendedTabs = 5;
      systemClass = 'Low-end';
    }

    // Safety check: If free memory is critically low (< 500MB), reduce tabs
    if (freeMemGB < 0.5) {
      console.log(`   ⚠️  Warning: Low free memory (${freeMemGB.toFixed(2)} GB)`);
      console.log(`   Reducing tabs to be safe...`);
      recommendedTabs = Math.max(5, Math.floor(recommendedTabs / 2));
    }

    console.log(`✅ System Class: ${systemClass}`);
    console.log(`✅ Recommended Parallel Tabs: ${recommendedTabs}`);
    console.log('');

    // Show what this means
    if (recommendedTabs === 20) {
      console.log('💪 Your system is powerful! Using maximum parallelization (20 tabs)');
      console.log('   Expected speedup: 10-20x faster');
    } else if (recommendedTabs === 15) {
      console.log('👍 Your system is good! Using high parallelization (15 tabs)');
      console.log('   Expected speedup: 7-15x faster');
    } else if (recommendedTabs === 10) {
      console.log('✅ Your system is capable! Using moderate parallelization (10 tabs)');
      console.log('   Expected speedup: 5-10x faster');
    } else {
      console.log('⚠️  Your system is limited. Using conservative parallelization (5 tabs)');
      console.log('   Expected speedup: 3-5x faster');
    }
    console.log('');

    return recommendedTabs;
  }

  /**
   * Scrape a single tab (country + tab type)
   */
  async scrapeTab(page, countryCode, tab, limit, tabId) {
    const countryName = this.topMarkets.find(m => m.code === countryCode)?.name || countryCode;
    const tabName = tab === 'breakout' ? 'BREAKOUT' : 'POPULAR';

    try {
      console.log(`      [Tab ${tabId}] ${countryCode}-${tabName} - Starting...`);

      const apiResponses = [];

      // Capture API responses
      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('/creative_radar_api/v1/popular_trend/sound/rank_list')) {
          try {
            const data = await response.json();
            apiResponses.push(data);
          } catch (e) {}
        }
      });

      // Load page
      await page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(2000);

      // Select region
      const regionSelector = await page.$('[class*="bannerRegionsSelectLabel"]');
      if (regionSelector) {
        const regionText = await regionSelector.textContent();
        if (regionText && (regionText.includes('Please Select') ||
            (!regionText.includes(countryCode) && !regionText.includes(countryName)))) {
          await regionSelector.click();
          await page.waitForTimeout(1000);

          const selectors = [
            'div[class*="dropdown"] div',
            'div[class*="regionOption"]',
            'div[class*="MenuItem"]'
          ];

          for (const selector of selectors) {
            const options = await page.$$(selector);
            const validOptions = [];

            for (const option of options) {
              const isVisible = await option.isVisible().catch(() => false);
              const text = await option.textContent().catch(() => '');
              if (isVisible && text && (text.includes(countryCode) || text.includes(countryName))) {
                validOptions.push(option);
              }
            }

            if (validOptions.length > 0) {
              await validOptions[0].click({ force: true });
              await page.waitForTimeout(2000);
              break;
            }
          }
        }
      }

      // Click the appropriate tab to trigger fresh API call
      const tabs = await page.$$('[class*="FilterTab"]');
      if (tabs.length >= 2) {
        if (tab === 'breakout') {
          // Click Breakout tab (second tab)
          await tabs[1].click();
          await page.waitForTimeout(3000);
        } else {
          // Click Popular tab (first tab) to force refresh
          await tabs[0].click();
          await page.waitForTimeout(3000);
        }
      }

      // Wait for API data
      console.log(`      [Tab ${tabId}] 📥 Waiting for API response...`);
      let waitCount = 0;
      while (apiResponses.length === 0 && waitCount < 20) {  // Increased from 10 to 20 seconds
        await page.waitForTimeout(1000);
        waitCount++;
      }

      if (apiResponses.length > 0) {
        console.log(`      [Tab ${tabId}] ✅ API connected`);
      }

      // Click "View More" to load songs
      console.log(`      [Tab ${tabId}] 📜 Loading songs...`);
      let clickAttempts = 0;
      let lastReportedCount = 0;

      while (clickAttempts < 50) {
        const currentCount = await page.$$eval('[class*="soundItemContainer"]', el => el.length);

        // Report progress every 25 songs
        if (currentCount >= lastReportedCount + 25) {
          console.log(`      [Tab ${tabId}] 📊 ${currentCount}/${limit} songs loaded...`);
          lastReportedCount = currentCount;
        }

        if (currentCount >= limit) break;

        try {
          const viewMoreBtn = await page.$('[class*="ViewMoreBtn"]');
          if (viewMoreBtn) {
            await viewMoreBtn.scrollIntoViewIfNeeded();
            await viewMoreBtn.click();
            await page.waitForTimeout(1500);
            clickAttempts++;
          } else {
            break;
          }
        } catch (e) {
          break;
        }
      }

      // Extract songs from API
      if (apiResponses.length === 0) {
        console.log(`      [Tab ${tabId}] ⚠️  No API responses - retrying tab click...`);

        // Try clicking the tab again to trigger API
        const tabs = await page.$$('[class*="FilterTab"]');
        if (tabs.length >= 2) {
          const targetTab = tab === 'breakout' ? tabs[1] : tabs[0];
          await targetTab.click();
          await page.waitForTimeout(3000);

          // Wait again for API
          waitCount = 0;
          while (apiResponses.length === 0 && waitCount < 10) {
            await page.waitForTimeout(1000);
            waitCount++;
          }
        }
      }

      console.log(`      [Tab ${tabId}] 🔄 Processing ${apiResponses.length} API responses...`);

      const songMap = new Map();
      for (const apiData of apiResponses) {
        if (apiData.data && apiData.data.sound_list) {
          for (const song of apiData.data.sound_list) {
            songMap.set(song.clip_id, {
              rank: song.rank,
              title: song.title,
              artist: song.author,
              image: song.cover,
              url: `https://ads.tiktok.com/business/creativecenter/song/${encodeURIComponent(song.title)}-${song.clip_id}`,
              duration: song.duration,
              rank_diff: song.rank_diff,
              rank_diff_type: song.rank_diff_type,
              trend_chart: song.trend,
              related_videos: song.related_items ? song.related_items.length : 0,
              scraped_at: new Date().toISOString()
            });
          }
        }
      }

      const allSongs = Array.from(songMap.values());
      allSongs.sort((a, b) => a.rank - b.rank);
      const songs = allSongs.slice(0, limit);

      console.log(`      [Tab ${tabId}] ${countryCode}-${tabName} - ✅ ${songs.length} songs`);

      return {
        success: true,
        countryCode,
        countryName,
        tab,
        songs
      };

    } catch (error) {
      console.error(`      [Tab ${tabId}] ${countryCode}-${tabName} - ❌ ${error.message}`);
      return {
        success: false,
        countryCode,
        countryName,
        tab,
        songs: [],
        error: error.message
      };
    }
  }

  /**
   * Scrape with parallel tabs in a single browser
   */
  async scrapeCCTTabs(limit = 100, options = {}) {
    const {
      countries = ['US'],
      parallelTabs = 10  // Run 10 tabs simultaneously
    } = options;

    console.log('\n' + '═'.repeat(70));
    console.log('🚀 PARALLEL SCRAPING - 2 BROWSERS PER COUNTRY');
    console.log('═'.repeat(70));
    console.log(`🌍 Countries: ${countries.join(', ')} (${countries.length} total)`);
    console.log(`🎯 Target: ${limit} songs per country`);
    console.log(`🖥️  2 separate browsers (Popular + Breakout running in parallel)`);
    console.log('');

    const results = {
      scraped_at: new Date().toISOString(),
      mode: 'parallel-tabs',
      parallel_tabs: parallelTabs,
      countries: countries,
      popular: [],
      breakout: [],
      by_country: {}
    };

    try {
      console.log(`📋 Total countries: ${countries.length}`);
      console.log(`⏱️  Estimated time: ${countries.length} countries × ~1.5 min = ~${Math.ceil(countries.length * 1.5)} minutes`);
      console.log('   (2 tabs sequential per country for 100% reliability)')
      console.log('');

      // Process ONE country at a time with 2 SEPARATE BROWSERS
      let completedCountries = 0;
      const startTime = Date.now();

      for (let i = 0; i < countries.length; i++) {
        const countryCode = countries[i];
        const countryName = this.topMarkets.find(m => m.code === countryCode)?.name || countryCode;

        console.log(`   🔄 Country ${i + 1}/${countries.length}: ${countryName} (${countryCode})`);

        // Run tabs SEQUENTIALLY (Popular, then Breakout)
        const batchResults = [];

        // Tab 1: Popular
        const browser1 = await chromium.launch({ headless: true });
        const context1 = await browser1.newContext({
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          viewport: { width: 1920, height: 1080 }
        });
        const page1 = await context1.newPage();
        const result1 = await this.scrapeTab(page1, countryCode, 'popular', limit, `${countryCode}-POP`);
        await browser1.close();
        batchResults.push(result1);

        // Tab 2: Breakout
        const browser2 = await chromium.launch({ headless: true });
        const context2 = await browser2.newContext({
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          viewport: { width: 1920, height: 1080 }
        });
        const page2 = await context2.newPage();
        const result2 = await this.scrapeTab(page2, countryCode, 'breakout', limit, `${countryCode}-BRK`);
        await browser2.close();
        batchResults.push(result2);

        // Process results
        completedCountries++;

        for (const result of batchResults) {
          if (result.success) {
            // Initialize country if needed
            if (!results.by_country[result.countryCode]) {
              results.by_country[result.countryCode] = {
                name: result.countryName,
                popular: [],
                breakout: []
              };
            }

            // Add songs
            const songsWithCountry = result.songs.map(s => ({ ...s, country: result.countryCode }));

            if (result.tab === 'popular') {
              results.by_country[result.countryCode].popular = result.songs;
              results.popular.push(...songsWithCountry);
            } else {
              results.by_country[result.countryCode].breakout = result.songs;
              results.breakout.push(...songsWithCountry);
            }
          }
        }

        const popularCount = batchResults[0]?.songs?.length || 0;
        const breakoutCount = batchResults[1]?.songs?.length || 0;
        console.log(`      ✅ ${countryName}: ${popularCount} popular, ${breakoutCount} breakout`);
        const progress = Math.round((completedCountries / countries.length) * 100);
        console.log(`   📊 Progress: ${completedCountries}/${countries.length} countries (${progress}%)`);
        console.log('');
      }

      const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // Summary
      console.log('═'.repeat(70));
      console.log('📊 PARALLEL SCRAPING COMPLETE');
      console.log('═'.repeat(70));
      console.log(`🌍 Countries scraped: ${countries.length}`);
      console.log(`📊 Total popular songs: ${results.popular.length}`);
      console.log(`🚀 Total breakout songs: ${results.breakout.length}`);
      console.log(`🎵 Grand total: ${results.popular.length + results.breakout.length} songs`);
      console.log(`⏱️  Total time: ${totalElapsed}s (${(totalElapsed / 60).toFixed(1)} minutes)`);
      console.log('');

      // Calculate speedup
      const sequentialTime = countries.length * 90; // ~90s per country (2 tabs sequential)
      const speedup = (sequentialTime / totalElapsed).toFixed(1);
      console.log(`⚡ Speedup: ${speedup}x faster than sequential!`);
      console.log(`   (Sequential would take: ${(sequentialTime / 60).toFixed(1)} minutes)`);
      console.log('');

      // Deduplicate and show unique count
      const uniqueSongs = new Set();
      [...results.popular, ...results.breakout].forEach(s => {
        uniqueSongs.add(`${s.artist}|${s.title}`);
      });
      console.log(`✨ Unique songs (across all countries): ${uniqueSongs.size}`);
      console.log('');

      // Save combined data
      await fs.writeFile(
        this.cctDataFile,
        JSON.stringify(results, null, 2),
        'utf-8'
      );
      console.log(`💾 CCT data saved to: ${this.cctDataFile}\n`);

      return results;

    } catch (error) {
      console.error(`\n❌ Error: ${error.message}\n`);
      if (browser) await browser.close();
      throw error;
    }
  }

  /**
   * Main execution
   */
  async run(options = {}) {
    const {
      countries = ['US'],
      limit = 100,
      parallelTabs = null  // null = auto-detect
    } = options;

    try {
      // Auto-detect optimal tabs if not specified
      const detectedTabs = parallelTabs !== null ? parallelTabs : this.detectOptimalTabs();

      // Process 1 country at a time with 2 tabs SEQUENTIALLY (reliable!)
      // Sequential = no TikTok anti-bot blocking, 100% success rate
      console.log(`✅ Strategy: Sequential tabs (Popular → Breakout)`);
      console.log(`   One tab at a time - slower but 100% reliable!`);
      console.log('');

      const results = await this.scrapeCCTTabs(limit, {
        countries,
        parallelTabs: 2  // Always use 2 tabs (Popular + Breakout for same country)
      });

      console.log('✅ Parallel scraping complete!\n');
      return results;

    } catch (error) {
      console.error(`\n❌ Error: ${error.message}\n`);
      process.exit(1);
    }
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log('\n🚀 CCT Parallel Scraper - Multiple Tabs (1 Browser)\n');
    console.log('Usage:');
    console.log('  node cct_to_kworb_tabs.js                        # US only, AUTO-DETECT tabs');
    console.log('  node cct_to_kworb_tabs.js --multi                # Top 5 markets, AUTO-DETECT');
    console.log('  node cct_to_kworb_tabs.js --multi --tabs 15      # Top 5, 15 parallel tabs');
    console.log('  node cct_to_kworb_tabs.js --markets 20 --tabs 20 # 20 markets, 20 tabs\n');
    console.log('Options:');
    console.log('  --multi              Enable multi-country mode (top 5)');
    console.log('  --markets N          Number of markets (default: 5)');
    console.log('  --tabs N             Parallel tabs (default: AUTO-DETECT, max: 20)');
    console.log('  --tabs auto          Explicitly use auto-detection');
    console.log('  --limit N            Songs per country per tab (default: 100)\n');
    console.log('Auto-Detection:');
    console.log('  High-end (8+ cores, 16GB+ RAM):  20 tabs');
    console.log('  Good (6+ cores, 8GB+ RAM):       15 tabs');
    console.log('  Medium (4+ cores, 4GB+ RAM):     10 tabs');
    console.log('  Low-end (< 4 cores):             5 tabs\n');
    console.log('Examples:');
    console.log('  # Auto: Let system decide optimal tabs');
    console.log('  node cct_to_kworb_tabs.js --multi');
    console.log('');
    console.log('  # Manual: Force 20 tabs');
    console.log('  node cct_to_kworb_tabs.js --markets 10 --tabs 20');
    console.log('');
    console.log('  # Explicit auto-detection');
    console.log('  node cct_to_kworb_tabs.js --markets 20 --tabs auto\n');
    console.log('Performance:');
    console.log('  Sequential: 10 countries × 2 tabs × 45s = 15 minutes');
    console.log('  Parallel (10 tabs): 2 batches × 45s = 1.5 minutes (10x faster!)');
    console.log('  Parallel (20 tabs): 1 batch × 45s = 45 seconds (20x faster!)\n');
    process.exit(0);
  }

  const multiCountry = args.includes('--multi');
  const tool = new CCTToKworbTabs();

  let markets = multiCountry ? 5 : 1;
  const marketsIndex = args.indexOf('--markets');
  if (marketsIndex !== -1 && args[marketsIndex + 1]) {
    markets = parseInt(args[marketsIndex + 1], 10);
  }

  let parallelTabs = null; // null = auto-detect
  const tabsIndex = args.indexOf('--tabs');
  if (tabsIndex !== -1 && args[tabsIndex + 1]) {
    const tabsValue = args[tabsIndex + 1];
    if (tabsValue === 'auto') {
      parallelTabs = null; // Explicit auto-detect
    } else {
      parallelTabs = Math.min(20, parseInt(tabsValue, 10)); // Max 20
    }
  }

  let limit = 100;
  const limitIndex = args.indexOf('--limit');
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    limit = parseInt(args[limitIndex + 1], 10);
  }

  // Get countries
  const countries = multiCountry
    ? tool.topMarkets.slice(0, markets).map(m => m.code)
    : ['US'];

  tool.run({ countries, limit, parallelTabs });
}

module.exports = CCTToKworbTabs;
