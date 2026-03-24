#!/usr/bin/env node

/**
 * Global Trend Scraper
 * Scrapes multiple major markets and aggregates into global trends
 */

const TikTokMusicScraperWithTrends = require('./scraper_with_trends');
const fs = require('fs').promises;
const path = require('path');

class GlobalTrendScraper {
  constructor() {
    // Load ALL countries from countries.json
    const countriesData = require('./countries.json');
    this.allCountries = countriesData.countries.map(c => c.code);

    // Top 19 global markets by TikTok usage (2026 data - for quick mode)
    // Note: Russia (RU) excluded - not available in TikTok Creative Center
    this.majorMarkets = [
      'ID',  // 1. Indonesia - 180.1M
      'US',  // 2. United States - 153.1M
      'BR',  // 3. Brazil - 130.8M
      'MX',  // 4. Mexico - 77.5M
      'VN',  // 5. Vietnam - 65.6M
      'PK',  // 6. Pakistan - 62.0M
      'PH',  // 7. Philippines - 56.1M
      'TH',  // 8. Thailand - 50.8M
      'BD',  // 9. Bangladesh - 41.1M
      'EG',  // 10. Egypt - 37.6M
      'TR',  // 11. Turkey - 37.5M
      'IQ',  // 12. Iraq - 33.1M
      'SA',  // 13. Saudi Arabia - 31.5M
      'NG',  // 14. Nigeria - 29.7M
      'CO',  // 15. Colombia - 28.6M
      'MY',  // 16. Malaysia - 27.3M
      'JP',  // 17. Japan - 25.0M
      'GB',  // 18. United Kingdom - 22.9M
      'FR'   // 19. France - 22.8M
    ];
    this.dataDir = 'data';
  }

