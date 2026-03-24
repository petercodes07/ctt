#!/usr/bin/env node

/**
 * Scan State Manager
 * Persists scan progress so app can resume after close/sleep
 */

const fs = require('fs').promises;
const path = require('path');

class ScanStateManager {
  constructor(stateDir = 'data/state') {
    this.stateDir = stateDir;
    this.stateFile = path.join(stateDir, 'scan_state.json');
  }

  async ensureStateDir() {
    try {
      await fs.mkdir(this.stateDir, { recursive: true });
    } catch (error) {}
  }

  /**
   * Save current scan state
   */
  async saveState(state) {
    await this.ensureStateDir();

    const stateData = {
      ...state,
      last_updated: new Date().toISOString(),
      version: '1.0'
    };

    await fs.writeFile(this.stateFile, JSON.stringify(stateData, null, 2), 'utf-8');
    return { success: true };
  }

  /**
   * Load saved scan state
   */
  async loadState() {
    try {
      const data = await fs.readFile(this.stateFile, 'utf-8');
      const state = JSON.parse(data);

      return {
        success: true,
        state,
        age: Date.now() - new Date(state.last_updated).getTime()
      };
    } catch (error) {
      return { success: false, state: null, age: null };
    }
  }

  /**
   * Check if we should resume a scan
   */
  async shouldResume() {
    const loaded = await this.loadState();

    if (!loaded.success) {
      return { resume: false, reason: 'no_saved_state' };
    }

    const state = loaded.state;

    // Don't resume if scan is complete
    if (state.status === 'completed') {
      return { resume: false, reason: 'scan_already_complete' };
    }

    // Don't resume if it's been more than 24 hours
    const age = loaded.age;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    if (age > maxAge) {
      return { resume: false, reason: 'state_too_old', ageHours: Math.round(age / 3600000) };
    }

    // Resume if scan was in progress or paused
    if (state.status === 'in_progress' || state.status === 'paused') {
      return {
        resume: true,
        state,
        ageMinutes: Math.round(age / 60000)
      };
    }

    return { resume: false, reason: 'unknown_status', status: state.status };
  }

  /**
   * Create initial scan state
   */
  createInitialState(countries, options = {}) {
    return {
      status: 'in_progress',
      started_at: new Date().toISOString(),
      paused_at: null,
      completed_at: null,
      total_countries: countries.length,
      countries: countries.map(c => ({
        code: c.code || c,
        name: c.name || c,
        popular: { status: 'pending', completed_at: null, songs: 0 },
        breakout: { status: 'pending', completed_at: null, songs: 0 }
      })),
      options: {
        limit: options.limit || 100,
        parallel: options.parallel || 2,
        ...options
      },
      progress: {
        countries_completed: 0,
        countries_pending: countries.length,
        total_songs: 0
      }
    };
  }

  /**
   * Mark country/tab as complete
   */
  async markComplete(countryCode, tab, songCount) {
    const loaded = await this.loadState();
    if (!loaded.success) return { success: false };

    const state = loaded.state;
    const country = state.countries.find(c => c.code === countryCode);

    if (!country) return { success: false };

    country[tab] = {
      status: 'completed',
      completed_at: new Date().toISOString(),
      songs: songCount
    };

    // Update progress
    const allTabsComplete = (c) =>
      c.popular.status === 'completed' && c.breakout.status === 'completed';

    state.progress.countries_completed = state.countries.filter(allTabsComplete).length;
    state.progress.countries_pending = state.total_countries - state.progress.countries_completed;
    state.progress.total_songs = state.countries.reduce((sum, c) =>
      sum + (c.popular.songs || 0) + (c.breakout.songs || 0), 0
    );

    // Mark overall scan as complete if all countries done
    if (state.progress.countries_pending === 0) {
      state.status = 'completed';
      state.completed_at = new Date().toISOString();
    }

    await this.saveState(state);
    return { success: true, state };
  }

  /**
   * Mark scan as paused (when app closes/sleeps)
   */
  async pause() {
    const loaded = await this.loadState();
    if (!loaded.success) return { success: false };

    const state = loaded.state;
    state.status = 'paused';
    state.paused_at = new Date().toISOString();

    await this.saveState(state);
    return { success: true };
  }

  /**
   * Resume scan (when app reopens)
   */
  async resume() {
    const loaded = await this.loadState();
    if (!loaded.success) return { success: false };

    const state = loaded.state;
    state.status = 'in_progress';

    await this.saveState(state);
    return { success: true, state };
  }

  /**
   * Get pending countries (not yet completed)
   */
  async getPendingCountries() {
    const loaded = await this.loadState();
    if (!loaded.success) return { success: false, pending: [] };

    const state = loaded.state;
    const pending = state.countries.filter(c =>
      c.popular.status !== 'completed' || c.breakout.status !== 'completed'
    );

    return {
      success: true,
      pending: pending.map(c => ({
        code: c.code,
        name: c.name,
        needsPopular: c.popular.status !== 'completed',
        needsBreakout: c.breakout.status !== 'completed'
      })),
      completed: state.progress.countries_completed,
      total: state.total_countries
    };
  }

  /**
   * Clear saved state (start fresh)
   */
  async clearState() {
    try {
      await fs.unlink(this.stateFile);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get state summary for display
   */
  async getSummary() {
    const loaded = await this.loadState();
    if (!loaded.success) {
      return { exists: false };
    }

    const state = loaded.state;
    const age = loaded.age;

    return {
      exists: true,
      status: state.status,
      started_at: state.started_at,
      paused_at: state.paused_at,
      completed_at: state.completed_at,
      age_minutes: Math.round(age / 60000),
      age_hours: Math.round(age / 3600000),
      progress: {
        completed: state.progress.countries_completed,
        pending: state.progress.countries_pending,
        total: state.total_countries,
        percentage: Math.round((state.progress.countries_completed / state.total_countries) * 100)
      },
      total_songs: state.progress.total_songs
    };
  }
}

module.exports = ScanStateManager;
