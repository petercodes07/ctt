#!/usr/bin/env node

/**
 * Genre Filter for TikTok Music Scraper
 * Filters songs by genre and calculates statistics
 */

const fs = require('fs');
const path = require('path');

class GenreFilter {
  constructor() {
    this.defaultConfig = {
      mode: 'include',
      genres: [],
      includeUnknown: true,
      caseSensitive: false
    };
  }

  /**
   * Load configuration from file
   */
  loadConfig(configPath) {
    try {
      const data = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(data);

      // Merge with defaults
      return {
        ...this.defaultConfig,
        ...config
      };
    } catch (error) {
      console.warn(`⚠️  Failed to load config from ${configPath}: ${error.message}`);
      return this.defaultConfig;
    }
  }

  /**
   * Parse config from command-line arguments
   */
  parseCliConfig(args) {
    const config = { ...this.defaultConfig };

    // --genre-include "Pop,Hip-Hop,R&B"
    const includeIndex = args.indexOf('--genre-include');
    if (includeIndex !== -1 && args[includeIndex + 1]) {
      config.mode = 'include';
      config.genres = args[includeIndex + 1].split(',').map(g => g.trim());
    }

    // --genre-exclude "Country,Classical"
    const excludeIndex = args.indexOf('--genre-exclude');
    if (excludeIndex !== -1 && args[excludeIndex + 1]) {
      config.mode = 'exclude';
      config.genres = args[excludeIndex + 1].split(',').map(g => g.trim());
    }

    // --genre-config genre_config.json
    const configIndex = args.indexOf('--genre-config');
    if (configIndex !== -1 && args[configIndex + 1]) {
      return this.loadConfig(args[configIndex + 1]);
    }

    // --include-unknown / --exclude-unknown
    if (args.includes('--exclude-unknown')) {
      config.includeUnknown = false;
    }
    if (args.includes('--include-unknown')) {
      config.includeUnknown = true;
    }

    // --case-sensitive
    if (args.includes('--case-sensitive')) {
      config.caseSensitive = true;
    }

    return config;
  }

  /**
   * Check if a genre matches the filter criteria
   */
  matchesFilter(genre, config) {
    // Handle unknown genre
    if (genre === 'Unknown' || !genre) {
      return config.includeUnknown;
    }

    // Normalize for comparison
    const normalizedGenre = config.caseSensitive ? genre : genre.toLowerCase();
    const normalizedFilterGenres = config.caseSensitive
      ? config.genres
      : config.genres.map(g => g.toLowerCase());

    const isInList = normalizedFilterGenres.includes(normalizedGenre);

    // Include mode: genre must be in the list
    if (config.mode === 'include') {
      return isInList;
    }

    // Exclude mode: genre must NOT be in the list
    if (config.mode === 'exclude') {
      return !isInList;
    }

    return true; // No filter
  }

  /**
   * Filter songs by genre
   */
  filterSongs(songs, config) {
    // Validate config
    if (!config || !config.genres || config.genres.length === 0) {
      console.warn('⚠️  No genre filter configured, returning all songs');
      const stats = this.calculateStats(songs, { ...this.defaultConfig, genres: [] });
      return { filtered: songs, stats };
    }

    const filtered = songs.filter(song => this.matchesFilter(song.genre, config));

    // Calculate statistics
    const stats = this.calculateStats(filtered, config, songs.length);

    // Display warning if no songs match
    if (filtered.length === 0) {
      console.warn('');
      console.warn('⚠️  WARNING: No songs matched genre filter!');
      console.warn('    Filter mode:', config.mode);
      console.warn('    Genres:', config.genres.join(', '));
      console.warn('    Consider broadening your filter or disabling it.');
      console.warn('');
    }

    return { filtered, stats };
  }

  /**
   * Calculate genre statistics
   */
  calculateStats(songs, config, totalScraped = null) {
    const distribution = {};

    // Count songs by genre
    songs.forEach(song => {
      const genre = song.genre || 'Unknown';

      if (!distribution[genre]) {
        distribution[genre] = {
          count: 0,
          songs: [],
          ranks: []
        };
      }

      distribution[genre].count++;
      distribution[genre].ranks.push(song.rank || 999);

      // Store top 3 songs per genre
      if (distribution[genre].songs.length < 3) {
        distribution[genre].songs.push({
          rank: song.rank,
          title: song.title,
          artist: song.artist
        });
      }
    });

    // Calculate percentages and averages
    Object.keys(distribution).forEach(genre => {
      const data = distribution[genre];
      data.percentage = parseFloat(((data.count / songs.length) * 100).toFixed(1));
      data.avg_rank = parseFloat((data.ranks.reduce((a, b) => a + b, 0) / data.ranks.length).toFixed(1));

      // Keep only top song for final output
      data.top_song = data.songs[0];
      delete data.songs;
      delete data.ranks;
    });

    return {
      total_songs_scraped: totalScraped || songs.length,
      total_songs_after_filter: songs.length,
      filter_applied: {
        mode: config.mode,
        genres: config.genres,
        includeUnknown: config.includeUnknown
      },
      distribution: distribution
    };
  }

