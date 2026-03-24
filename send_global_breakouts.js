#!/usr/bin/env node

/**
 * Send email with top 100 highest-growth breakout songs from ALL countries
 * Usage: node send_global_breakouts.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const EmailNotifier = require('./email_notifier');

function calculate24HourChange(song) {
  if (!song.trend_chart || song.trend_chart.length < 2) {
    return -Infinity;
  }

  const lastDay = song.trend_chart[song.trend_chart.length - 1];
  const previousDay = song.trend_chart[song.trend_chart.length - 2];

  if (previousDay.value === 0 || previousDay.value < 0.0001) {
    if (lastDay.value > 0) {
      return Infinity; // NEW songs
    }
    return -Infinity;
  }

  const change = ((lastDay.value - previousDay.value) / previousDay.value) * 100;
  return isFinite(change) ? change : -Infinity;
}

async function sendGlobalBreakoutsEmail(limit = 100) {
  const emailNotifier = new EmailNotifier();

  console.log(`\n📧 Finding top ${limit} highest-growth breakout songs across ALL countries...\n`);

  // Initialize email
  await emailNotifier.initialize();

  // Load all breakout files
  const dataDir = path.join(__dirname, 'data');
  const allFiles = fs.readdirSync(dataDir);
  const breakoutFiles = allFiles.filter(f => f.includes('_breakout.json') && f.startsWith('trending_music_with_trends_'));

  console.log(`✓ Found ${breakoutFiles.length} country breakout files`);

  let allSongs = [];
  let countriesProcessed = 0;

  for (const file of breakoutFiles) {
    try {
      const filePath = path.join(dataDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      if (data.songs && data.songs.length > 0) {
        const country = data.country || file.match(/trending_music_with_trends_([A-Z]{2})_breakout/)?.[1] || 'Unknown';

        data.songs.forEach(song => {
          allSongs.push({
            ...song,
            country: country
          });
        });

        countriesProcessed++;
      }
    } catch (e) {
      console.error(`  ⚠️  Error loading ${file}: ${e.message}`);
    }
  }

  console.log(`✓ Loaded ${allSongs.length} breakout songs from ${countriesProcessed} countries\n`);

  if (allSongs.length === 0) {
    console.log(`❌ No breakout songs found\n`);
    process.exit(1);
  }

  // Calculate 24h change for all songs
  allSongs.forEach(song => {
    song.change24h = calculate24HourChange(song);
  });

  // Sort by 24h change (highest first)
  allSongs.sort((a, b) => {
    if (a.change24h === Infinity && b.change24h === Infinity) return 0;
    if (a.change24h === Infinity) return -1;
    if (b.change24h === Infinity) return 1;
    return b.change24h - a.change24h;
  });

  // Take top N songs
  const topSongs = allSongs.slice(0, limit);

  console.log(`✓ Selected top ${topSongs.length} breakout songs by growth\n`);

  if (topSongs.length === 0) {
    console.log(`❌ No breakout songs found\n`);
    process.exit(0);
  }

  // Show breakdown by country
  const byCountry = {};
  topSongs.forEach(song => {
    byCountry[song.country] = (byCountry[song.country] || 0) + 1;
  });

  console.log('Breakdown by country:');
  Object.entries(byCountry)
    .sort((a, b) => b[1] - a[1])
    .forEach(([country, count]) => {
      const countryName = emailNotifier.getCountryName(country);
      console.log(`   ${countryName}: ${count} songs`);
    });
  console.log('');

  // Send email
  const result = await emailNotifier.sendGlobalBreakoutsEmail({
    songs: topSongs,
    totalCountries: countriesProcessed
  });

  if (result.success) {
    console.log(`\n✅ Email sent successfully!\n`);
  } else {
    console.log(`\n❌ Failed to send email: ${result.error}\n`);
  }
}

// Main
const args = process.argv.slice(2);

if (args[0] === '--help' || args[0] === '-h') {
  console.log('\nUsage:');
  console.log('  node send_global_breakouts.js [LIMIT]\n');
  console.log('Parameters:');
  console.log('  LIMIT  - Number of top songs to send (default: 100)\n');
  console.log('Examples:');
  console.log('  node send_global_breakouts.js           # Top 100');
  console.log('  node send_global_breakouts.js 50        # Top 50');
  console.log('  node send_global_breakouts.js 200       # Top 200\n');
  process.exit(0);
}

const limit = parseInt(args[0]) || 100;

sendGlobalBreakoutsEmail(limit).catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
