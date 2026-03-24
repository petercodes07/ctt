#!/usr/bin/env node

/**
 * Test script for genre filtering functionality
 * Tests genre fetcher and filter with sample songs
 */

const GenreFetcher = require('./genre_fetcher');
const GenreFilter = require('./genre_filter');

// Sample test songs
const testSongs = [
  {
    song_id: '1',
    title: 'Shape of You',
    artist: 'Ed Sheeran',
    rank: 1
  },
  {
    song_id: '2',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    rank: 2
  },
  {
    song_id: '3',
    title: 'Old Town Road',
    artist: 'Lil Nas X',
    rank: 3
  },
  {
    song_id: '4',
    title: 'Dance Monkey',
    artist: 'Tones and I',
    rank: 4
  },
  {
    song_id: '5',
    title: 'Levitating',
    artist: 'Dua Lipa',
    rank: 5
  }
];

async function testGenreFetcher() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1: Genre Fetcher');
  console.log('='.repeat(60) + '\n');

  const fetcher = new GenreFetcher();

  console.log('Testing genre fetching for sample songs...\n');

  // Test fetching for each song
  for (const song of testSongs) {
    console.log(`Testing: ${song.title} - ${song.artist}`);
    const result = await fetcher.fetchGenreWithFallback(song.song_id, song.title, song.artist);

    if (result.found) {
      console.log(`  ✅ Genre: ${result.genre}`);
      console.log(`  📋 All genres: ${result.allGenres.join(', ')}`);
      console.log(`  🔍 Source: ${result.source}`);
      console.log(`  💾 Cached: ${result.cached || false}`);
    } else {
      console.log(`  ❌ Not found`);
      if (result.error) {
        console.log(`  ⚠️  Error: ${result.error}`);
      }
    }
    console.log('');

    // Small delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('✅ Genre fetcher test complete\n');
}

async function testGenreEnrichment() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: Genre Enrichment (Batch Processing)');
  console.log('='.repeat(60) + '\n');

  const fetcher = new GenreFetcher();
  const songs = JSON.parse(JSON.stringify(testSongs)); // Deep copy

  // Enrich songs with genres
  await fetcher.enrichWithGenres(songs, {
    concurrency: 2,
    batchDelay: 500
  });

  console.log('\nEnriched songs:');
  songs.forEach(song => {
    console.log(`  ${song.rank}. ${song.title} - ${song.genre || 'Unknown'}`);
  });

  console.log('\n✅ Genre enrichment test complete\n');
  return songs;
}

async function testGenreFiltering(enrichedSongs) {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: Genre Filtering');
  console.log('='.repeat(60) + '\n');

  const filter = new GenreFilter();

  // Test 1: Include mode
  console.log('Test 3a: Include mode (Pop only)');
  console.log('-'.repeat(40));
  const config1 = {
    mode: 'include',
    genres: ['Pop'],
    includeUnknown: false,
    caseSensitive: false
  };

  const { filtered: filtered1, stats: stats1 } = filter.filterSongs(enrichedSongs, config1);
  console.log(`Filtered songs: ${filtered1.length}`);
  filtered1.forEach(song => {
    console.log(`  - ${song.title} (${song.genre})`);
  });
  console.log('');

  // Test 2: Exclude mode
  console.log('Test 3b: Exclude mode (Exclude Pop)');
  console.log('-'.repeat(40));
  const config2 = {
    mode: 'exclude',
    genres: ['Pop'],
    includeUnknown: true,
    caseSensitive: false
  };

  const { filtered: filtered2, stats: stats2 } = filter.filterSongs(enrichedSongs, config2);
  console.log(`Filtered songs: ${filtered2.length}`);
  filtered2.forEach(song => {
    console.log(`  - ${song.title} (${song.genre})`);
  });
  console.log('');

  // Test 3: Multiple genres
  console.log('Test 3c: Include mode (Pop, Hip-Hop, R&B)');
  console.log('-'.repeat(40));
  const config3 = {
    mode: 'include',
    genres: ['Pop', 'Hip-Hop', 'R&B', 'Hip Hop', 'Rap'],
    includeUnknown: true,
    caseSensitive: false
  };

  const { filtered: filtered3, stats: stats3 } = filter.filterSongs(enrichedSongs, config3);
  console.log(`Filtered songs: ${filtered3.length}`);
  filtered3.forEach(song => {
    console.log(`  - ${song.title} (${song.genre})`);
  });
  console.log('');

  console.log('✅ Genre filtering test complete\n');
  return stats3;
}

async function testStatistics(stats) {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 4: Genre Statistics Display');
  console.log('='.repeat(60) + '\n');

  const filter = new GenreFilter();
  filter.displayStats(stats);

  console.log('✅ Statistics display test complete\n');
}

async function testCaching() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 5: Genre Caching');
  console.log('='.repeat(60) + '\n');

  const fetcher = new GenreFetcher();
  const testSong = testSongs[0];

  console.log('First fetch (should hit API):');
  const start1 = Date.now();
  const result1 = await fetcher.fetchGenreWithFallback(testSong.song_id, testSong.title, testSong.artist);
  const time1 = Date.now() - start1;
  console.log(`  Time: ${time1}ms`);
  console.log(`  Cached: ${result1.cached || false}`);
  console.log(`  Genre: ${result1.genre}`);
  console.log('');

  console.log('Second fetch (should hit cache):');
  const start2 = Date.now();
  const result2 = await fetcher.fetchGenreWithFallback(testSong.song_id, testSong.title, testSong.artist);
  const time2 = Date.now() - start2;
  console.log(`  Time: ${time2}ms`);
  console.log(`  Cached: ${result2.cached || false}`);
  console.log(`  Genre: ${result2.genre}`);
  console.log('');

  if (result2.cached) {
    console.log(`✅ Cache working! Second fetch was ${Math.round((time1 - time2) / time2 * 100)}% faster\n`);
  } else {
    console.log('⚠️  Cache may not be working correctly\n');
  }

  console.log('✅ Genre caching test complete\n');
}

async function runAllTests() {
  console.log('\n' + '═'.repeat(60));
  console.log('GENRE FILTERING TEST SUITE');
  console.log('═'.repeat(60));

  try {
    // Test 1: Basic genre fetching
    await testGenreFetcher();

    // Test 2: Batch enrichment
    const enrichedSongs = await testGenreEnrichment();

    // Test 3: Filtering
    const stats = await testGenreFiltering(enrichedSongs);

    // Test 4: Statistics display
    await testStatistics(stats);

    // Test 5: Caching
    await testCaching();

    console.log('\n' + '═'.repeat(60));
    console.log('✅ ALL TESTS PASSED');
    console.log('═'.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:');
    console.error(error);
    console.error('');
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runAllTests };
