#!/usr/bin/env node

/**
 * TikTok Creative Center Music Scraper - PLAYWRIGHT VERSION
 * Faster and more reliable than Puppeteer
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

class TikTokMusicScraperPlaywright {
  constructor() {
    this.url = 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en';
    this.dataDir = 'data';
  }

  async ensureDataDir() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      // Directory already exists
    }
  }

  async scrapeMusic(maxSongs = 50, options = {}) {
    const { headless = true, tab = 'popular' } = options;

    console.log('🎵 Starting TikTok Music Scraper (Playwright)...');
    console.log(`📊 Target URL: ${this.url}`);
    console.log(`📈 Target Tab: ${tab === 'breakout' ? 'Breakout (Actively Trending)' : 'Popular'}`);

    const browser = await chromium.launch({
      headless: headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      }
    });

    const page = await context.newPage();

    const songs = [];
    const trendDataMap = new Map(); // Store trend chart data by song

    // Intercept network requests to capture trend data
    page.on('response', async (response) => {
      const url = response.url();

      // Look for API endpoints that might contain trend data
      if (url.includes('/api/') || url.includes('trend') || url.includes('chart')) {
        try {
          if (response.status() === 200) {
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('application/json')) {
              const data = await response.json();
              console.log(`📡 Captured API response: ${url.substring(0, 80)}...`);
              // Store for later processing
              trendDataMap.set(url, data);
            }
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }
    });

    try {
      console.log('🌐 Launching browser...');

      console.log('📡 Loading TikTok Creative Center...');
      await page.goto(this.url, {
        waitUntil: 'networkidle',
        timeout: 60000
      });

      console.log('⏳ Waiting for initial page to load...');
      await page.waitForTimeout(3000);

      // Handle region selection
      console.log('🌍 Selecting region...');
      try {
        const regionSelector = await page.$('[class*="bannerRegionsSelectLabel"]');

        if (regionSelector) {
          const regionText = await regionSelector.textContent();

          if (regionText && regionText.includes('Please Select')) {
            console.log('📍 Region not selected, selecting now...');

            await regionSelector.click();
            console.log('✅ Clicked region dropdown');
            await page.waitForTimeout(2000);

            // Wait for options to appear
            try {
              await page.waitForSelector('[role="option"]', { timeout: 5000 });
            } catch (e) {
              // Try keyboard navigation fallback
              console.log('⌨️  Using keyboard navigation...');
              await page.keyboard.press('ArrowDown');
              await page.waitForTimeout(500);
              await page.keyboard.press('Enter');
              await page.waitForTimeout(3000);
              console.log('✅ Selected region via keyboard');
              return;
            }

            // Try to select first option
            const options = await page.$$('[role="option"]');
            console.log(`Found ${options.length} options in dropdown`);

            if (options.length > 0) {
              for (const option of options.slice(0, 10)) {
                try {
                  const optionText = await option.textContent();
                  const isVisible = await option.isVisible();

                  if (isVisible && optionText && optionText.length > 0 && !optionText.includes('Please')) {
                    console.log(`   Selecting option: ${optionText.trim()}`);
                    await option.click();
                    console.log('✅ Selected region from dropdown');
                    await page.waitForTimeout(3000);
                    break;
                  }
                } catch (e) {
                  // Skip this option
                }
              }
            }
          } else {
            console.log('✅ Region already selected:', regionText.trim());
          }
        } else {
          console.log('ℹ️  No region selector found');
        }
      } catch (error) {
        console.log(`⚠️  Region selection error: ${error.message}`);
        console.log('⚠️  Continuing anyway...');
      }

      // Switch to Breakout tab if requested
      if (tab === 'breakout') {
        console.log('🔄 Switching to Breakout tab...');
        try {
          const breakoutTab = await page.$('[data-testid="cc_commonCom_tabChange_1"]');

          if (breakoutTab) {
            await breakoutTab.click();
            console.log('✅ Clicked Breakout tab');
            await page.waitForTimeout(5000);
          } else {
            console.log('⚠️  Could not find Breakout tab');
          }
        } catch (error) {
          console.log(`⚠️  Error switching to Breakout tab: ${error.message}`);
        }
      }

      // Wait for initial songs to load
      console.log('⏳ Waiting for initial songs to load...');
      await page.waitForTimeout(5000);

      // Load more songs by clicking "View More" button
      console.log('📜 Loading more songs by clicking "View More" button...');
      let clickAttempts = 0;
      const maxClickAttempts = 50;

      while (clickAttempts < maxClickAttempts) {
        // Count currently rendered song cards
        const currentSongCount = await page.$$eval(
          '[class*="soundItemContainer"]',
          elements => elements.length
        );

        console.log(`   Songs visible: ${currentSongCount}`);

        if (currentSongCount >= maxSongs) {
          console.log(`✅ Loaded ${currentSongCount} songs (target: ${maxSongs})`);
          break;
        }

        // Look for and click the "View More" button
        try {
          const viewMoreBtn = await page.$('[class*="ViewMoreBtn"], [class*="viewMoreBtn"]');

          if (viewMoreBtn) {
            // Scroll to the button
            await viewMoreBtn.scrollIntoViewIfNeeded();
            await page.waitForTimeout(500);

            // Click the button
            await viewMoreBtn.click();
            console.log(`   ✅ Clicked "View More" button (attempt ${clickAttempts + 1})`);

            // Wait for new songs to load
            await page.waitForTimeout(2000);

            clickAttempts++;
          } else {
            console.log(`ℹ️  No "View More" button found - all songs loaded`);
            break;
          }
        } catch (error) {
          console.log(`⚠️  Error clicking "View More": ${error.message}`);
          break;
        }
      }

      console.log(`ℹ️  Load complete after ${clickAttempts} clicks`);

      // Scroll back to top
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(1500);

      // Take screenshot
      try {
        const screenshotPath = path.join(this.dataDir, 'page_screenshot_playwright.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`📸 Screenshot saved to ${screenshotPath}`);
      } catch (e) {
        console.log(`⚠️  Could not save screenshot: ${e.message}`);
      }

      // Save HTML
      try {
        const htmlPath = path.join(this.dataDir, 'page_source_playwright.html');
        const html = await page.content();
        await fs.writeFile(htmlPath, html, 'utf-8');
        console.log(`💾 HTML source saved to ${htmlPath}`);
      } catch (e) {
        console.log(`⚠️  Could not save HTML: ${e.message}`);
      }

      // Log captured API data
      if (trendDataMap.size > 0) {
        console.log(`\n📊 Captured ${trendDataMap.size} API responses:`);
        for (const [url, data] of trendDataMap) {
          console.log(`   - ${url.split('?')[0].split('/').pop()}`);
        }

        // Save API responses for analysis
        try {
          const apiDataPath = path.join(this.dataDir, 'api_responses.json');
          const apiData = {};
          for (const [url, data] of trendDataMap) {
            apiData[url] = data;
          }
          await fs.writeFile(apiDataPath, JSON.stringify(apiData, null, 2));
          console.log(`💾 API responses saved to ${apiDataPath}`);
        } catch (e) {
          console.log(`⚠️  Could not save API responses: ${e.message}`);
        }
      }

      // Extract song data
      console.log('🔍 Extracting song data from rendered cards...');

      const extractedSongs = await page.$$eval(
        '[class*="soundItemContainer"]',
        (cards, maxCount) => {
          const songData = [];

          cards.forEach((card, idx) => {
            if (idx >= maxCount) return;

            try {
              // Extract rank
              const rankEl = card.querySelector('[class*="rankingIndex"]');
              const rank = rankEl ? parseInt(rankEl.innerText.trim()) : idx + 1;

              // Extract song title
              const titleEl = card.querySelector('[class*="musicName"]');
              const title = titleEl ? titleEl.innerText.trim() : 'Unknown';

              // Extract artist
              const artistEl = card.querySelector('[class*="autherName"]');
              const artist = artistEl ? artistEl.innerText.trim() : 'Unknown';

              // Extract image
              const imageEl = card.querySelector('img[src*="tiktokcdn"]');
              const image = imageEl ? imageEl.getAttribute('src') : '';

              // Extract URL from link
              const linkEl = card.querySelector('a[href*="/song/"]');
              const url = linkEl ? 'https://ads.tiktok.com' + linkEl.getAttribute('href').split('?')[0] : '';

              // Extract ranking trend (up/down/same)
              let trend = 'N/A';
              const trendEl = card.querySelector('[class*="rankingvalue"]');
              if (trendEl) {
                if (trendEl.classList.toString().includes('rising')) {
                  const trendNum = trendEl.querySelector('[class*="rankingvalueNum"]');
                  trend = trendNum ? `↑${trendNum.innerText}` : '↑';
                } else if (trendEl.classList.toString().includes('falling')) {
                  const trendNum = trendEl.querySelector('[class*="rankingvalueNum"]');
                  trend = trendNum ? `↓${trendNum.innerText}` : '↓';
                } else if (trendEl.classList.toString().includes('keeping')) {
                  trend = '=';
                }
              }

              // Try to extract trend chart data from ECharts element
              let trendChartData = null;
              try {
                const echartEl = card.querySelector('[class*="TrendingEchart"]');
                if (echartEl && echartEl._echarts_instance_) {
                  const instance = echartEl._echarts_instance_;
                  const option = window.echarts?.getInstanceByDom(echartEl)?.getOption();
                  if (option && option.series && option.series[0]) {
                    trendChartData = option.series[0].data;
                  }
                }
              } catch (e) {
                // ECharts data not available in DOM
              }

              songData.push({
                rank,
                title,
                artist,
                image,
                url,
                trend,
                trend_chart: trendChartData,
                scraped_at: new Date().toISOString()
              });
            } catch (e) {
              console.error(`Error extracting song ${idx}:`, e.message);
            }
          });

          return songData;
        },
        maxSongs
      );

      songs.push(...extractedSongs);
      console.log(`✅ Extracted ${songs.length} songs`);

    } catch (error) {
      console.error(`❌ Error during scraping: ${error.message}`);

      // Try to save debug info even on error
      try {
        const errorScreenshot = path.join(this.dataDir, 'error_screenshot_playwright.png');
        await page.screenshot({ path: errorScreenshot });
        console.log(`📸 Error screenshot saved to ${errorScreenshot}`);
      } catch (e) {
        // Ignore screenshot errors
      }
    } finally {
      await browser.close();
    }

    console.log(`✅ Scraped ${songs.length} songs`);
    return songs;
  }

  async saveJSON(data, filename = 'trending_music.json') {
    const filepath = path.join(this.dataDir, filename);
    await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`💾 JSON saved to ${filepath}`);
  }

  async saveCSV(data, filename = 'trending_music.csv') {
    if (!data || data.length === 0) {
      console.log('⚠️  No data to save to CSV');
      return;
    }

    const filepath = path.join(this.dataDir, filename);

    const keys = new Set();
    data.forEach(item => {
      Object.keys(item).forEach(key => keys.add(key));
    });

    const headers = Array.from(keys).map(key => ({ id: key, title: key }));

    const csvWriter = createCsvWriter({
      path: filepath,
      header: headers
    });

    await csvWriter.writeRecords(data);
    console.log(`📊 CSV saved to ${filepath}`);
  }

  async run(maxSongs = 50, options = {}) {
    console.log('\n' + '='.repeat(60));
    console.log('🎵 TikTok Creative Center Music Scraper (Playwright)');
    console.log('='.repeat(60) + '\n');

    await this.ensureDataDir();

    const songs = await this.scrapeMusic(maxSongs, options);

    if (songs.length > 0) {
      const tabSuffix = options.tab === 'breakout' ? '_breakout' : '';
      await this.saveJSON(songs, `trending_music${tabSuffix}.json`);
      await this.saveCSV(songs, `trending_music${tabSuffix}.csv`);

      console.log('\n' + '='.repeat(60));
      console.log('📈 Summary');
      console.log('='.repeat(60));
      console.log(`Total songs scraped: ${songs.length}`);
      console.log(`Data directory: ${path.resolve(this.dataDir)}`);
      console.log('\n✨ Scraping completed successfully!');
    } else {
      console.log('\n⚠️  No data was scraped.');
    }

    return songs;
  }
}

// Run the scraper
if (require.main === module) {
  const args = process.argv.slice(2);
  const breakoutMode = args.includes('--breakout') || args.includes('-b');
  const headless = !args.includes('--no-headless');
  const maxSongs = parseInt(args.find(arg => arg.match(/^\d+$/))) || 50;

  const scraper = new TikTokMusicScraperPlaywright();

  if (breakoutMode) {
    console.log('📈 Running in breakout mode\n');
  }

  scraper.run(maxSongs, {
    headless: headless,
    tab: breakoutMode ? 'breakout' : 'popular'
  }).catch(console.error);
}

module.exports = TikTokMusicScraperPlaywright;
