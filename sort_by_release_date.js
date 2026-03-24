#!/usr/bin/env node

/**
 * Sort trending songs by release date to find viral old songs
 * Usage: node sort_by_release_date.js <file.json>
 */

const fs = require('fs');
const path = require('path');

function getAgeCategory(releaseDate) {
  if (!releaseDate) return 'Unknown';

  const released = new Date(releaseDate);
  const now = new Date();
  const monthsOld = (now - released) / (1000 * 60 * 60 * 24 * 30);

  // Check if released this month
  const releasedMonth = released.getMonth();
  const releasedYear = released.getFullYear();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  if (releasedMonth === currentMonth && releasedYear === currentYear) {
    return 'This Month';
  }

  if (monthsOld < 3) return 'Brand New';
  if (monthsOld < 6) return 'Recent';
  if (monthsOld < 12) return 'This Year';
  if (monthsOld < 24) return 'Last Year';
  return 'Catalog';
}

function formatDate(dateStr) {
  if (!dateStr) return 'No date';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}

function analyzeFile(filePath, options = {}) {
  console.log(`\n${path.basename(filePath)}\n`);

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (!data.songs || data.songs.length === 0) {
    console.log('No songs found\n');
    return;
  }

  const { onlyThisMonth = false } = options;

  // Sort by release date (oldest first)
  const sorted = [...data.songs].sort((a, b) => {
    if (!a.release_date && !b.release_date) return 0;
    if (!a.release_date) return 1;
    if (!b.release_date) return -1;
    return new Date(a.release_date) - new Date(b.release_date);
  });

  // Group by category (ordered from newest to oldest)
  const categories = {
    'This Month': [],
    'Brand New': [],
    'Recent': [],
    'This Year': [],
    'Last Year': [],
    'Catalog': [],
    'Unknown': []
  };

  sorted.forEach(song => {
    const category = getAgeCategory(song.release_date);
    categories[category].push(song);
  });

  // Display results by category
  Object.keys(categories).forEach(category => {
    const songs = categories[category];
    if (songs.length === 0) return;

    // If only showing this month, skip other categories
    if (onlyThisMonth && category !== 'This Month') return;

    // Highlight "This Month" releases
    const header = category === 'This Month'
      ? `\n🆕 ${category.toUpperCase()} (${songs.length})`
      : `\n${category} (${songs.length})`;

    console.log(header);
    console.log('─'.repeat(70));

    songs.forEach(song => {
      const rank = song.rank || song.position || '?';
      const date = formatDate(song.release_date);
      const title = song.title.substring(0, 35).padEnd(35);

      console.log(`#${rank.toString().padStart(3)} ${title} ${date}`);
    });
  });

  // Show summary if not filtering
  if (!onlyThisMonth) {
    // Highlight viral old songs
    const viralOld = sorted.filter(song => {
      const category = getAgeCategory(song.release_date);
      const hasGrowth = (song.daily_change && song.daily_change > 2) || (song.weekly_change && song.weekly_change > 5);
      return (category === 'Catalog' || category === 'Last Year') && hasGrowth;
    });

    if (viralOld.length > 0) {
      console.log('\n\n🔥 VIRAL OLD SONGS');
      console.log('─'.repeat(70));
      viralOld.forEach(song => {
        const date = formatDate(song.release_date);
        console.log(`${song.title} - ${song.artist}`);
        console.log(`  ${date} | Rank #${song.rank || song.position}\n`);
      });
    }

    // Summary
    const thisMonthCount = categories['This Month'].length;
    if (thisMonthCount > 0) {
      console.log(`\n💡 ${thisMonthCount} new release${thisMonthCount > 1 ? 's' : ''} this month`);
    }
  }

  console.log('');
}

// Main
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help') {
  console.log('\nUsage:');
  console.log('  node sort_by_release_date.js <file.json>              # All songs by age');
  console.log('  node sort_by_release_date.js <file.json> --new        # Only this month\n');
  console.log('Examples:');
  console.log('  node sort_by_release_date.js data/trending_music_with_trends_US.json');
  console.log('  node sort_by_release_date.js data/trending_music_with_trends_US.json --new\n');
  process.exit(0);
}

const onlyThisMonth = args.includes('--new') || args.includes('--this-month');
const filePath = args.find(arg => !arg.startsWith('--'));

if (!filePath || !fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath || 'No file specified'}`);
  process.exit(1);
}

analyzeFile(filePath, { onlyThisMonth });
