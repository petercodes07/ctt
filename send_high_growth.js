#!/usr/bin/env node

/**
 * Send email with high-growth songs only (300%+ 24h change)
 * Usage: node send_high_growth.js US 300
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

async function sendHighGrowthEmail(country = 'US', threshold = 300) {
  const emailNotifier = new EmailNotifier();

  console.log(`\n📧 Finding high-growth songs (${threshold}%+ 24h change) for ${country}...\n`);

  // Initialize email
  await emailNotifier.initialize();

  // Load data files
  const dataDir = path.join(__dirname, 'data');
  const popularFile = path.join(dataDir, `trending_music_with_trends_${country}.json`);
  const breakoutFile = path.join(dataDir, `trending_music_with_trends_${country}_breakout.json`);

  let allSongs = [];

  // Load popular songs
  if (fs.existsSync(popularFile)) {
    const popularData = JSON.parse(fs.readFileSync(popularFile, 'utf8'));
    if (popularData.songs) {
      allSongs = allSongs.concat(popularData.songs.map(s => ({ ...s, tab: 'Popular' })));
    }
  }

  // Load breakout songs
  if (fs.existsSync(breakoutFile)) {
    const breakoutData = JSON.parse(fs.readFileSync(breakoutFile, 'utf8'));
    if (breakoutData.songs) {
      allSongs = allSongs.concat(breakoutData.songs.map(s => ({ ...s, tab: 'Breakout' })));
    }
  }

  if (allSongs.length === 0) {
    console.log(`❌ No songs found for ${country}\n`);
    process.exit(1);
  }

  console.log(`✓ Loaded ${allSongs.length} total songs`);

  // Calculate 24h change for all songs
  allSongs.forEach(song => {
    song.change24h = calculate24HourChange(song);
  });

  // Filter high-growth songs
  const highGrowth = allSongs.filter(song => {
    return song.change24h >= threshold || song.change24h === Infinity;
  });

  // Sort by 24h change (highest first)
  highGrowth.sort((a, b) => {
    if (a.change24h === Infinity && b.change24h === Infinity) return 0;
    if (a.change24h === Infinity) return -1;
    if (b.change24h === Infinity) return 1;
    return b.change24h - a.change24h;
  });

  console.log(`✓ Found ${highGrowth.length} songs with ${threshold}%+ growth\n`);

  if (highGrowth.length === 0) {
    console.log(`ℹ️  No songs meet the ${threshold}% threshold\n`);
    process.exit(0);
  }

  // Send email
  const result = await emailNotifier.sendHighGrowthEmail({
    country,
    songs: highGrowth,
    threshold
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
  console.log('  node send_high_growth.js [COUNTRY] [THRESHOLD]\n');
  console.log('Parameters:');
  console.log('  COUNTRY    - Country code (default: US)');
  console.log('  THRESHOLD  - Minimum 24h growth % (default: 300)\n');
  console.log('Examples:');
  console.log('  node send_high_growth.js              # USA, 300%+');
  console.log('  node send_high_growth.js US 500       # USA, 500%+');
  console.log('  node send_high_growth.js PH 300       # Philippines, 300%+\n');
  process.exit(0);
}

const country = args[0] ? args[0].toUpperCase() : 'US';
const threshold = parseInt(args[1]) || 300;

sendHighGrowthEmail(country, threshold).catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
