#!/usr/bin/env node

/**
 * CCT to Kworb Cross-Reference Tool
 *
 * Workflow:
 * 1. Scrape TikTok Creative Center for trending music (Popular + Breakout tabs)
 * 2. Export CCT data to JSON
 * 3. Check which songs are also on Kworb charts (Spotify Global, US, etc.)
 * 4. Generate a cross-reference report
 *
 * Usage:
 *   node cct_to_kworb.js              # Scrape CCT first, then check kworb
 *   node cct_to_kworb.js --skip-cct   # Use existing CCT data
 */

const TikTokMusicScraperWithTrends = require('./scraper_with_trends');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class CCTToKworb {
  constructor() {
    this.scraper = new TikTokMusicScraperWithTrends();
    this.dataDir = 'data';
    this.cctDataFile = path.join(this.dataDir, 'cct_for_kworb.json');

    // Top markets to scrape (largest TikTok markets)
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

  /**
   * Step 1: Scrape TikTok Creative Center
   */
  async scrapeCCT(limit = 100, options = {}) {
    const { multiCountry = false, countries = ['US'] } = options;

    console.log('\n' + '═'.repeat(70));
    console.log('🎵 STEP 1: SCRAPING TIKTOK CREATIVE CENTER');
    console.log('═'.repeat(70));
    console.log(`📊 Mode: ${multiCountry ? 'MULTI-COUNTRY' : 'SINGLE-COUNTRY'}`);
    console.log(`🌍 Countries: ${countries.join(', ')} (${countries.length} total)`);
    console.log(`🎯 Target: ${limit} songs per country per tab`);
    console.log('');

    const results = {
      scraped_at: new Date().toISOString(),
      mode: multiCountry ? 'multi-country' : 'single-country',
      countries: countries,
      popular: [],
      breakout: [],
      by_country: {}
    };

    try {
      const totalSteps = countries.length * 2; // 2 tabs per country
      let currentStep = 0;

      for (const countryCode of countries) {
        const countryName = this.topMarkets.find(m => m.code === countryCode)?.name || countryCode;

        console.log('─'.repeat(70));
        console.log(`🌍 COUNTRY: ${countryName} (${countryCode})`);
        console.log('─'.repeat(70));

        results.by_country[countryCode] = {
          name: countryName,
          popular: [],
          breakout: []
        };

        // Scrape Popular tab
        currentStep++;
        console.log(`📊 [${currentStep}/${totalSteps}] POPULAR TAB - ${countryName}`);
        console.log('    ⏳ Launching browser and loading TikTok...');

        const popularStart = Date.now();
        const popularSongs = await this.scraper.scrapeMusic(limit, {
          headless: true,
          tab: 'popular',
          country: countryCode
        });
        const popularTime = ((Date.now() - popularStart) / 1000).toFixed(1);

        results.by_country[countryCode].popular = popularSongs;
        results.popular.push(...popularSongs.map(s => ({ ...s, country: countryCode })));

        console.log(`    ✅ Found ${popularSongs.length} popular songs from ${countryName} (${popularTime}s)`);
        if (popularSongs.length > 0) {
          console.log(`    📝 Top: "${popularSongs[0].title}" - ${popularSongs[0].artist}`);
        }
        console.log('');

        // Scrape Breakout tab
        currentStep++;
        console.log(`🚀 [${currentStep}/${totalSteps}] BREAKOUT TAB - ${countryName}`);
        console.log('    ⏳ Switching tabs and reloading...');

        const breakoutStart = Date.now();
        const breakoutSongs = await this.scraper.scrapeMusic(limit, {
          headless: true,
          tab: 'breakout',
          country: countryCode
        });
        const breakoutTime = ((Date.now() - breakoutStart) / 1000).toFixed(1);

        results.by_country[countryCode].breakout = breakoutSongs;
        results.breakout.push(...breakoutSongs.map(s => ({ ...s, country: countryCode })));

        console.log(`    ✅ Found ${breakoutSongs.length} breakout songs from ${countryName} (${breakoutTime}s)`);
        if (breakoutSongs.length > 0) {
          console.log(`    📝 Top: "${breakoutSongs[0].title}" - ${breakoutSongs[0].artist}`);
        }
        console.log('');
      }

      // Summary
      console.log('═'.repeat(70));
      console.log('📊 SCRAPING COMPLETE');
      console.log('═'.repeat(70));
      console.log(`🌍 Countries scraped: ${countries.length}`);
      console.log(`📊 Total popular songs: ${results.popular.length}`);
      console.log(`🚀 Total breakout songs: ${results.breakout.length}`);
      console.log(`🎵 Grand total: ${results.popular.length + results.breakout.length} songs`);
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
      console.error(`❌ Error scraping CCT: ${error.message}\n`);
      throw error;
    }
  }

  /**
   * Step 2: Load existing CCT data
   */
  async loadCCTData() {
    try {
      const data = await fs.readFile(this.cctDataFile, 'utf-8');
      const parsed = JSON.parse(data);

      console.log('\n' + '═'.repeat(70));
      console.log('📂 LOADED EXISTING CCT DATA');
      console.log('═'.repeat(70));
      console.log(`📊 Popular songs: ${parsed.popular.length}`);
      console.log(`🚀 Breakout songs: ${parsed.breakout.length}`);
      console.log(`🕒 Scraped at: ${new Date(parsed.scraped_at).toLocaleString()}\n`);

      return parsed;
    } catch (error) {
      console.error(`❌ Could not load CCT data from ${this.cctDataFile}`);
      console.error(`   Run without --skip-cct to scrape fresh data\n`);
      throw error;
    }
  }

  /**
   * Step 3: Check Kworb for each song using peter_fast.py
   */
  async checkKworb(cctData) {
    console.log('\n' + '═'.repeat(70));
    console.log('🔍 STEP 2: CHECKING KWORB CHARTS');
    console.log('═'.repeat(70) + '\n');

    const allSongs = [
      ...cctData.popular.map(s => ({ ...s, source: 'popular' })),
      ...cctData.breakout.map(s => ({ ...s, source: 'breakout' }))
    ];

    console.log(`📊 Total songs to check: ${allSongs.length}\n`);

    // Deduplicate by "artist - title"
    const uniqueSongs = [];
    const seen = new Set();

    for (const song of allSongs) {
      const key = `${song.artist.toLowerCase()}|${song.title.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueSongs.push(song);
      }
    }

    console.log(`📊 Unique songs: ${uniqueSongs.length}\n`);

    // For demonstration, we'll create a summary
    // In production, you'd call peter_fast.py's kworb functions or implement kworb fetching here

    const results = {
      checked_at: new Date().toISOString(),
      total_songs: uniqueSongs.length,
      songs: uniqueSongs.map(song => ({
        title: song.title,
        artist: song.artist,
        rank: song.rank,
        source: song.source,
        tiktok_url: song.url,
        // Placeholder for kworb data - you'd fetch this from kworb.net
        kworb_charts: []
      }))
    };

    return results;
  }

  /**
   * Step 4: Generate cross-reference report
   */
  displayReport(cctData, kworbResults) {
    console.log('\n' + '═'.repeat(70));
    console.log('📊 CCT → KWORB CROSS-REFERENCE REPORT');
    console.log('═'.repeat(70) + '\n');

    console.log('🎯 TOP 10 POPULAR SONGS (TikTok Creative Center):\n');
    cctData.popular.slice(0, 10).forEach((song, i) => {
      const rankEmoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
      const trendIcon = song.rank_diff_type === 1 ? '⬆️' : song.rank_diff_type === 3 ? '⬇️' : '➡️';

      console.log(`${rankEmoji} #${song.rank} ${trendIcon}`);
      console.log(`   "${song.title}" - ${song.artist}`);
      console.log(`   Duration: ${song.duration}s | Videos: ${song.related_videos || 'N/A'}`);
      console.log(`   TikTok: ${song.url}`);
      console.log('');
    });

    console.log('\n🚀 TOP 10 BREAKOUT SONGS (Emerging Hits):\n');
    cctData.breakout.slice(0, 10).forEach((song, i) => {
      const trendIcon = song.rank_diff_type === 1 ? '⬆️' : song.rank_diff_type === 3 ? '⬇️' : '➡️';

      console.log(`🔥 #${song.rank} ${trendIcon}`);
      console.log(`   "${song.title}" - ${song.artist}`);
      console.log(`   Duration: ${song.duration}s | Videos: ${song.related_videos || 'N/A'}`);
      console.log(`   TikTok: ${song.url}`);
      console.log('');
    });

    console.log('\n💡 NEXT STEPS:');
    console.log('   1. ✅ CCT data is ready for kworb cross-reference');
    console.log('   2. 🔄 Use peter_fast.py to check kworb charts:');
    console.log('      python3 ~/Documents/Peter/peter_fast.py');
    console.log('   3. 📊 Cross-reference these TikTok songs with Spotify/iTunes charts\n');

    console.log('💾 Data exported to:');
    console.log(`   ${this.cctDataFile}\n`);
  }

  /**
   * Main execution flow
   */
  async run(options = {}) {
    const {
      skipCCT = false,
      limit = 100,
      multiCountry = false,
      topMarkets = 5
    } = options;

    try {
      let cctData;

      if (skipCCT) {
        // Use existing CCT data
        cctData = await this.loadCCTData();
      } else {
        // Determine which countries to scrape
        let countries = ['US']; // Default: US only

        if (multiCountry) {
          // Use top N markets
          countries = this.topMarkets.slice(0, topMarkets).map(m => m.code);
        }

        // Scrape fresh CCT data
        cctData = await this.scrapeCCT(limit, {
          multiCountry,
          countries
        });
      }

      // Check kworb (placeholder for now)
      const kworbResults = await this.checkKworb(cctData);

      // Display report
      this.displayReport(cctData, kworbResults);

      console.log('✅ CCT → Kworb workflow complete!\n');
      return { cctData, kworbResults };

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
    console.log('\n🎵 CCT → Kworb Cross-Reference Tool\n');
    console.log('Usage:');
    console.log('  node cct_to_kworb.js                        # Single country (US), 100 songs');
    console.log('  node cct_to_kworb.js --multi                # Top 5 markets, 100 songs each');
    console.log('  node cct_to_kworb.js --multi --markets 10   # Top 10 markets');
    console.log('  node cct_to_kworb.js --multi --markets 20   # Top 20 markets (full scan)');
    console.log('  node cct_to_kworb.js --limit 150            # 150 songs per country');
    console.log('  node cct_to_kworb.js --skip-cct             # Use existing data\n');
    console.log('Options:');
    console.log('  --multi              Enable multi-country mode');
    console.log('  --markets N          Number of top markets to scrape (default: 5)');
    console.log('  --limit N            Songs per country per tab (default: 100)');
    console.log('  --skip-cct           Use cached data instead of scraping\n');
    console.log('Top Markets (in order):');
    console.log('  US, GB, BR, ID, JP, KR, PH, TH, VN, MX,');
    console.log('  FR, DE, ES, IT, CA, AU, TR, SA, EG, NG\n');
    console.log('Examples:');
    console.log('  node cct_to_kworb.js                        # US only, 100 songs');
    console.log('  node cct_to_kworb.js --multi                # Top 5: US,GB,BR,ID,JP');
    console.log('  node cct_to_kworb.js --multi --markets 10   # Top 10 markets');
    console.log('  node cct_to_kworb.js --multi --limit 150    # Top 5, 150 songs each\n');
    process.exit(0);
  }

  const skipCCT = args.includes('--skip-cct');
  const multiCountry = args.includes('--multi');

  let limit = 100; // Increased default from 50 to 100
  const limitIndex = args.indexOf('--limit');
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    limit = parseInt(args[limitIndex + 1], 10);
  }

  let topMarkets = 5; // Default: top 5 markets
  const marketsIndex = args.indexOf('--markets');
  if (marketsIndex !== -1 && args[marketsIndex + 1]) {
    topMarkets = parseInt(args[marketsIndex + 1], 10);
  }

  const tool = new CCTToKworb();
  tool.run({ skipCCT, limit, multiCountry, topMarkets });
}

module.exports = CCTToKworb;
