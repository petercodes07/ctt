#!/usr/bin/env node

const EmailNotifier = require('./email_notifier');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const files = fs.readdirSync(dataDir);
const allCountryData = [];

files.forEach(file => {
  if (file.startsWith('trending_music_with_trends') && file.endsWith('.json') && !file.includes('breakout')) {
    let countryCode = 'US';
    if (file !== 'trending_music_with_trends.json') {
      const match = file.match(/trending_music_with_trends_([A-Z]{2})\.json/);
      if (match) countryCode = match[1];
    }

    try {
      const popularData = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
      const breakoutFile = file.replace('.json', '_breakout.json');
      let breakoutData = { songs: [] };
      if (fs.existsSync(path.join(dataDir, breakoutFile))) {
        breakoutData = JSON.parse(fs.readFileSync(path.join(dataDir, breakoutFile), 'utf8'));
      }
      allCountryData.push({
        country: countryCode,
        popularSongs: popularData.songs || [],
        breakoutSongs: breakoutData.songs || []
      });
    } catch (e) {}
  }
});

const notifier = new EmailNotifier();

// Collect all songs with absolute score differences
const allSongs = [];
allCountryData.forEach(countryData => {
  const country = countryData.country;

  [...(countryData.popularSongs || []), ...(countryData.breakoutSongs || [])].forEach(song => {
    if (song.trend_chart && song.trend_chart.length >= 2) {
      const lastDay = song.trend_chart[song.trend_chart.length - 1];
      const previousDay = song.trend_chart[song.trend_chart.length - 2];

      const absoluteIncrease = lastDay.value - previousDay.value;

      allSongs.push({
        title: song.title,
        artist: song.artist,
        country: country,
        previousScore: previousDay.value,
        currentScore: lastDay.value,
        absoluteIncrease: absoluteIncrease,
        percentChange: previousDay.value > 0 ? ((absoluteIncrease / previousDay.value) * 100) : 0
      });
    }
  });
});

// Sort by absolute increase
allSongs.sort((a, b) => b.absoluteIncrease - a.absoluteIncrease);

// Filter songs with significant absolute increases
const threshold = 0.1; // 0.1 = 10% of the max scale
const highGrowth = allSongs.filter(s => s.absoluteIncrease >= threshold);

console.log('\n' + '='.repeat(70));
console.log('SONGS WITH HIGHEST ABSOLUTE SCORE INCREASE (24h)');
console.log('='.repeat(70));
console.log('\nNote: Scores range from 0.0 (no activity) to 1.0 (max trending)');
console.log('Showing songs with +0.1 or higher increase (10% of max scale)\n');
console.log('Total songs with +0.1 increase:', highGrowth.length);
console.log('Total songs analyzed:', allSongs.length);
console.log('');

if (highGrowth.length > 0) {
  console.log('Top 30 songs by absolute score increase:\n');
  highGrowth.slice(0, 30).forEach((song, i) => {
    const countryName = notifier.getCountryName(song.country);
    console.log(`${i + 1}. ${song.title} - ${song.artist}`);
    console.log(`   Country: ${countryName}`);
    console.log(`   Previous: ${song.previousScore.toFixed(3)} → Current: ${song.currentScore.toFixed(3)}`);
    console.log(`   Increase: +${song.absoluteIncrease.toFixed(3)} (${song.percentChange.toFixed(0)}%)`);
    console.log('');
  });
} else {
  console.log('No songs found with +0.1 increase\n');
  console.log('Top 30 by absolute increase:\n');
  allSongs.slice(0, 30).forEach((song, i) => {
    const countryName = notifier.getCountryName(song.country);
    console.log(`${i + 1}. ${song.title} - ${song.artist}`);
    console.log(`   Country: ${countryName}`);
    console.log(`   Previous: ${song.previousScore.toFixed(3)} → Current: ${song.currentScore.toFixed(3)}`);
    console.log(`   Increase: +${song.absoluteIncrease.toFixed(3)}`);
    console.log('');
  });
}
