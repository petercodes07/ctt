#!/usr/bin/env node

/**
 * View and Compare Historical Scan Data
 *
 * View scan history across countries and dates
 * Compare day-to-day changes in rankings
 *
 * Usage:
 *   node view_history.js stats                    -> Show overall statistics
 *   node view_history.js latest US                -> Show latest US scan
 *   node view_history.js compare US               -> Compare last 2 US scans
 *   node view_history.js list US                  -> List all US scans
 *   node view_history.js cleanup 30               -> Delete scans older than 30 days
 */

const ScanHistory = require('./scan_history');
const scanHistory = new ScanHistory();

/**
 * Format timestamp for display
 */
function formatTimestamp(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Calculate time difference
 */
function getTimeDiff(date1, date2) {
  const diff = Math.abs(new Date(date1) - new Date(date2));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else {
    const minutes = Math.floor(diff / (1000 * 60));
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }
}

/**
 * Show overall statistics
 */
async function showStats() {
  const stats = await scanHistory.getStats();

  console.log('\n' + '='.repeat(70));
  console.log('📊 SCAN HISTORY STATISTICS');
  console.log('='.repeat(70));

  if (stats.totalScans === 0) {
    console.log('\n❌ No scans found in history.\n');
    return;
  }

  console.log(`\n📈 Total Scans: ${stats.totalScans}`);
  console.log(`🌍 Countries Tracked: ${stats.countries.length}`);

  if (stats.dateRange) {
    console.log(`📅 Date Range: ${formatTimestamp(stats.dateRange.oldest)} to ${formatTimestamp(stats.dateRange.newest)}`);
  }

  console.log('\n🌎 Scans by Country:');
  stats.countryCounts
    .sort((a, b) => b.count - a.count)
    .forEach(({ country, count }) => {
      console.log(`   ${country}: ${count} scan${count > 1 ? 's' : ''}`);
    });

  console.log('\n📋 Recent Scans:');
  stats.recentScans.forEach((scan, i) => {
    const timeAgo = getTimeDiff(new Date(), scan.timestamp);
    console.log(`   ${i + 1}. ${scan.country} - ${formatTimestamp(scan.timestamp)} (${timeAgo})`);
    console.log(`      Popular: ${scan.stats.popularCount} | Breakout: ${scan.stats.breakoutCount}`);
  });

  console.log('');
}

/**
 * Show latest scan for a country
 */
async function showLatest(country) {
  console.log(`\n🔍 Finding latest scan for ${country}...\n`);

  const scan = await scanHistory.getLatestScan({ country });

  if (!scan) {
    console.log(`❌ No scans found for ${country}\n`);
    return;
  }

  console.log('='.repeat(70));
  console.log(`📅 Latest ${country} Scan`);
  console.log('='.repeat(70));
  console.log(`Timestamp: ${formatTimestamp(scan.timestamp)}`);
  console.log(`Time ago: ${getTimeDiff(new Date(), scan.timestamp)}`);
  console.log(`Scan ID: ${scan.scanId}`);
  console.log(`\n📊 Statistics:`);
  console.log(`   Popular songs: ${scan.popular.length}`);
  console.log(`   Breakout songs: ${scan.breakout.length}`);
  console.log(`   Total: ${scan.popular.length + scan.breakout.length}`);

  if (scan.popular.length > 0) {
    console.log(`\n🎵 Top 10 Popular Songs:`);
    scan.popular.slice(0, 10).forEach((song, i) => {
      const trend = song.rank_diff_type === 3 ? '🆕 NEW' :
                    song.rank_diff_type === 1 ? `↑ ${song.rank_diff}` :
                    song.rank_diff_type === 2 ? `↓ ${song.rank_diff}` : '−';
      console.log(`   ${i + 1}. ${song.title} - ${song.artist} ${trend}`);
    });
  }

  if (scan.breakout.length > 0) {
    console.log(`\n🚀 Top 5 Breakout Songs:`);
    scan.breakout.slice(0, 5).forEach((song, i) => {
      console.log(`   ${i + 1}. ${song.title} - ${song.artist}`);
    });
  }

  console.log('');
}

/**
 * List all scans for a country
 */
async function listScans(country) {
  console.log(`\n📋 All scans for ${country}:\n`);

  const scans = await scanHistory.getScansByCountry(country);

  if (scans.length === 0) {
    console.log(`❌ No scans found for ${country}\n`);
    return;
  }

  console.log('='.repeat(70));
  scans.forEach((scan, i) => {
    const timeAgo = getTimeDiff(new Date(), scan.timestamp);
    console.log(`${i + 1}. ${formatTimestamp(scan.timestamp)} (${timeAgo})`);
    console.log(`   ID: ${scan.scanId}`);
    console.log(`   Songs: Popular (${scan.stats.popularCount}) | Breakout (${scan.stats.breakoutCount})`);
    console.log('');
  });
  console.log('='.repeat(70) + '\n');
}

/**
 * Compare last two scans for a country
 */
async function compareScans(country) {
  console.log(`\n🔄 Comparing last 2 scans for ${country}...\n`);

  const scans = await scanHistory.getScansByCountry(country);

  if (scans.length < 2) {
    console.log(`❌ Need at least 2 scans to compare. Found: ${scans.length}\n`);
    return;
  }

  const latest = await scanHistory.loadScan(scans[0].scanId);
  const previous = await scanHistory.loadScan(scans[1].scanId);

  console.log('='.repeat(70));
  console.log('📊 SCAN COMPARISON');
  console.log('='.repeat(70));
  console.log(`Latest:   ${formatTimestamp(latest.timestamp)}`);
  console.log(`Previous: ${formatTimestamp(previous.timestamp)}`);
  console.log(`Time gap: ${getTimeDiff(latest.timestamp, previous.timestamp)}`);
  console.log('='.repeat(70));

  // Compare popular songs
  if (latest.popular.length > 0 && previous.popular.length > 0) {
    console.log('\n🎵 Popular Songs Changes:\n');

    // Build maps for easy lookup
    const latestMap = new Map(latest.popular.map(s => [s.title + s.artist, s]));
    const previousMap = new Map(previous.popular.map(s => [s.title + s.artist, s]));

    // Find new entries
    const newSongs = latest.popular.filter(s => !previousMap.has(s.title + s.artist));
    if (newSongs.length > 0) {
      console.log(`🆕 New Entries (${newSongs.length}):`);
      newSongs.slice(0, 10).forEach(song => {
        console.log(`   #${song.rank}. ${song.title} - ${song.artist}`);
      });
      console.log('');
    }

    // Find songs that left
    const gonesSongs = previous.popular.filter(s => !latestMap.has(s.title + s.artist));
    if (gonesSongs.length > 0) {
      console.log(`📤 Left Chart (${gonesSongs.length}):`);
      gonesSongs.slice(0, 10).forEach(song => {
        console.log(`   Was #${song.rank}. ${song.title} - ${song.artist}`);
      });
      console.log('');
    }

    // Find biggest movers
    const movers = [];
    latest.popular.forEach(latestSong => {
      const key = latestSong.title + latestSong.artist;
      const prevSong = previousMap.get(key);
      if (prevSong) {
        const change = prevSong.rank - latestSong.rank; // Positive = moved up
        if (Math.abs(change) >= 5) {
          movers.push({
            song: latestSong,
            prevRank: prevSong.rank,
            newRank: latestSong.rank,
            change
          });
        }
      }
    });

    if (movers.length > 0) {
      movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
      console.log(`🔥 Biggest Movers (${movers.length}):`);
      movers.slice(0, 10).forEach(({ song, prevRank, newRank, change }) => {
        const arrow = change > 0 ? '⬆️' : '⬇️';
        console.log(`   ${arrow} #${prevRank} → #${newRank} (${Math.abs(change)}) - ${song.title} - ${song.artist}`);
      });
      console.log('');
    }
  }

  // Compare counts
  console.log('📊 Summary:');
  console.log(`   Popular: ${previous.popular.length} → ${latest.popular.length} (${latest.popular.length - previous.popular.length >= 0 ? '+' : ''}${latest.popular.length - previous.popular.length})`);
  console.log(`   Breakout: ${previous.breakout.length} → ${latest.breakout.length} (${latest.breakout.length - previous.breakout.length >= 0 ? '+' : ''}${latest.breakout.length - previous.breakout.length})`);
  console.log('');
}

/**
 * Cleanup old scans
 */
async function cleanup(days) {
  const daysToKeep = parseInt(days) || 30;
  console.log(`\n🧹 Cleaning up scans older than ${daysToKeep} days...\n`);

  const result = await scanHistory.cleanupOldScans(daysToKeep);

  console.log('='.repeat(70));
  console.log(`✅ Cleanup complete!`);
  console.log(`   Deleted: ${result.deleted} scan${result.deleted !== 1 ? 's' : ''}`);
  console.log(`   Remaining: ${result.remaining} scan${result.remaining !== 1 ? 's' : ''}`);
  console.log('='.repeat(70) + '\n');
}

/**
 * Main CLI handler
 */
async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  try {
    switch (command) {
      case 'stats':
        await showStats();
        break;

      case 'latest':
        await showLatest(arg || 'US');
        break;

      case 'list':
        await listScans(arg || 'US');
        break;

      case 'compare':
        await compareScans(arg || 'US');
        break;

      case 'cleanup':
        await cleanup(arg);
        break;

      default:
        console.log(`
📊 View and Compare Historical Scan Data

Usage:
  node view_history.js <command> [options]

Commands:
  stats                    Show overall scan statistics
  latest [COUNTRY]         Show latest scan for a country (default: US)
  list [COUNTRY]           List all scans for a country
  compare [COUNTRY]        Compare last 2 scans for a country
  cleanup [DAYS]           Delete scans older than N days (default: 30)

Examples:
  node view_history.js stats
  node view_history.js latest US
  node view_history.js list PH
  node view_history.js compare JP
  node view_history.js cleanup 60

Tip: Run scans daily to track day-to-day changes!
        `);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
