#!/usr/bin/env node

/**
 * Test Email Configuration
 * Sends a sample email to verify SMTP settings
 */

require('dotenv').config();
const EmailNotifier = require('./email_notifier');

// Sample song data with trend charts for testing
const samplePopularSongs = [
  {
    rank: 1,
    song_id: '7596970562758395920',
    title: 'Espresso',
    artist: 'Sabrina Carpenter',
    cover: 'https://p16-sign-sg.tiktokcdn.com/tos-alisg-v-0000/o0AGBDuBQIAeEfCIABBCzACA~tplv-tiktokx-scale:240:240.webp',
    link: 'https://www.tiktok.com/music/Espresso-7596970562758395920',
    duration: 60,
    promoted: false,
    country: 'US',
    rank_diff: 0,
    rank_diff_type: 'new',
    trend_chart: [
      { date: '2024-01-15', value: 850000 },
      { date: '2024-01-16', value: 920000 },
      { date: '2024-01-17', value: 1050000 },
      { date: '2024-01-18', value: 1200000 },
      { date: '2024-01-19', value: 1450000 },
      { date: '2024-01-20', value: 1680000 },
      { date: '2024-01-21', value: 2100000 }
    ]
  },
  {
    rank: 2,
    song_id: '7589123456789012345',
    title: 'Beautiful Things',
    artist: 'Benson Boone',
    cover: 'https://p16-sign-sg.tiktokcdn.com/tos-alisg-v-0000/o0AGBDuBQIAeEfCIABBCzACA~tplv-tiktokx-scale:240:240.webp',
    link: 'https://www.tiktok.com/music/Beautiful-Things-7589123456789012345',
    duration: 60,
    promoted: false,
    country: 'US',
    rank_diff: 5,
    rank_diff_type: 'up',
    trend_chart: [
      { date: '2024-01-15', value: 1200000 },
      { date: '2024-01-16', value: 1250000 },
      { date: '2024-01-17', value: 1300000 },
      { date: '2024-01-18', value: 1320000 },
      { date: '2024-01-19', value: 1350000 },
      { date: '2024-01-20', value: 1400000 },
      { date: '2024-01-21', value: 1560000 }
    ]
  },
  {
    rank: 3,
    song_id: '7589234567890123456',
    title: 'Cruel Summer',
    artist: 'Taylor Swift',
    cover: 'https://p16-sign-sg.tiktokcdn.com/tos-alisg-v-0000/o0AGBDuBQIAeEfCIABBCzACA~tplv-tiktokx-scale:240:240.webp',
    link: 'https://www.tiktok.com/music/Cruel-Summer-7589234567890123456',
    duration: 60,
    promoted: false,
    country: 'US',
    rank_diff: -2,
    rank_diff_type: 'down',
    trend_chart: [
      { date: '2024-01-15', value: 980000 },
      { date: '2024-01-16', value: 975000 },
      { date: '2024-01-17', value: 960000 },
      { date: '2024-01-18', value: 945000 },
      { date: '2024-01-19', value: 930000 },
      { date: '2024-01-20', value: 920000 },
      { date: '2024-01-21', value: 875000 }
    ]
  }
];

const sampleBreakoutSongs = [
  {
    rank: 1,
    song_id: '7598765432109876543',
    title: 'Rising Star',
    artist: 'New Artist',
    cover: 'https://p16-sign-sg.tiktokcdn.com/tos-alisg-v-0000/o0AGBDuBQIAeEfCIABBCzACA~tplv-tiktokx-scale:240:240.webp',
    link: 'https://www.tiktok.com/music/Rising-Star-7598765432109876543',
    duration: 60,
    promoted: false,
    country: 'US',
    rank_diff: 0,
    rank_diff_type: 'new',
    trend_chart: [
      { date: '2024-01-15', value: 12000 },
      { date: '2024-01-16', value: 35000 },
      { date: '2024-01-17', value: 89000 },
      { date: '2024-01-18', value: 215000 },
      { date: '2024-01-19', value: 456000 },
      { date: '2024-01-20', value: 678000 },
      { date: '2024-01-21', value: 982000 }
    ]
  }
];

async function testEmail() {
  console.log('\nTesting Email Configuration...\n');
  console.log('─'.repeat(70));

  // Check environment variables
  if (!process.env.GMAIL_USER) {
    console.error('GMAIL_USER not set in environment');
    console.log('   Set it with: export GMAIL_USER="your-email@gmail.com"');
    process.exit(1);
  }

  if (!process.env.GMAIL_APP_PASSWORD) {
    console.error('GMAIL_APP_PASSWORD not set in environment');
    console.log('   Set it with: export GMAIL_APP_PASSWORD="your-app-password"');
    process.exit(1);
  }

  console.log('Environment variables found:');
  console.log(`   GMAIL_USER: ${process.env.GMAIL_USER}`);
  console.log(`   GMAIL_APP_PASSWORD: ${'*'.repeat(16)}`);
  console.log('─'.repeat(70));

  try {
    // Initialize email notifier
    console.log('\nInitializing email notifier...');
    const notifier = new EmailNotifier();
    await notifier.initialize();
    console.log('Email notifier initialized');

    // Send test email
    console.log('\nSending test email with sample data...\n');

    await notifier.sendScanResults({
      country: 'US',
      popularCount: samplePopularSongs.length,
      breakoutCount: sampleBreakoutSongs.length,
      popularSongs: samplePopularSongs,
      breakoutSongs: sampleBreakoutSongs,
      popularFile: 'data/test_popular',
      breakoutFile: 'data/test_breakout',
      scanType: 'full',
      duration: 53
    });

    console.log('\n' + '═'.repeat(70));
    console.log('EMAIL TEST SUCCESSFUL!');
    console.log('═'.repeat(70));
    console.log('\nCheck your inbox:');
    console.log(`   - ${process.env.GMAIL_USER}`);
    console.log('   - jossecalif@gmail.com');
    console.log('   - ondiegibri@gmail.com');
    console.log('\nYou should receive:');
    console.log('   - 1 email with Popular songs (batch 1/1)');
    console.log('   - 1 email with Breakout songs (batch 1/1)\n');

  } catch (error) {
    console.log('\n' + '═'.repeat(70));
    console.error('EMAIL TEST FAILED');
    console.log('═'.repeat(70));
    console.error('\nError:', error.message);

    if (error.message.includes('Invalid login')) {
      console.log('\nTroubleshooting:');
      console.log('   1. Make sure you\'re using an App Password, not your regular Gmail password');
      console.log('   2. Enable 2-Step Verification on your Google account');
      console.log('   3. Generate new App Password at: https://myaccount.google.com/apppasswords');
    }

    console.log('');
    process.exit(1);
  }
}

// Run the test
testEmail();
