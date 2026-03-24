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

// Collect all songs
const allSongs = [];
allCountryData.forEach(countryData => {
  const country = countryData.country;

  if (countryData.popularSongs) {
    countryData.popularSongs.forEach(song => {
      allSongs.push({ ...song, country, tab: 'Popular' });
    });
  }

  if (countryData.breakoutSongs) {
    countryData.breakoutSongs.forEach(song => {
      allSongs.push({ ...song, country, tab: 'Breakout' });
    });
  }
});

// Calculate 24h change for each
const songsWithChange = allSongs.map(song => {
  const change = notifier.calculate24HourChange(song);
  return {
    title: song.title,
    artist: song.artist,
    country: song.country,
    change24h: change,
    changeDisplay: notifier.get24HourUsage(song).display
  };
}).filter(s => s.change24h !== -Infinity && s.change24h !== Infinity);

// Sort by 24h change
songsWithChange.sort((a, b) => b.change24h - a.change24h);

// Find songs with 10%+ growth
const highGrowth = songsWithChange.filter(s => s.change24h >= 10);

console.log('\n' + '='.repeat(70));
console.log('SONGS WITH 10%+ GROWTH IN LAST 24 HOURS');
console.log('='.repeat(70));
console.log('\nTotal found:', highGrowth.length);
console.log('Total songs analyzed:', songsWithChange.length);
console.log('');

if (highGrowth.length > 0) {
  console.log('Top 30 songs with highest 24h growth:\n');
  highGrowth.slice(0, 30).forEach((song, i) => {
    const countryName = notifier.getCountryName(song.country);
    console.log(`${i + 1}. ${song.title} - ${song.artist}`);
    console.log(`   Country: ${countryName}`);
    console.log(`   24h Growth: ${song.changeDisplay}`);
    console.log('');
  });
} else {
  console.log('❌ No songs found with 10%+ growth\n');
  console.log('Top 10 by growth:\n');
  songsWithChange.slice(0, 10).forEach((song, i) => {
    const countryName = notifier.getCountryName(song.country);
    console.log(`${i + 1}. ${song.title} - ${song.artist}`);
    console.log(`   Country: ${countryName}`);
    console.log(`   24h Growth: ${song.changeDisplay}`);
    console.log('');
  });
}
