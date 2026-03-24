#!/usr/bin/env node

/**
 * Song Lookup Tool
 * Input: Song name (e.g., "Lil Poppa - HAPPY TEARS")
 * Output: TikTok performance data for that specific song
 */

const TikTokMusicScraperWithTrends = require('./scraper_with_trends');
const fs = require('fs').promises;
const path = require('path');

class SongLookup {
  constructor() {
    this.scraper = new TikTokMusicScraperWithTrends();
    this.dataDir = 'song_data';
  }

  async ensureDataDir() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {}
  }

  // Parse song input "Artist - Song" or just "Song"
  parseSongInput(input) {
    const parts = input.split('-').map(p => p.trim());
    if (parts.length >= 2) {
      return {
        artist: parts[0],
        title: parts.slice(1).join(' - '),
        searchQuery: input
      };
    } else {
      return {
        artist: null,
        title: input,
        searchQuery: input
      };
    }
  }

  // Find exact match from search results
  findExactMatch(songs, artist, title) {
    // Try exact match first
    let match = songs.find(s => {
      const titleMatch = s.title.toLowerCase() === title.toLowerCase();
      const artistMatch = !artist || s.artist.toLowerCase().includes(artist.toLowerCase());
      return titleMatch && artistMatch;
    });

    // Try partial match
    if (!match) {
      match = songs.find(s => {
        const titleMatch = s.title.toLowerCase().includes(title.toLowerCase());
        const artistMatch = !artist || s.artist.toLowerCase().includes(artist.toLowerCase());
        return titleMatch && artistMatch;
      });
    }

    // Try artist + title together
    if (!match && artist) {
      match = songs.find(s => {
        const combined = `${s.artist} ${s.title}`.toLowerCase();
        const searchCombined = `${artist} ${title}`.toLowerCase();
        return combined.includes(searchCombined) || searchCombined.includes(combined);
      });
    }

    return match;
  }

  // Display song performance data
  displaySongData(song, searchInput) {
    console.log('\n' + '═'.repeat(70));
    console.log('🎵 SONG PERFORMANCE DATA');
    console.log('═'.repeat(70) + '\n');

    console.log(`📝 Search Query: "${searchInput}"\n`);

    console.log('🎵 SONG INFORMATION:');
    console.log(`   Title: ${song.title}`);
    console.log(`   Artist: ${song.artist}`);
    console.log(`   Duration: ${song.duration} seconds`);
    console.log(`   URL: ${song.url}\n`);

    console.log('📊 TIKTOK PERFORMANCE:');
    console.log(`   Current Rank: #${song.rank}`);

    const rankIcon = song.rank_diff_type === 1 ? '⬆️' : song.rank_diff_type === 2 ? '➡️' : '⬇️';
    const rankText = song.rank_diff_type === 1 ? 'UP' : song.rank_diff_type === 2 ? 'STABLE' : 'DOWN';
    console.log(`   Rank Change: ${rankIcon} ${rankText} ${song.rank_diff || 0} positions`);
    console.log(`   Total Videos Using Song: ${song.related_videos || 'N/A'}`);

    // Calculate 24-hour change
    if (song.trend_chart && song.trend_chart.length >= 2) {
      const latest = song.trend_chart[song.trend_chart.length - 1].value;
      const previous = song.trend_chart[song.trend_chart.length - 2].value;
      const change24h = latest - previous;
      const changePct = (change24h * 100).toFixed(1);

      const changeIcon = change24h > 0 ? '⬆️' : change24h < 0 ? '⬇️' : '➡️';
      const changeStatus = change24h > 0.3 ? '🔥 SURGING' :
                          change24h > 0.1 ? '📈 RISING' :
                          change24h < -0.3 ? '📉 DROPPING' :
                          change24h < -0.1 ? '⚠️ DECLINING' : '➡️ STABLE';

      console.log(`   24h Performance: ${changeIcon} ${changePct > 0 ? '+' : ''}${changePct}% (${changeStatus})`);
    }
    console.log('');

    console.log('📈 7-DAY PERFORMANCE TREND:');
    if (song.trend_chart && song.trend_chart.length > 0) {
      song.trend_chart.forEach((point, idx) => {
        const date = new Date(point.time * 1000).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        });
        const bar = '█'.repeat(Math.round(point.value * 40));
        const pct = (point.value * 100).toFixed(1);
        const indicator = point.value > 0.7 ? '🔥' : point.value > 0.4 ? '⚡' : point.value > 0 ? '📊' : '💤';

        // Calculate 24h change from previous day
        let changeStr = '';
        if (idx > 0) {
          const previousValue = song.trend_chart[idx - 1].value;
          const change24h = point.value - previousValue;
          const changePct = (change24h * 100).toFixed(1);
          const changeIcon = change24h > 0 ? '⬆️' : change24h < 0 ? '⬇️' : '➡️';
          changeStr = ` | 24h: ${changeIcon} ${changePct > 0 ? '+' : ''}${changePct}%`;
        }

        console.log(`   ${indicator} Day ${idx + 1} (${date}): ${bar.padEnd(42)} ${pct.padStart(5)}%${changeStr}`);
      });

      // Calculate statistics
      const values = song.trend_chart.map(t => t.value);
      const peak = Math.max(...values);
      const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
      const growth = values[values.length - 1] - values[0];

      console.log('\n💡 INSIGHTS:');
      console.log(`   Peak Performance: ${(peak * 100).toFixed(1)}%`);
      console.log(`   Average: ${(avg * 100).toFixed(1)}%`);
      console.log(`   7-Day Growth: ${growth > 0 ? '+' : ''}${(growth * 100).toFixed(1)}%`);

      if (growth > 0.5) {
        console.log(`   🚀 VIRAL ALERT: Massive growth detected!`);
      } else if (growth > 0.2) {
        console.log(`   📈 TRENDING: Strong upward momentum`);
      } else if (growth < -0.2) {
        console.log(`   📉 DECLINING: Losing momentum`);
      } else {
        console.log(`   ➡️ STABLE: Maintaining steady performance`);
      }
    } else {
      console.log('   ⚠️  No trend data available');
    }

    console.log('\n' + '═'.repeat(70) + '\n');
  }

  // Save song data to file
  async saveSongData(song, searchInput) {
    await this.ensureDataDir();

    // Create safe filename
    const safeFilename = searchInput.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const filepath = path.join(this.dataDir, `${safeFilename}.json`);

    const data = {
      search_query: searchInput,
      scraped_at: new Date().toISOString(),
      song: song
    };

    await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`💾 Data saved to: ${filepath}\n`);
  }

  // Main lookup function
  async lookup(songInput, options = {}) {
    const { country = 'US', headless = true } = options;

    console.log('\n🔍 TikTok Song Performance Lookup');
    console.log('═'.repeat(70) + '\n');

    // Parse input
    const parsed = this.parseSongInput(songInput);
    console.log(`📝 Looking up: "${songInput}"`);
    if (parsed.artist) {
      console.log(`   Artist: ${parsed.artist}`);
      console.log(`   Song: ${parsed.title}`);
    }
    console.log(`   Country: ${country}\n`);

    console.log('🔄 Searching TikTok Creative Center...\n');

    // Search for the song
    const songs = await this.scraper.scrapeMusic(50, {
      headless,
      tab: 'popular',
      country,
      searchQuery: parsed.searchQuery
    });

    if (songs.length === 0) {
      console.log('❌ No results found.\n');
      console.log('💡 Suggestions:');
      console.log('   - Check spelling');
      console.log('   - Try searching by artist name only');
      console.log('   - Song may not be trending on TikTok');
      console.log('   - Try different country (--country XX)\n');
      return null;
    }

    console.log(`✅ Found ${songs.length} results\n`);

    // Find exact match
    const match = this.findExactMatch(songs, parsed.artist, parsed.title);

    if (!match) {
      console.log('⚠️  Exact match not found. Showing all results:\n');
      songs.forEach((s, i) => {
        console.log(`${i + 1}. "${s.title}" - ${s.artist} (Rank #${s.rank})`);
      });
      console.log('\n💡 Try refining your search or use one of the results above\n');
      return songs;
    }

    // Display the matched song data
    this.displaySongData(match, songInput);

    // Save to file
    await this.saveSongData(match, songInput);

    return match;
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('\n🎵 TikTok Song Lookup Tool\n');
    console.log('Usage:');
    console.log('  node song_lookup.js "Artist - Song Title"');
    console.log('  node song_lookup.js "Song Title"\n');
    console.log('Options:');
    console.log('  --country XX     Search in specific country (default: US)');
    console.log('  --no-headless    Show browser window\n');
    console.log('Examples:');
    console.log('  node song_lookup.js "Lil Poppa - HAPPY TEARS"');
    console.log('  node song_lookup.js "Love & War"');
    console.log('  node song_lookup.js "Drake - Hotline Bling" --country CA');
    console.log('  node song_lookup.js "Espresso" --country GB\n');
    process.exit(0);
  }

  // Parse arguments
  const songInput = args.find(arg => !arg.startsWith('--'));
  const headless = !args.includes('--no-headless');

  let country = 'US';
  const countryIndex = args.indexOf('--country');
  if (countryIndex !== -1 && args[countryIndex + 1]) {
    country = args[countryIndex + 1].toUpperCase();
  }

  if (!songInput) {
    console.error('❌ Error: Please provide a song name\n');
    console.log('Example: node song_lookup.js "Lil Poppa - HAPPY TEARS"\n');
    process.exit(1);
  }

  // Run lookup
  const lookup = new SongLookup();
  lookup.lookup(songInput, { country, headless })
    .then(() => {
      console.log('✅ Lookup complete!\n');
      process.exit(0);
    })
    .catch(error => {
      console.error(`❌ Error: ${error.message}\n`);
      process.exit(1);
    });
}

module.exports = SongLookup;
