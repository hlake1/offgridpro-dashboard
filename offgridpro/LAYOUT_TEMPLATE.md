# OffGrid Pro Dashboard — Standard Layout

## Current Standard
All OffGrid Pro reports now use the **v2 layout** defined in `_template/index.html`.

This layout includes:
- Clean, modern hero section with funnel metrics
- 4-month trend charts (Conversions, Impressions, Engagement, Keywords, Site Health)
- Channel awareness breakdown (Google Ads, LinkedIn, Facebook, Instagram, TikTok)
- Traffic strength by channel (Paid Social, Direct, Organic, Paid Search)
- Conversions by campaign
- Followers by platform (LinkedIn, Facebook, Instagram)
- Ad spend vs conversions dual-axis chart

## Reports Using This Layout
✅ june-2026/  
✅ july-2026/  
✅ july-2026-v2/  

## Creating a New Report

1. **Copy the template:**
   ```bash
   cp _template/index.html [month-year]/index.html
   ```

2. **Update the title and period:**
   - Find: `<title>OffGrid Pro — July 2026 · Visual Dashboard (v2)</title>`
   - Change to: `<title>OffGrid Pro — [MONTH] [YEAR] · Visual Dashboard</title>`

   - Find: `<h1>OffGrid Pro — July 2026</h1>`
   - Change to: `<h1>OffGrid Pro — [MONTH] [YEAR]</h1>`

   - Find: `<p class="font-semibold">1 – 31 July 2026</p>`
   - Change to: `<p class="font-semibold">1 – [LAST_DAY] [MONTH] [YEAR]</p>`

3. **Update the DATA object:**
   - Locate: `const DATA = {`
   - Replace values in each series with the month's actual data:
     - `conversions`, `impressions`, `engagement`, `spend`, `keywords`, `siteHealth` (4-value arrays)
     - `awareness`, `traffic`, `convCamp` (July vs June comparisons)
     - `followers`, `ads` (4-month trends)

4. **Update FUNNEL metrics:**
   - Update each stage's `value`, `delta`, and `deltaGood` (true = green/up, false = red/down)

5. **Commit and push:**
   ```bash
   git add [month-year]/index.html
   git commit -m "feat: Add [Month] [Year] report with standard layout"
   git push origin main
   ```

## Data Structure

### 4-month trends (array of 4 values)
```javascript
const MONTHS = ['April','May','June','July'];
const DATA = {
  conversions: { series: [3, 4, 5, 18], ... },
  impressions: { series: [12500, 28800, 25300, 72400], ... },
  // ... etc
};
```

### Month-to-month comparisons (July vs June)
```javascript
DATA.awareness = {
  labels: ['Google Ads','LinkedIn','Facebook','Instagram','TikTok'],
  july:   [3838, 1936, 19400, 45000, 5700],
  june:   [4100, 1496, 2400, 7800, 0],
};
```

## Key Points
- **Month ordering is chronological** — June before July in all comparison charts
- **All reports should match** this layout for consistency
- Update the template if layout changes; all future reports inherit the update
- Data validation: Always verify numbers match source before publishing
