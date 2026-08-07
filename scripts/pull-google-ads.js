#!/usr/bin/env node
/**
 * Pull live Google Ads data from Maton for OffGrid Pro and save it to data.json.
 *
 * READ-ONLY. This script only performs GET/search queries. It never mutates ad
 * data (no create/update/delete/pause/resume/budget changes/keyword changes).
 * Rule locked in by Herbie on 2026-07-15.
 *
 * Env vars required:
 *   MATON_API_KEY   Maton API key for the herbielakeai@gmail.com account
 *
 * Usage:
 *   MATON_API_KEY=... node scripts/pull-google-ads.js                # last 28 days (default)
 *   MATON_API_KEY=... node scripts/pull-google-ads.js live            # last 28 days
 *   MATON_API_KEY=... node scripts/pull-google-ads.js last-28-days    # last 28 days
 *   MATON_API_KEY=... node scripts/pull-google-ads.js last-N-days     # rolling window of N days (2..90)
 *   MATON_API_KEY=... node scripts/pull-google-ads.js YYYY-MM         # a specific calendar month
 *   MATON_API_KEY=... node scripts/pull-google-ads.js prev-month      # previous calendar month
 *
 * Output location:
 *   - Rolling windows write to: offgridpro/live/data.json
 *   - Monthly windows write to: <YYYY-MM>/data.json (with legacy folder 'june-2026' for 2026-06)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const CUSTOMER_ID = '1540152294'; // Off Grid Pro (GBP, Europe/London)
const API_VERSION = 'v24';
const BASE_URL = `https://api.maton.ai/google-ads/${API_VERSION}/customers/${CUSTOMER_ID}`;

const MATON_API_KEY = process.env.MATON_API_KEY;
if (!MATON_API_KEY) {
  console.error('ERROR: MATON_API_KEY env var is required.');
  process.exit(1);
}

// ---------- Date helpers ----------

function pad(n) { return String(n).padStart(2, '0'); }

function monthRange(yyyyMm) {
  const [y, m] = yyyyMm.split('-').map(Number);
  const start = `${y}-${pad(m)}-01`;
  const endDate = new Date(Date.UTC(y, m, 0)); // last day of month
  const end = `${y}-${pad(m)}-${pad(endDate.getUTCDate())}`;
  return { start, end };
}

function previousMonth() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed; 0 => Jan of last year handled by Date rollover
  const prev = new Date(Date.UTC(y, m - 1, 1));
  return `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}`;
}

// ---------- Period resolver ----------

/**
 * Resolve the incoming CLI argument into a normalised period descriptor.
 *   { mode: 'rolling', days, start, end, label }
 *   { mode: 'monthly', month, start, end, label }
 */
function resolvePeriod(arg) {
  // Rolling-window shorthands
  const rollingAliases = new Set(['live', 'last-28-days', '28-days', 'rolling']);
  if (!arg || rollingAliases.has(arg)) {
    return rollingWindow(28);
  }
  const m = /^last-(\d{1,2})-days?$/.exec(arg);
  if (m) {
    const n = Math.max(2, Math.min(90, Number(m[1])));
    return rollingWindow(n);
  }

  // Monthly shorthands / explicit YYYY-MM
  if (arg === 'prev-month') {
    return monthlyPeriod(previousMonth());
  }
  if (/^\d{4}-\d{2}$/.test(arg)) {
    return monthlyPeriod(arg);
  }

  throw new Error(`Unrecognised period argument: '${arg}'`);
}

function rollingWindow(days) {
  // Google Ads reporting is settled to the account timezone (Europe/London for
  // OffGrid Pro). We use UTC midnight for the boundary; drift of a few hours
  // is acceptable for a rolling window.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  // 'Today' is often partial, but Google Ads will still return whatever has
  // been reported so far. Include it so the dashboard feels current.
  const end = new Date(today);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return {
    mode: 'rolling',
    days,
    start: formatDate(start),
    end: formatDate(end),
    label: `Last ${days} days`,
  };
}

