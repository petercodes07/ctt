#!/usr/bin/env node

/**
 * Interactive TikTok Music Scraper
 * User-friendly menu to select country and scan type
 */

require('dotenv').config();
const readline = require('readline');
const { spawn } = require('child_process');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Popular countries list
const countries = [
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
];

const scanTypes = [
  {
    key: '1',
    name: 'Quick Scan',
    songs: 50,
    time: '~30 seconds',
    description: '50 songs per tab (Popular + Breakout)'
  },
  {
    key: '2',
    name: 'Full Scan',
    songs: 100,
    time: '~60 seconds',
    description: '100 songs per tab (Popular + Breakout)'
  }
];

function clearScreen() {
  console.log('\x1Bc');
}

function showHeader() {
  console.log('\n' + '═'.repeat(70));
  console.log('🎵  TIKTOK MUSIC TRENDS SCRAPER - INTERACTIVE MODE  🎵');
  console.log('═'.repeat(70) + '\n');
}

function showCountryMenu() {
  return new Promise((resolve) => {
    clearScreen();
    showHeader();

    console.log('📍 SELECT COUNTRY:\n');

    countries.forEach((country, index) => {
      console.log(`  ${String(index + 1).padStart(2)}. ${country.flag}  ${country.name.padEnd(20)} (${country.code})`);
    });

    console.log(`\n  ${countries.length + 1}. 🌍  Other (Enter country code manually)`);
    console.log('\n' + '─'.repeat(70));

    rl.question('\n👉 Enter your choice (1-' + (countries.length + 1) + '): ', (answer) => {
      const choice = parseInt(answer);

      if (choice >= 1 && choice <= countries.length) {
        resolve(countries[choice - 1].code);
      } else if (choice === countries.length + 1) {
        rl.question('\n👉 Enter country code (e.g., US, JP, PH): ', (code) => {
          resolve(code.toUpperCase().trim());
        });
      } else {
        console.log('\n❌ Invalid choice. Using US as default.');
        setTimeout(() => resolve('US'), 1000);
      }
    });
  });
}

function showScanTypeMenu() {
  return new Promise((resolve) => {
    clearScreen();
    showHeader();

    console.log('⚡ SELECT SCAN TYPE:\n');

    scanTypes.forEach((type) => {
      console.log(`  ${type.key}. ${type.name.padEnd(15)} - ${type.description}`);
      console.log(`     ${' '.repeat(18)}⏱️  Estimated time: ${type.time}\n`);
    });

    console.log('─'.repeat(70));

    rl.question('\n👉 Enter your choice (1-2): ', (answer) => {
      const choice = answer.trim();
      const scanType = scanTypes.find(t => t.key === choice);

      if (scanType) {
        resolve(scanType);
      } else {
        console.log('\n❌ Invalid choice. Using Quick Scan as default.');
        setTimeout(() => resolve(scanTypes[0]), 1000);
      }
    });
  });
}

function showConfirmation(country, scanType) {
  return new Promise((resolve) => {
    clearScreen();
    showHeader();

    const countryInfo = countries.find(c => c.code === country);
    const countryDisplay = countryInfo
      ? `${countryInfo.flag}  ${countryInfo.name} (${country})`
      : `🌍  ${country}`;

    console.log('✅ READY TO START SCAN\n');
    console.log('─'.repeat(70));
    console.log(`  📍 Country:        ${countryDisplay}`);
    console.log(`  ⚡ Scan Type:      ${scanType.name}`);
    console.log(`  📊 Songs per tab:  ${scanType.songs}`);
    console.log(`  🔄 Tabs:           Popular + Breakout`);
    console.log(`  ⏱️  Est. Time:      ${scanType.time}`);
    console.log('─'.repeat(70) + '\n');

    rl.question('👉 Start scan? (Y/n): ', (answer) => {
      const confirmed = !answer || answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
      resolve(confirmed);
    });
  });
}

function runScan(country, scanType) {
  clearScreen();
  showHeader();

  console.log('🚀 STARTING SCAN...\n');
  console.log('─'.repeat(70));

  const scriptPath = path.join(__dirname, 'scraper_with_trends.js');
  const cmdArgs = [
    scriptPath,
    '--country', country,
    scanType.songs.toString(),
    '--both'
  ];

  const startTime = Date.now();
  const scraperProcess = spawn('node', cmdArgs, {
    stdio: 'inherit',
    env: { ...process.env, CCT_CACHE: '0' }
  });

  scraperProcess.on('exit', async (code) => {
    if (code === 0) {
      const duration = Math.round((Date.now() - startTime) / 1000);

      console.log('\n' + '═'.repeat(70));
      console.log('✅ SCAN COMPLETED SUCCESSFULLY!');
      console.log('═'.repeat(70));
      console.log(`\n📁 Check the data/ folder for your results!`);
      console.log(`   - trending_music_with_trends${country !== 'US' ? '_' + country : ''}.json`);
      console.log(`   - trending_music_with_trends${country !== 'US' ? '_' + country : ''}_breakout.json\n`);
    } else {
      console.log(`\n❌ Scan failed with code ${code}\n`);
    }
    rl.close();
    process.exit(code);
  });
}

// Main interactive flow
async function main() {
  try {
    // Step 1: Select country
    const country = await showCountryMenu();

    // Step 2: Select scan type
    const scanType = await showScanTypeMenu();

    // Step 3: Confirm
    const confirmed = await showConfirmation(country, scanType);

    if (!confirmed) {
      console.log('\n❌ Scan cancelled.\n');
      rl.close();
      process.exit(0);
    }

    // Step 4: Run scan
    runScan(country, scanType);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    rl.close();
    process.exit(1);
  }
}

// Run the interactive app
main();
