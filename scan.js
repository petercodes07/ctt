#!/usr/bin/env node

/**
 * Simple TikTok Scan Commands
 *
 * Usage:
 *   node scan.js quick          -> Quick US scan (50 songs, both tabs)
 *   node scan.js full           -> Full US scan (100 songs, both tabs)
 *   node scan.js quick PH       -> Quick Philippines scan
 *   node scan.js full JP        -> Full Japan scan
 */

require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const command = args[0]?.toLowerCase();
const country = args[1]?.toUpperCase() || 'US';

// Scan presets
const presets = {
  quick: {
    maxSongs: 50,
    description: 'Quick scan (50 songs per tab)'
  },
  full: {
    maxSongs: 100,
    description: 'Full scan (100 songs per tab)'
  }
};

// Validate command
if (!command || !presets[command]) {
  console.log('❌ Invalid command\n');
  console.log('📖 Usage:');
  console.log('  node scan.js quick [COUNTRY]    - Quick scan (50 songs)');
  console.log('  node scan.js full [COUNTRY]     - Full scan (100 songs)\n');
  console.log('Examples:');
  console.log('  node scan.js quick              - Quick US scan');
  console.log('  node scan.js full               - Full US scan');
  console.log('  node scan.js quick PH           - Quick Philippines scan');
  console.log('  node scan.js full JP            - Full Japan scan\n');
  process.exit(1);
}

const preset = presets[command];

function runScan() {
  // Display what we're doing
  console.log('\n' + '='.repeat(60));
  console.log(`🚀 ${preset.description.toUpperCase()}`);
  console.log('='.repeat(60));
  console.log(`📍 Country: ${country}`);
  console.log(`📊 Songs per tab: ${preset.maxSongs}`);
  console.log(`🔄 Tabs: Popular + Breakout`);
  console.log('='.repeat(60) + '\n');

  // Build command
  const scriptPath = path.join(__dirname, 'scraper_with_trends.js');
  const cmdArgs = [
    scriptPath,
    '--country', country,
    preset.maxSongs.toString(),
    '--both'
  ];

  // Run the scraper
  const startTime = Date.now();
  const scraperProcess = spawn('node', cmdArgs, {
    stdio: 'inherit',
    env: { ...process.env, CCT_CACHE: '0' }
  });

  scraperProcess.on('exit', (code) => {
    if (code === 0) {
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log('\n✅ Scan completed successfully!');
      console.log(`⏱️  Duration: ${duration}s\n`);
    } else {
      console.log(`\n❌ Scan failed with code ${code}\n`);
    }
    process.exit(code);
  });
}

runScan();
