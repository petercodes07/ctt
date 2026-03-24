#!/usr/bin/env node

/**
 * Enrich songs with genre data and filter for pop
 */

const GenreFetcher = require('./genre_fetcher');
const GenreFilter = require('./genre_filter');
const fs = require('fs').promises;

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: node enrich_and_filter_pop.js <json_file>');
    console.log('Example: node enrich_and_filter_pop.js data/trending_music_with_trends_USA_breakout.json');
    process.exit(1);
  }

  const inputFile = args[0];

  try {
    // Load JSON file
    console.log(`📂 Loading ${inputFile}...`);
    const data = JSON.parse(await fs.readFile(inputFile, 'utf-8'));
    const songs = data.songs || [];

    console.log(`✅ Loaded ${songs.length} songs\n`);

    // Enrich with genres
    const fetcher = new GenreFetcher();
    await fetcher.enrichWithGenres(songs, {
      concurrency: 3,
      batchDelay: 1000,
      showProgress: true
    });

    // Filter for pop
    const filter = new GenreFilter();
    const config = {
      mode: 'include',
      genres: ['Pop', 'Dance Pop', 'Indie Pop', 'Electropop', 'Synth-pop', 'K-Pop'],
      includeUnknown: false,
      caseSensitive: false
    };

    const { filtered, stats } = filter.filterSongs(songs, config);

    console.log('\n' + '='.repeat(60));
    console.log('🎵 POP SONGS');
    console.log('='.repeat(60) + '\n');

    filtered.forEach((song, idx) => {
      console.log(`${idx + 1}. ${song.title} - ${song.artist}`);
      console.log(`   Genre: ${song.genre || 'Unknown'}`);
      console.log(`   Rank: #${song.rank}`);
      console.log('');
    });

    console.log(`Total pop songs: ${filtered.length}/${songs.length}`);

    // Display stats
    filter.displayStats(stats);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