  async scrapeGlobal(maxSongsPerCountry = 20, options = {}) {
    const { markets = this.majorMarkets } = options;

    console.log('\n' + '='.repeat(70));
    console.log('🌍 GLOBAL TREND SCRAPER');
    console.log('='.repeat(70));
    console.log(`\n📊 Scraping ${markets.length} major markets:`);
    console.log(`   ${markets.join(', ')}\n`);

    const allSongs = new Map(); // song_id -> song data with market info
    const scraper = new TikTokMusicScraperWithTrends();

    for (let i = 0; i < markets.length; i++) {
      const country = markets[i];
      console.log(`\n[${i + 1}/${markets.length}] 🌍 Scraping ${country}...`);

      try {
        const songs = await scraper.scrapeMusic(maxSongsPerCountry, {
          headless: true,
          tab: 'popular',
          country
        });

        console.log(`✅ ${country}: ${songs.length} songs scraped`);

        // Aggregate songs
        songs.forEach(song => {
          const songKey = `${song.title}-${song.artist}`;

          if (allSongs.has(songKey)) {
            const existing = allSongs.get(songKey);
            existing.markets.push({
              country,
              rank: song.rank,
              trend_chart: song.trend_chart
            });
            existing.global_score += (100 - song.rank); // Higher score for better rank
            existing.market_count++;
          } else {
            allSongs.set(songKey, {
              title: song.title,
              artist: song.artist,
              image: song.image,
              url: song.url,
              duration: song.duration,
              markets: [{
                country,
                rank: song.rank,
                trend_chart: song.trend_chart
              }],
              market_count: 1,
              global_score: (100 - song.rank),
              first_seen_in: country
            });
          }
        });

      } catch (error) {
        console.error(`❌ ${country}: Error - ${error.message}`);
      }

      // Small delay between countries to be nice to the server
      if (i < markets.length - 1) {
        console.log('⏳ Waiting 5 seconds...');
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    // Convert to array and calculate global ranking
    const globalSongs = Array.from(allSongs.values());

    // Sort by: 1) markets count, 2) global score
    globalSongs.sort((a, b) => {
      if (b.market_count !== a.market_count) {
        return b.market_count - a.market_count;
      }
      return b.global_score - a.global_score;
    });

    // Add global rank
    globalSongs.forEach((song, idx) => {
      song.global_rank = idx + 1;
    });

    console.log(`\n✅ Total unique songs found: ${globalSongs.length}`);
    console.log(`📊 Songs trending in multiple markets: ${globalSongs.filter(s => s.market_count > 1).length}`);

    return globalSongs;
  }

  async saveJSON(data, filename = 'trending_music_GLOBAL.json', markets = []) {
    const filepath = path.join(this.dataDir, filename);

    const output = {
      type: 'global',
      markets_analyzed: markets.length > 0 ? markets : this.majorMarkets,
      total_markets: markets.length > 0 ? markets.length : this.majorMarkets.length,
      scraped_at: new Date().toISOString(),
      total_songs: data.length,
      multi_market_songs: data.filter(s => s.market_count > 1).length,
      songs: data
    };

    await fs.writeFile(filepath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`💾 Global data saved to ${filepath}`);
  }

  async saveCSV(data, filename = 'trending_music_GLOBAL.csv') {
    if (!data || data.length === 0) return;

    const filepath = path.join(this.dataDir, filename);

    // Flatten for CSV
    const csvData = data.map(song => ({
      global_rank: song.global_rank,
      title: song.title,
      artist: song.artist,
      market_count: song.market_count,
      markets: song.markets.map(m => `${m.country}(#${m.rank})`).join(', '),
      global_score: song.global_score,
      first_seen_in: song.first_seen_in,
      url: song.url
    }));

    const createCsvWriter = require('csv-writer').createObjectCsvWriter;
    const csvWriter = createCsvWriter({
      path: filepath,
      header: [
        { id: 'global_rank', title: 'Global Rank' },
        { id: 'title', title: 'Song Title' },
        { id: 'artist', title: 'Artist' },
        { id: 'market_count', title: 'Markets' },
        { id: 'markets', title: 'Market Rankings' },
        { id: 'global_score', title: 'Global Score' },
        { id: 'first_seen_in', title: 'First Seen In' },
        { id: 'url', title: 'URL' }
      ]
    });

    await csvWriter.writeRecords(csvData);
    console.log(`📊 Global CSV saved to ${filepath}`);
  }

  async run(maxSongsPerCountry = 20, options = {}) {
    const { allCountries = false } = options;

    console.log('\n🌍 Starting Global Trend Analysis...\n');

    if (allCountries) {
      console.log('🚨 FULL MODE: Scraping ALL 72 countries!');
      console.log('⏰ Estimated time: ~2-3 hours\n');
    } else {
      console.log('⚡ Quick Mode: Scraping top 19 markets by user count');
      console.log('💡 Use --all flag to scrape all 72 countries\n');
    }

    await fs.mkdir(this.dataDir, { recursive: true }).catch(() => {});

    const markets = allCountries ? this.allCountries : this.majorMarkets;
    const songs = await this.scrapeGlobal(maxSongsPerCountry, { markets });

    if (songs.length > 0) {
      await this.saveJSON(songs, 'trending_music_GLOBAL.json', markets);
      await this.saveCSV(songs);

      // Display top global trends
      console.log('\n' + '='.repeat(70));
      console.log('🏆 TOP 20 GLOBAL TRENDING SONGS');
      console.log('='.repeat(70) + '\n');

      songs.slice(0, 20).forEach(song => {
        const marketList = song.markets.map(m => `${m.country}(#${m.rank})`).join(', ');
        console.log(`🌍 #${song.global_rank} ${song.title} - ${song.artist}`);
        console.log(`   📊 Trending in ${song.market_count} markets: ${marketList}`);
        console.log(`   🎯 Global Score: ${song.global_score}\n`);
      });

      console.log('='.repeat(70));
      console.log('📈 Summary');
      console.log('='.repeat(70));
      console.log(`Total unique songs: ${songs.length}`);
      console.log(`Multi-market hits: ${songs.filter(s => s.market_count > 1).length}`);
      console.log(`True global hits (5+ markets): ${songs.filter(s => s.market_count >= 5).length}`);
      console.log('\n✨ Global analysis complete!\n');
    }

    return songs;
  }
}

// Run
if (require.main === module) {
  const args = process.argv.slice(2);
  const maxSongs = parseInt(args.find(arg => arg.match(/^\d+$/))) || 20;
  const allCountries = args.includes('--all');

  const scraper = new GlobalTrendScraper();
  scraper.run(maxSongs, { allCountries }).catch(console.error);
}

module.exports = GlobalTrendScraper;
