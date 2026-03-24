#!/usr/bin/env node

/**
 * List all available countries in TikTok Creative Center
 */

const fs = require('fs');
const path = require('path');

const countriesPath = path.join(__dirname, 'countries.json');
const data = JSON.parse(fs.readFileSync(countriesPath, 'utf-8'));

console.log('\n' + '='.repeat(70));
console.log('🌍 TikTok Creative Center - Available Countries');
console.log('='.repeat(70));
console.log(`Total: ${data.total} countries\n`);

// Display by region
for (const [region, codes] of Object.entries(data.by_region)) {
  console.log(`\n📍 ${region.toUpperCase()} (${codes.length})`);
  console.log('-'.repeat(70));

  const countries = codes.map(code => {
    const country = data.countries.find(c => c.code === code);
    return `${code} - ${country.name}`;
  });

  // Display in columns
  for (let i = 0; i < countries.length; i += 2) {
    const left = countries[i].padEnd(35);
    const right = countries[i + 1] || '';
    console.log(`  ${left}${right}`);
  }
}

console.log('\n' + '='.repeat(70));
console.log('💡 POPULAR MARKETS\n');

console.log('🔥 Largest Markets:');
console.log('   ' + data.popular_markets.largest.join(', '));

console.log('\n🇬🇧 English Speaking:');
console.log('   ' + data.popular_markets.english_speaking.join(', '));

console.log('\n🇪🇸 Spanish Speaking:');
console.log('   ' + data.popular_markets.spanish_speaking.join(', '));

console.log('\n🇸🇦 Arabic Speaking:');
console.log('   ' + data.popular_markets.arabic_speaking.join(', '));

console.log('\n' + '='.repeat(70));
console.log('⚠️  NOT AVAILABLE\n');

for (const [key, value] of Object.entries(data.notes)) {
  console.log(`   ${key}: ${value}`);
}

console.log('\n' + '='.repeat(70));
console.log('🌍 GLOBAL MODE\n');
console.log('NEW! Scrape top 10 global markets and aggregate trends:');
console.log('   npm run scrape:global    # Scrapes US, GB, BR, ID, JP, KR, PH, TH, VN, MX');
console.log('   npm run trends:global    # Analyze global trends\n');

console.log('='.repeat(70));
console.log('📝 SINGLE COUNTRY USAGE\n');
console.log('To scrape a specific country:');
console.log('   npm run scrape -- --country JP    # Japan');
console.log('   npm run scrape -- --country BR    # Brazil');
console.log('   npm run scrape -- --country NG    # Nigeria\n');

console.log('Quick commands for popular markets:');
console.log('   npm run scrape:fr         # France');
console.log('   npm run scrape:jp         # Japan');
console.log('   npm run scrape:br         # Brazil');
console.log('   npm run scrape:ng         # Nigeria\n');

console.log('To see this list again:');
console.log('   npm run countries\n');