function monthlyPeriod(yyyyMm) {
  const { start, end } = monthRange(yyyyMm);
  return { mode: 'monthly', month: yyyyMm, start, end, label: yyyyMm };
}

function formatDate(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const period = resolvePeriod(process.argv[2]);
const { start: dateStart, end: dateEnd } = period;

console.log(`▶ Pulling Google Ads data for ${period.label} (${dateStart} → ${dateEnd})`);

// ---------- Maton API caller ----------

function postSearch(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const req = https.request(`${BASE_URL}/googleAds:search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MATON_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(`API error: ${JSON.stringify(json.error)}`));
          resolve(json);
        } catch (e) {
          reject(new Error(`Parse error: ${e.message} — response: ${data.slice(0, 500)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---------- Data shapers ----------

function microsToPounds(micros) {
  return Math.round((Number(micros) / 1_000_000) * 100) / 100;
}

function pctToPercent(v) {
  return Math.round(Number(v) * 10000) / 100; // 0.0743 -> 7.43
}

async function fetchCustomer() {
  const res = await postSearch(
    `SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.status FROM customer`
  );
  const c = res.results?.[0]?.customer || {};
  return {
    id: c.id,
    name: c.descriptiveName,
    currency: c.currencyCode,
    timezone: c.timeZone,
    status: c.status,
  };
}

async function fetchCampaigns() {
  const res = await postSearch(
    `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
            metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions,
            metrics.ctr, metrics.average_cpc
     FROM campaign
     WHERE segments.date BETWEEN '${dateStart}' AND '${dateEnd}'
     ORDER BY metrics.impressions DESC`
  );
  return (res.results || []).map(r => ({
    id: r.campaign.id,
    name: r.campaign.name,
    status: r.campaign.status,
    channelType: r.campaign.advertisingChannelType,
    impressions: Number(r.metrics.impressions || 0),
    clicks: Number(r.metrics.clicks || 0),
    conversions: Number(r.metrics.conversions || 0),
    cost: microsToPounds(r.metrics.costMicros || 0),
    ctr: pctToPercent(r.metrics.ctr || 0),
    cpc: microsToPounds(r.metrics.averageCpc || 0),
  }));
}

async function fetchKeywords(campaignName, limit = 20) {
  const res = await postSearch(
    `SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
            metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions,
            metrics.ctr, metrics.average_cpc
     FROM keyword_view
     WHERE segments.date BETWEEN '${dateStart}' AND '${dateEnd}'
       AND campaign.name = '${campaignName}'
       AND metrics.clicks > 0
     ORDER BY metrics.clicks DESC
     LIMIT ${limit}`
  );
  return (res.results || []).map(r => ({
    keyword: r.adGroupCriterion.keyword.text,
    matchType: r.adGroupCriterion.keyword.matchType,
    impressions: Number(r.metrics.impressions || 0),
    clicks: Number(r.metrics.clicks || 0),
    conversions: Number(r.metrics.conversions || 0),
    cost: microsToPounds(r.metrics.costMicros || 0),
    ctr: pctToPercent(r.metrics.ctr || 0),
    cpc: microsToPounds(r.metrics.averageCpc || 0),
  }));
}

async function fetchSearchTerms(limit = 25) {
  const res = await postSearch(
    `SELECT search_term_view.search_term, campaign.name,
            metrics.impressions, metrics.clicks, metrics.conversions
     FROM search_term_view
     WHERE segments.date BETWEEN '${dateStart}' AND '${dateEnd}'
       AND metrics.clicks > 0
     ORDER BY metrics.clicks DESC
     LIMIT ${limit}`
  );
  return (res.results || []).map(r => ({
    term: r.searchTermView.searchTerm,
    campaign: r.campaign.name,
    impressions: Number(r.metrics.impressions || 0),
    clicks: Number(r.metrics.clicks || 0),
    conversions: Number(r.metrics.conversions || 0),
  }));
}

async function fetchAds(limit = 10) {
  // Pull top ads by impressions with headline + description text where available.
  const res = await postSearch(
    `SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type,
            ad_group_ad.ad.responsive_search_ad.headlines,
            ad_group_ad.ad.responsive_search_ad.descriptions,
            campaign.name,
            metrics.impressions, metrics.clicks, metrics.ctr
     FROM ad_group_ad
     WHERE segments.date BETWEEN '${dateStart}' AND '${dateEnd}'
       AND metrics.impressions > 0
     ORDER BY metrics.impressions DESC
     LIMIT ${limit}`
  );
  return (res.results || []).map(r => ({
    id: r.adGroupAd.ad.id,
    campaign: r.campaign.name,
    type: r.adGroupAd.ad.type,
    headlines: (r.adGroupAd.ad.responsiveSearchAd?.headlines || []).map(h => h.text).filter(Boolean),
    descriptions: (r.adGroupAd.ad.responsiveSearchAd?.descriptions || []).map(d => d.text).filter(Boolean),
    impressions: Number(r.metrics.impressions || 0),
    clicks: Number(r.metrics.clicks || 0),
    ctr: pctToPercent(r.metrics.ctr || 0),
  }));
}

// ---------- Orchestrate ----------

async function main() {
  const [customer, campaigns, homeEnergyKeywords, victronKeywords, searchTerms, topAds] = await Promise.all([
    fetchCustomer(),
    fetchCampaigns(),
    fetchKeywords('Home Energy'),
    fetchKeywords('Victron'),
    fetchSearchTerms(),
    fetchAds(),
  ]);

  // Roll-up totals (active + paused campaigns)
  const totals = campaigns.reduce((acc, c) => {
    acc.impressions += c.impressions;
    acc.clicks += c.clicks;
    acc.conversions += c.conversions;
    acc.cost += c.cost;
    return acc;
  }, { impressions: 0, clicks: 0, conversions: 0, cost: 0 });
  totals.cost = Math.round(totals.cost * 100) / 100;
  totals.ctr = totals.impressions ? Math.round((totals.clicks / totals.impressions) * 10000) / 100 : 0;
  totals.cpc = totals.clicks ? Math.round((totals.cost / totals.clicks) * 100) / 100 : 0;

  const data = {
    meta: {
      pulledAt: new Date().toISOString(),
      source: 'Google Ads API via Maton',
      period: {
        mode: period.mode,
        label: period.label,
        start: dateStart,
        end: dateEnd,
        ...(period.mode === 'rolling' ? { days: period.days } : { month: period.month }),
      },
      customer,
      readOnly: true,
    },
    totals,
    campaigns,
    keywords: {
      homeEnergy: homeEnergyKeywords,
      victron: victronKeywords,
    },
    searchTerms,
    topAds,
  };

  // Output location depends on period mode:
  //   rolling  → offgridpro/live/data.json (this is what the Live Metrics page reads)
  //   monthly  → <YYYY-MM>/data.json (with legacy alias for June 2026)
  let outPath;
  if (period.mode === 'rolling') {
    outPath = path.join(__dirname, '..', 'offgridpro', 'live', 'data.json');
  } else {
    const folderName = period.month === '2026-06' ? 'june-2026' : period.month;
    outPath = path.join(__dirname, '..', folderName, 'data.json');
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));

  console.log(`✅ Wrote ${outPath}`);
  console.log(`   Campaigns: ${campaigns.length}`);
  console.log(`   Home Energy keywords: ${homeEnergyKeywords.length}`);
  console.log(`   Victron keywords: ${victronKeywords.length}`);
  console.log(`   Search terms: ${searchTerms.length}`);
  console.log(`   Top ads: ${topAds.length}`);
  console.log(`   Total clicks: ${totals.clicks} | Total spend: £${totals.cost} | Conversions: ${totals.conversions}`);
}

main().catch(err => {
  console.error('❌ Pull failed:', err.message);
  process.exit(1);
});
