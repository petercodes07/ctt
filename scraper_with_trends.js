#!/usr/bin/env node

/**
 * TikTok Music Scraper with TREND CHART DATA
 * Extracts the 7-day trend graph data for each song
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const CookieLoader = require('./cookie_loader');
const ScanHistory = require('./scan_history');
const YouTubeFetcher = require('./youtube_fetcher');
const GenreFetcher = require('./genre_fetcher');
const GenreFilter = require('./genre_filter');

class TikTokMusicScraperWithTrends {
  constructor() {
    this.url = 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en';
    this.dataDir = 'data';
    this.scanHistory = new ScanHistory();
    this.youtubeFetcher = new YouTubeFetcher();
    this.genreFetcher = new GenreFetcher();
    this.genreFilter = new GenreFilter();
    this.genreStats = null;

    // Load country code to name mapping
    try {
      const countriesData = require('./countries.json');
      this.countryMap = new Map(
        countriesData.countries.map(c => [c.code, c.name])
      );
    } catch (e) {
      this.countryMap = new Map();
    }
  }

  getCountryName(code) {
    return this.countryMap.get(code) || code;
  }

  async ensureDataDir() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {}
  }

  // Fetch release date from Deezer API
  async fetchReleaseDate(title, artist) {
    return new Promise((resolve) => {
      const query = `${title} ${artist}`.replace(/[^\w\s]/g, '');
      const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1`;

      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', async () => {
          try {
            const result = JSON.parse(data);
            if (result.data && result.data.length > 0) {
              const track = result.data[0];
              if (track.album && track.album.id) {
                const albumUrl = `https://api.deezer.com/album/${track.album.id}`;
                https.get(albumUrl, (albumRes) => {
                  let albumData = '';
                  albumRes.on('data', (chunk) => { albumData += chunk; });
                  albumRes.on('end', () => {
                    try {
                      const album = JSON.parse(albumData);
                      resolve(album.release_date || null);
                    } catch (e) {
                      resolve(null);
                    }
                  });
                }).on('error', () => resolve(null));
              } else {
                resolve(null);
              }
            } else {
              resolve(null);
            }
          } catch (e) {
            resolve(null);
          }
        });
      }).on('error', () => resolve(null));
    });
  }

  async enrichWithReleaseDates(songs) {
    console.log('');
    console.log('⏳ Fetching release dates...');

    let found = 0;
    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      const releaseDate = await this.fetchReleaseDate(song.title, song.artist);

      if (releaseDate) {
        song.release_date = releaseDate;
        const year = releaseDate.split('-')[0];
        process.stdout.write(`✓ ${(i + 1).toString().padStart(2)}/${songs.length} ${song.title.substring(0, 30).padEnd(30)} ${year}\n`);
        found++;
      }

      // Rate limiting
      if (i % 10 === 0 && i > 0) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    console.log(`✅ Found ${found}/${songs.length} release dates\n`);
    return songs;
  }

  async enrichWithYouTubeLinks(songs, limit = 50) {
    return await this.youtubeFetcher.enrichWithYouTubeLinks(songs, {
      limit,
      skipExisting: true
    });
  }

  async scrapeMusic(maxSongs = 50, options = {}) {
    const {
      headless = true,
      tab = 'popular',
      country = 'US',
      newToTop100 = false,
      newFromHistory = false,
      newFromHistoryDays = 7,
      approvedForBusiness = false,
      searchQuery = null,
      cookiesFile = null,
      fetchDates = true,
      genreConfig = null
    } = options;

    console.log(`🎵 TikTok Music Scraper - ${tab === 'breakout' ? 'BREAKOUT' : 'POPULAR'} tab`);
    console.log(`🌍 Region: ${country} | Target: ${maxSongs} songs`);
    if (searchQuery) console.log(`🔍 Search: "${searchQuery}"`);
    if (newToTop100) console.log(`🆕 Filter: New to top 100`);
    if (newFromHistory) console.log(`🆕 History filter: unseen in previous ${newFromHistoryDays} days`);
    if (approvedForBusiness) console.log(`✅ Filter: Approved for business use`);
    console.log('');

    console.log('⏳ [Step 1/5] Launching headless browser...');
    const browser = await chromium.launch({ headless });

    // Load cookies if provided
    let cookies = [];
    if (cookiesFile) {
      cookies = await CookieLoader.loadFromFile(cookiesFile);
    }

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      viewport: { width: 1920, height: 800 }  // Smaller height to force scrolling
    });

    // Add cookies to context
    if (cookies.length > 0) {
      await context.addCookies(cookies);
      console.log(`   🍪 Added ${cookies.length} authentication cookies`);
    }

    const page = await context.newPage();
    console.log('   ✅ Browser ready');
    const apiResponses = [];

    // Capture API responses
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('api')) {
        // console.log(`📡 Intercepted: ${url.substring(0, 100)}...`);
      }
      if (url.includes('/creative_radar_api/v1/popular_trend/sound/rank_list')) {
        try {
          const data = await response.json();
          const pageParam = url.match(/page=(\d+)/)?.[1] || '?';
          const limitParam = url.match(/limit=(\d+)/)?.[1] || '?';
          console.log(`📡 Captured trend API: page=${pageParam}, limit=${limitParam}`);
          apiResponses.push(data);
        } catch (e) {}
      }
    });

    const songs = [];

    try {
      console.log('');
      console.log('⏳ [Step 2/5] Loading TikTok Creative Center...');
      await page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(3000);
      console.log('   ✅ Page loaded');

      // Handle region selection
      console.log('');
      console.log('⏳ [Step 3/5] Setting up filters and region...');
      const countryName = this.getCountryName(country);
      console.log(`   🌍 Selecting region: ${country} (${countryName})...`);
      try {
        const regionSelector = await page.$('[class*="bannerRegionsSelectLabel"]');
        if (regionSelector) {
          const regionText = await regionSelector.textContent();

          // Check if we need to select a region (check both code and name)
          if (regionText && (regionText.includes('Please Select') ||
              (!regionText.includes(country) && !regionText.includes(countryName)))) {
            await regionSelector.click();
            console.log('   Opened region dropdown');
            await page.waitForTimeout(2000);

            // Try multiple selectors for dropdown options
            let options = [];
            const optionSelectors = [
              '[role="option"]',
              '[class*="option"]',
              '[class*="Option"]',
              '[class*="MenuItem"]',
              '[class*="menuItem"]',
              'div[class*="select"] > div',
              'ul[role="listbox"] > li',
              '[data-id]'
            ];

            for (const selector of optionSelectors) {
              options = await page.$$(selector);
              if (options.length > 0) {
                console.log(`   Found ${options.length} regions using: ${selector}`);
                break;
              }
            }

            // If still no options, wait a bit more and try again
            if (options.length === 0) {
              await page.waitForTimeout(2000);
              for (const selector of optionSelectors) {
                options = await page.$$(selector);
                if (options.length > 0) {
                  console.log(`   Found ${options.length} regions using: ${selector} (2nd attempt)`);
                  break;
                }
              }
            }

            let found = false;
            if (options.length > 0) {
              for (const option of options) {
                try {
                  const optionText = await option.evaluate(el => {
                    return el.getAttribute('data-id') ||
                           el.getAttribute('data-value') ||
                           el.textContent;
                  });

                  // Match against both country code and full country name
                  if (optionText && (
                    optionText === country ||
                    optionText === countryName ||
                    optionText.includes(countryName) ||
                    optionText.includes(country)
                  )) {
                    await option.click();
                    console.log(`✅ Selected: ${countryName} (${country})`);
                    found = true;
                    await page.waitForTimeout(4000); // Wait for API call
                    break;
                  }
                } catch (e) {
                  // Continue searching
                }
              }

              if (!found) {
                console.log(`⚠️  Could not find country: ${countryName} (${country}), using first available`);
                await options[0].click();
                await page.waitForTimeout(4000);
              }
            } else {
              console.log(`⚠️  No dropdown options found, continuing with default region`);
            }
          } else {
            console.log(`✅ Region already set to ${regionText.trim()} (matches ${countryName})`);
          }
        }
      } catch (e) {
        console.log(`⚠️  Region selection error: ${e.message}`);
      }

      // Switch to Breakout tab if requested
      if (tab === 'breakout') {
        console.log('🔄 Switching to Breakout tab...');
        try {
          const breakoutTab = await page.$('[data-testid="cc_commonCom_tabChange_1"]');
          if (breakoutTab) {
            await breakoutTab.click();
            await page.waitForTimeout(5000);
            console.log('✅ Switched to Breakout');
          }
        } catch (e) {}
      }

      // Apply "New to top 100" filter if requested
      if (newToTop100) {
        console.log('🆕 Applying "New to top 100" filter...');
        try {
          // Find the checkbox by looking for the label and clicking its parent
          const checkbox = await page.locator('text="New to top 100"').locator('..').first();
          await checkbox.click({ force: true });
          await page.waitForTimeout(3000);
          console.log('✅ Filter applied');
        } catch (e) {
          console.log(`⚠️  Could not apply filter: ${e.message}`);
        }
      }

      // Apply "Approved for business use" filter if requested
      if (approvedForBusiness) {
        console.log('✅ Applying "Approved for business use" filter...');
        try {
          const checkbox = await page.locator('text="Approved for business use"').locator('..').first();
          await checkbox.click({ force: true });
          await page.waitForTimeout(3000);
          console.log('✅ Filter applied');
        } catch (e) {
          console.log(`⚠️  Could not apply filter: ${e.message}`);
        }
      }

      // Perform search if query provided
      if (searchQuery) {
        console.log(`🔍 Searching for: "${searchQuery}"...`);
        try {
          // Click search button to reveal input
          const searchButton = await page.locator('text="Search"').first();
          await searchButton.click();
          await page.waitForTimeout(2000);
          console.log('   Opened search input');

          // Type search query slowly (character by character to trigger autocomplete)
          const searchInput = await page.locator('input[placeholder*="Search"]').first();
          await searchInput.click();
          await searchInput.type(searchQuery, { delay: 100 }); // Type with delay
          await page.waitForTimeout(2000); // Wait for autocomplete
          console.log('   Typed search query, checking for autocomplete...');

          // Look for autocomplete suggestions - try multiple times with different selectors
          let clicked = false;
          const autocompleteSelectors = [
            '[class*="RelatedSearchItem_title"]',  // TikTok's autocomplete item class
            'span[class*="RelatedSearchItem"]',
            'div[class*="RelatedSearchItem"]',
            'div[class*="dropdown"] div',
            'div[class*="suggestion"] div',
            'ul[class*="autocomplete"] li',
            'div[role="listbox"] div[role="option"]',
            'div[class*="SearchList"]',
            'div[class*="searchResult"]',
            'div[class*="MenuItem"]',
            'li[class*="item"]'
          ];

          for (const selector of autocompleteSelectors) {
            try {
              const suggestions = await page.$$(selector);

              // Filter suggestions to find visible, clickable ones with text
              const validSuggestions = [];
              for (const suggestion of suggestions) {
                const isVisible = await suggestion.isVisible().catch(() => false);
                const text = await suggestion.textContent().catch(() => '');
                if (isVisible && text && text.trim().length > 0 && text.trim().length < 200) {
                  validSuggestions.push({ element: suggestion, text: text.trim() });
                }
              }

              if (validSuggestions.length > 0) {
                console.log(`   Found ${validSuggestions.length} autocomplete items using: ${selector}`);
                console.log(`   First suggestion: "${validSuggestions[0].text}"`);

                // Click first suggestion
                await validSuggestions[0].element.click({ force: true });
                await page.waitForTimeout(5000);
                console.log('   ✅ Clicked autocomplete suggestion');
                clicked = true;
                break;
              }
            } catch (e) {
              // Continue to next selector
            }
          }

          // If no autocomplete found, press Enter as fallback
          if (!clicked) {
            console.log('   ⚠️  No autocomplete detected, pressing Enter as fallback...');
            await searchInput.press('Enter');
            await page.waitForTimeout(3000);
          }

          console.log('✅ Search completed');
        } catch (e) {
          console.log(`⚠️  Search error: ${e.message}`);
        }
      }

      await page.waitForTimeout(5000);
      console.log('   ✅ Filters applied');

      // Wait for initial API data
      console.log('');
      console.log('⏳ [Step 4/5] Fetching song data...');
      console.log('   ⏳ Waiting for TikTok API responses...');
      let waitCount = 0;
      while (apiResponses.length === 0 && waitCount < 10) {
        await page.waitForTimeout(1000);
        waitCount++;
      }
      console.log(`   ✅ Connected to API (${apiResponses.length} initial responses)`);
      console.log('');

      // Load more songs using optimized infinite scroll
      console.log('   📜 Loading songs using fast infinite scroll...');

      let previousSongCount = 0;
      let currentSongCount = 0;
      let previousApiCount = apiResponses.length;
      let stuckCount = 0;
      const maxAttempts = 50;
      const minAttempts = 10; // Always try at least 10 times

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Count currently rendered song cards
        currentSongCount = await page.evaluate(() => {
          // Try multiple selectors for song cards
          const selectors = [
            '[class*="soundItemContainer"]',
            '[class*="MusicItem_container"]',
            '[class*="ItemContainer"]',
            '[class*="Card_container"]'
          ];
          for (const selector of selectors) {
            const count = document.querySelectorAll(selector).length;
            if (count > 0) return count;
          }
          return 0;
        });

        // Check if we have enough songs
        if (currentSongCount >= maxSongs) {
          console.log(`   ✅ Target reached: ${currentSongCount} songs`);
          break;
        }

        // Check if we're making progress (either DOM or API)
        const currentApiCount = apiResponses.length;
        if (currentSongCount === previousSongCount && currentApiCount === previousApiCount) {
          stuckCount++;
          // Only exit if stuck AND we've tried enough times
          if (stuckCount >= 4 && attempt >= minAttempts) {
            console.log(`   ⚠️  No new data after ${stuckCount} attempts - reached end`);
            break;
          }
        } else {
          if (currentSongCount !== previousSongCount) {
            console.log(`   📊 Songs loaded: ${currentSongCount}/${maxSongs}`);
          }
          stuckCount = 0;
          previousSongCount = currentSongCount;
          previousApiCount = currentApiCount;
        }

        // Check for "View More" button and click it
        await page.evaluate(() => {
          const viewMoreSelectors = [
            '[class*="ViewMoreBtn"]',
            '[class*="viewMoreBtn"]',
            '[class*="ViewMore"]'
          ];
          for (const selector of viewMoreSelectors) {
            const btn = document.querySelector(selector);
            if (btn && btn.offsetParent !== null) {
              btn.click();
              return true;
            }
          }
          // Fallback by text
          const buttons = Array.from(document.querySelectorAll('button'));
          const viewMoreBtn = buttons.find(b => {
             const txt = b.innerText.toLowerCase();
             return txt.includes("view more") || txt.includes("see more");
          });
          if (viewMoreBtn) {
             viewMoreBtn.click();
             return true;
          }
          return false;
        });

        // Aggressive scroll to trigger loading
        await page.evaluate(() => {
          window.scrollBy(0, 2000); // Larger scroll
        });

        // Wait for API call to trigger and respond (3s for reliability on slow connections)
        await page.waitForTimeout(3000);
      }

      console.log(`   ✅ Load complete: ${currentSongCount} songs`);

      // Merge API data with trend info
      console.log('');
      console.log('⏳ [Step 5/5] Processing and organizing song data...');
      const songMap = new Map();

      // Process API responses
      let totalProcessed = 0;
      for (let i = 0; i < apiResponses.length; i++) {
        const apiData = apiResponses[i];
        if (apiData.data && apiData.data.sound_list) {
          const songsInBatch = apiData.data.sound_list.length;

          for (const song of apiData.data.sound_list) {
            songMap.set(song.clip_id, {
              rank: song.rank,
              song_id: song.clip_id,
              title: song.title,
              artist: song.author,
              country: country,  // Add country code
              cover: song.cover,
              image: song.cover,
              link: `https://www.tiktok.com/music/x-${song.clip_id}`,
              url: `https://ads.tiktok.com/business/creativecenter/song/${encodeURIComponent(song.title)}-${song.clip_id}`,
              duration: song.duration,
              promoted: song.promoted || false,
              rank_diff: song.rank_diff,
              rank_diff_type: song.rank_diff_type,
              trend_chart: song.trend, // The 7-day trend data!
              related_videos: song.related_items ? song.related_items.length : 0,
              scraped_at: new Date().toISOString()
            });
            totalProcessed++;
          }

          // Show progress every batch
          const progress = Math.round((totalProcessed / maxSongs) * 100);
          console.log(`   [${i + 1}/${apiResponses.length}] Processed ${totalProcessed} songs (${Math.min(progress, 100)}%)`);
        }
      }

      // Convert map to array and sort by rank
      const allSongs = Array.from(songMap.values());
      allSongs.sort((a, b) => a.rank - b.rank);

      songs.push(...allSongs.slice(0, maxSongs));

      console.log('');
      console.log(`✅ COMPLETE: Extracted ${songs.length} songs with full trend data`);
      if (songs.length > 0) {
        console.log(`   📈 Data includes: title, artist, rank, 7-day trend chart, video count`);
        console.log(`   🏆 Top song: "${songs[0].title}" - ${songs[0].artist} (Rank #${songs[0].rank})`);
      }

      // Fetch release dates if enabled
      if (fetchDates && songs.length > 0) {
        await this.enrichWithReleaseDates(songs);
        await this.enrichWithYouTubeLinks(songs);
      }

      // Genre enrichment and filtering
      if (genreConfig && songs.length > 0) {
        // Enrich with genres
        await this.genreFetcher.enrichWithGenres(songs);

        // Filter by genre
        const { filtered, stats } = this.genreFilter.filterSongs(songs, genreConfig);
        songs.length = 0; // Clear array
        songs.push(...filtered); // Replace with filtered songs
        this.genreStats = stats; // Store for saveJSON

        // Display stats
        this.genreFilter.displayStats(stats);
      }

    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    } finally {
      await browser.close();
    }

    return songs;
  }

  async saveJSON(data, filename = 'trending_music_with_trends.json', country = 'US') {
    const filepath = path.join(this.dataDir, filename);

    // Add metadata
    const output = {
      country: country,
      scraped_at: new Date().toISOString(),
      total_songs: data.length,
      songs: data
    };

    // Add genre statistics if available
    if (this.genreStats) {
      output.genre_stats = this.genreStats;
    }

    await fs.writeFile(filepath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`💾 JSON saved to ${filepath}`);
  }

  async saveCSV(data, filename = 'trending_music_with_trends.csv') {
    if (!data || data.length === 0) return;

    const filepath = path.join(this.dataDir, filename);

    // Flatten trend_chart and genre fields for CSV
    const flatData = data.map(song => ({
      ...song,
      genre: song.genre || 'Unknown',
      all_genres: song.all_genres ? song.all_genres.join('; ') : '',
      trend_chart: song.trend_chart ? JSON.stringify(song.trend_chart) : 'N/A'
    }));

    const keys = new Set();
    flatData.forEach(item => Object.keys(item).forEach(key => keys.add(key)));
    const headers = Array.from(keys).map(key => ({ id: key, title: key }));

    const csvWriter = createCsvWriter({ path: filepath, header: headers });
    await csvWriter.writeRecords(flatData);
    console.log(`📊 CSV saved to ${filepath}`);
  }

  async run(maxSongs = 50, options = {}) {
    const {
      country = 'US',
      tab = 'popular',
      newToTop100 = false,
      newFromHistory = false,
      newFromHistoryDays = 7,
      approvedForBusiness = false,
      searchQuery = null,
      cookiesFile = null
    } = options;

    console.log('\n' + '='.repeat(60));
    console.log('🎵 TikTok Music Scraper WITH TREND CHARTS');
    console.log('='.repeat(60) + '\n');

    await this.ensureDataDir();
    let songs = await this.scrapeMusic(maxSongs, options);

    if (newFromHistory) {
      const seenUrls = await this.scanHistory.getSeenSongUrls(country, tab, newFromHistoryDays);
      const originalCount = songs.length;
      songs = songs.filter(song => song.url && !seenUrls.has(song.url));

      console.log(`🆕 History filter kept ${songs.length} of ${originalCount} songs`);
      console.log(`   Compared against ${seenUrls.size} songs seen in the previous ${newFromHistoryDays} days`);
    }

    if (songs.length > 0) {
      const tabSuffix = tab === 'breakout' ? '_breakout' : '';
      const countrySuffix = country !== 'US' ? `_${country}` : '';
      const newSuffix = newToTop100 ? '_new' : '';
      const historyNewSuffix = newFromHistory ? `_history_new_${newFromHistoryDays}d` : '';
      const businessSuffix = approvedForBusiness ? '_business' : '';
      const searchSuffix = searchQuery ? `_search_${searchQuery.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
      await this.saveJSON(songs, `trending_music_with_trends${countrySuffix}${tabSuffix}${newSuffix}${historyNewSuffix}${businessSuffix}${searchSuffix}.json`, country);
      await this.saveCSV(songs, `trending_music_with_trends${countrySuffix}${tabSuffix}${newSuffix}${historyNewSuffix}${businessSuffix}${searchSuffix}.csv`);

      console.log('\n' + '='.repeat(60));
      console.log('📈 Summary');
      console.log('='.repeat(60));
      console.log(`Total songs: ${songs.length}`);
      console.log(`With trend data: ${songs.filter(s => s.trend_chart).length}`);
      console.log(`With release dates: ${songs.filter(s => s.release_date).length}`);
      console.log(`With YouTube links: ${songs.filter(s => s.youtube_url).length}`);
      console.log(`Data directory: ${path.resolve(this.dataDir)}`);

      // Show sample trend
      if (songs[0] && songs[0].trend_chart) {
        console.log('\n📊 Sample trend data (song #1):');
        console.log(`   ${songs[0].title} - ${songs[0].artist}`);
        songs[0].trend_chart.forEach((point, i) => {
          const date = new Date(point.time * 1000).toLocaleDateString();
          const bar = '█'.repeat(Math.floor(point.value * 20));
          console.log(`   Day ${i + 1} (${date}): ${bar} ${point.value.toFixed(2)}`);
        });
      }

      console.log('\n✨ Scraping completed successfully!\n');
    }

    return songs;
  }
}

// Run
if (require.main === module) {
  const args = process.argv.slice(2);
  const breakoutMode = args.includes('--breakout') || args.includes('-b');
  const bothMode = args.includes('--both');
  const headless = !args.includes('--no-headless');
  const maxSongs = parseInt(args.find(arg => arg.match(/^\d+$/))) || 50;
  const newToTop100 = args.includes('--new') || args.includes('--new-to-top-100');
  const newFromHistory = args.includes('--new-history') || args.includes('--new-songs');
  const approvedForBusiness = args.includes('--business') || args.includes('--approved');
  const fetchDates = !args.includes('--no-dates');

  let newFromHistoryDays = 7;
  const newHistoryDaysIndex = args.indexOf('--new-history-days');
  if (newHistoryDaysIndex !== -1 && args[newHistoryDaysIndex + 1]) {
    const parsedDays = parseInt(args[newHistoryDaysIndex + 1], 10);
    if (!Number.isNaN(parsedDays) && parsedDays > 0) {
      newFromHistoryDays = parsedDays;
    }
  }

  // Parse country argument
  let country = 'US';
  const countryIndex = args.indexOf('--country');
  if (countryIndex !== -1 && args[countryIndex + 1]) {
    country = args[countryIndex + 1].toUpperCase();
  }

  // Parse search argument
  let searchQuery = null;
  const searchIndex = args.indexOf('--search');
  if (searchIndex !== -1 && args[searchIndex + 1]) {
    searchQuery = args[searchIndex + 1];
  }

  // Parse cookies file argument
  let cookiesFile = null;
  const cookiesIndex = args.indexOf('--cookies');
  if (cookiesIndex !== -1 && args[cookiesIndex + 1]) {
    cookiesFile = args[cookiesIndex + 1];
  } else if (require('fs').existsSync('cookies.txt')) {
    // Auto-detect cookies.txt in current directory
    cookiesFile = 'cookies.txt';
    console.log('🍪 Auto-detected cookies.txt file');
  }

  // Parse genre filter arguments
  let genreConfig = null;
  if (args.includes('--genre-include') || args.includes('--genre-exclude') || args.includes('--genre-config')) {
    const GenreFilter = require('./genre_filter');
    const genreFilter = new GenreFilter();
    genreConfig = genreFilter.parseCliConfig(args);
  }

  const scraper = new TikTokMusicScraperWithTrends();

  console.log(`\n🌍 Scraping TikTok trends for: ${country}`);
  if (searchQuery) {
    console.log(`🔍 Search query: "${searchQuery}"`);
  }
  if (bothMode) {
    console.log('🔄 Mode: Both Popular & Breakout');
  } else if (breakoutMode) {
    console.log('📈 Mode: Breakout (Actively Trending)');
  } else {
    console.log('📊 Mode: Popular');
  }
  if (newToTop100) {
    console.log('🆕 Filter: New to top 100');
  }
  if (newFromHistory) {
    console.log(`🆕 Filter: New vs previous ${newFromHistoryDays} days`);
  }
  if (approvedForBusiness) {
    console.log('✅ Filter: Approved for business use');
  }
  if (fetchDates) {
    console.log('📅 Release dates & YouTube links: Enabled');
  }
  if (genreConfig && genreConfig.genres.length > 0) {
    const filterMode = genreConfig.mode === 'include' ? 'Include' : 'Exclude';
    console.log(`🎵 Genre filter: ${filterMode} [${genreConfig.genres.join(', ')}]`);
  }
  console.log('');

  // Run both tabs if --both flag is set
  if (bothMode) {
    (async () => {
      try {
        console.log('🎯 ROUND 1: POPULAR SONGS');
        console.log('='.repeat(60) + '\n');
        const popularSongs = await scraper.run(maxSongs, {
          headless,
          tab: 'popular',
          country,
          newToTop100,
          newFromHistory,
          newFromHistoryDays,
          approvedForBusiness,
          searchQuery,
          cookiesFile,
          fetchDates,
          genreConfig
        });

        console.log('\n\n🎯 ROUND 2: BREAKOUT SONGS');
        console.log('='.repeat(60) + '\n');
        const breakoutSongs = await scraper.run(maxSongs, {
          headless,
          tab: 'breakout',
          country,
          newToTop100,
          newFromHistory,
          newFromHistoryDays,
          approvedForBusiness,
          searchQuery,
          cookiesFile,
          fetchDates,
          genreConfig
        });

        console.log('\n\n' + '='.repeat(60));
        console.log('✅ ALL ROUNDS COMPLETED');
        console.log('='.repeat(60));
        console.log('📁 Files saved:');
        console.log(`   - trending_music_with_trends${country !== 'US' ? '_' + country : ''}.json/csv (Popular)`);
        console.log(`   - trending_music_with_trends${country !== 'US' ? '_' + country : ''}_breakout.json/csv (Breakout)`);

        // Store in scan history for future comparison
        console.log('\n💾 Storing scan in history for future comparison...');
        const scanResult = await scraper.scanHistory.storeScan(
          {
            country,
            maxSongs,
            newToTop100,
            newFromHistory,
            newFromHistoryDays,
            approvedForBusiness,
            searchQuery
          },
          popularSongs,
          breakoutSongs
        );

        console.log(`✅ Scan stored: ${scanResult.scanId}`);
        console.log(`   📊 Popular: ${scanResult.popularCount} songs`);
        console.log(`   🔥 Breakout: ${scanResult.breakoutCount} songs`);
        console.log(`   📂 Location: ${scanResult.path}`);
        console.log(`\n💡 Use this data later to compare with future scans!`);
        console.log('='.repeat(60) + '\n');
      } catch (error) {
        console.error(error);
      }
    })();
  } else {
    scraper.run(maxSongs, {
      headless,
      tab: breakoutMode ? 'breakout' : 'popular',
      country,
      newToTop100,
      newFromHistory,
      newFromHistoryDays,
      approvedForBusiness,
      searchQuery,
      cookiesFile,
      fetchDates,
      genreConfig
    }).catch(console.error);
  }
}

module.exports = TikTokMusicScraperWithTrends;