  /**
   * Display genre statistics in console
   */
  displayStats(stats) {
    console.log('');
    console.log('📊 GENRE STATISTICS');
    console.log('═══════════════════════════════════════════════════════');

    if (stats.total_songs_scraped !== stats.total_songs_after_filter) {
      const removed = stats.total_songs_scraped - stats.total_songs_after_filter;
      console.log(`Total songs scraped: ${stats.total_songs_scraped}`);
      console.log(`Songs after filtering: ${stats.total_songs_after_filter} (${removed} removed)`);
    } else {
      console.log(`Total songs: ${stats.total_songs_after_filter}`);
    }

    console.log('');

    // Sort genres by count (descending)
    const sortedGenres = Object.entries(stats.distribution)
      .sort(([, a], [, b]) => b.count - a.count);

    if (sortedGenres.length === 0) {
      console.log('No songs found.');
    } else {
      console.log('Genre Distribution:');

      sortedGenres.forEach(([genre, data]) => {
        const emoji = this.getGenreEmoji(genre);
        const genreName = genre.padEnd(20);
        const count = `${data.count} songs`.padEnd(12);
        const percentage = `(${data.percentage}%)`.padEnd(8);
        const avgRank = `Avg Rank: #${data.avg_rank}`;

        console.log(`  ${emoji} ${genreName} ${count} ${percentage} ${avgRank}`);
      });
    }

    // Show filter info
    if (stats.filter_applied && stats.filter_applied.genres.length > 0) {
      console.log('');
      const filterMode = stats.filter_applied.mode === 'include' ? 'Include' : 'Exclude';
      const filterGenres = stats.filter_applied.genres.join(', ');
      console.log(`Filter: ${filterMode} [${filterGenres}]`);

      if (!stats.filter_applied.includeUnknown) {
        console.log('Unknown genres: Excluded');
      }
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('');
  }

  /**
   * Get emoji for genre
   */
  getGenreEmoji(genre) {
    const emojiMap = {
      'Pop': '🎵',
      'Hip-Hop': '🎤',
      'Hip Hop': '🎤',
      'Rap': '🎤',
      'R&B': '🎶',
      'RnB': '🎶',
      'Electronic': '🎧',
      'Dance': '💃',
      'Rock': '🎸',
      'Country': '🤠',
      'Jazz': '🎺',
      'Classical': '🎻',
      'Reggae': '🌴',
      'Latin': '💃',
      'K-Pop': '🇰🇷',
      'J-Pop': '🇯🇵',
      'Indie': '✨',
      'Alternative': '🎭',
      'Metal': '🤘',
      'Folk': '🪕',
      'Blues': '🎹',
      'Soul': '🎶',
      'Funk': '🕺',
      'Unknown': '❓'
    };

    return emojiMap[genre] || '🎵';
  }

  /**
   * Save statistics to JSON file
   */
  async saveStatsToFile(stats, filepath) {
    const fs = require('fs').promises;
    await fs.writeFile(filepath, JSON.stringify(stats, null, 2), 'utf-8');
    console.log(`📊 Genre stats saved to ${filepath}`);
  }
}

module.exports = GenreFilter;

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log('\nGenre Filter - Test filtering logic\n');
    console.log('Usage:');
    console.log('  node genre_filter.js <data.json> --genre-include "Pop,Hip-Hop"');
    console.log('  node genre_filter.js <data.json> --genre-exclude "Country,Classical"');
    console.log('  node genre_filter.js <data.json> --genre-config genre_config.json\n');
    console.log('Options:');
    console.log('  --genre-include <genres>    Include only these genres (comma-separated)');
    console.log('  --genre-exclude <genres>    Exclude these genres (comma-separated)');
    console.log('  --genre-config <file>       Load config from JSON file');
    console.log('  --exclude-unknown           Exclude songs with unknown genre');
    console.log('  --case-sensitive            Case-sensitive genre matching\n');
    process.exit(0);
  }

  const filter = new GenreFilter();
  const dataPath = args[0];

  (async () => {
    try {
      // Load data
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      const songs = data.songs || data;

      console.log(`\nLoaded ${songs.length} songs from ${dataPath}\n`);

      // Parse config from CLI
      const config = filter.parseCliConfig(args);

      console.log('Filter Configuration:');
      console.log(`  Mode: ${config.mode}`);
      console.log(`  Genres: ${config.genres.join(', ') || 'none'}`);
      console.log(`  Include Unknown: ${config.includeUnknown}`);
      console.log(`  Case Sensitive: ${config.caseSensitive}`);

      // Apply filter
      const { filtered, stats } = filter.filterSongs(songs, config);

      console.log(`\nFiltered: ${filtered.length} songs\n`);

      // Display stats
      filter.displayStats(stats);

    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })();
}
