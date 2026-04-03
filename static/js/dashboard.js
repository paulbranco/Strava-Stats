/* ── Strava Stats Dashboard ─────────────────────────────────────────────── */

// ── Constants & helpers ──────────────────────────────────────────────────

const STRAVA_ORANGE = '#FC4C02';

const SPORT_ICONS = {
  Run: '🏃', TrailRun: '🏃', VirtualRun: '🏃',
  Ride: '🚴', VirtualRide: '🚴', MountainBikeRide: '🚵', EBikeRide: '🚴', Velomobile: '🚴',
  Swim: '🏊',
  Walk: '🚶', Hike: '🥾',
  WeightTraining: '🏋️', Workout: '💪',
  Yoga: '🧘',
  Rowing: '🚣', Kayaking: '🛶',
  AlpineSki: '⛷️', BackcountrySki: '⛷️', NordicSki: '⛷️', Snowboard: '🏂',
  Soccer: '⚽', Tennis: '🎾', Basketball: '🏀', Golf: '⛳',
  StandUpPaddling: '🏄',
};

function sportIcon(type) {
  return SPORT_ICONS[type] || '🎯';
}

function metersToMiles(m) { return m * 0.000621371; }
function metersToFeet(m)  { return m * 3.28084; }
function metersToYards(m) { return m * 1.09361; }

function fmtMiles(miles) { return miles.toFixed(1) + ' mi'; }
function fmtKm(m)        { return (m / 1000).toFixed(1) + ' km'; }
function fmtFeet(ft)     { return Math.round(ft).toLocaleString() + ' ft'; }
function fmtMeters(m)    { return Math.round(m).toLocaleString() + ' m'; }
function fmtYards(yd)    { return Math.round(yd).toLocaleString() + ' yd'; }

function fmtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

function fmtTimeLong(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

/** Returns pace (min/mi) formatted as "MM:SS /mi", or speed in mph. */
function fmtPace(activity) {
  const type = activity.sport_type || activity.type || '';
  const mps  = activity.average_speed || 0;
  if (!mps) return '—';

  const runTypes  = ['Run','TrailRun','VirtualRun','Walk','Hike'];
  const rideTypes = ['Ride','VirtualRide','MountainBikeRide','EBikeRide','Velomobile'];
  const swimTypes = ['Swim'];

  if (runTypes.includes(type)) {
    const minPerMile = (1 / (mps * 0.000621371)) / 60;
    const mins = Math.floor(minPerMile);
    const secs = Math.round((minPerMile - mins) * 60);
    return `${mins}:${String(secs).padStart(2,'0')} /mi`;
  }
  if (rideTypes.includes(type)) {
    return `${(mps * 2.23694).toFixed(1)} mph`;
  }
  if (swimTypes.includes(type)) {
    const yardsPerSec    = mps * 1.09361;
    const secsPerHundred = 100 / yardsPerSec;
    const m = Math.floor(secsPerHundred / 60);
    const s = Math.round(secsPerHundred % 60);
    return `${m}:${String(s).padStart(2,'0')} /100yd`;
  }
  return `${(mps * 2.23694).toFixed(1)} mph`;
}

/** Format distance appropriately for sport type. */
function fmtDistance(activity) {
  const type = activity.sport_type || activity.type || '';
  const m    = activity.distance || 0;
  if (type === 'Swim') return fmtYards(metersToYards(m));
  return fmtMiles(metersToMiles(m));
}

function distanceSortVal(activity) { return activity.distance || 0; }

function activityYear(activity) {
  const d = activity.start_date_local || activity.start_date || '';
  return d ? parseInt(d.slice(0, 4)) : 0;
}

function activityDate(activity) {
  const d = activity.start_date_local || activity.start_date || '';
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Returns "YYYY-Www" ISO week bucket
function isoWeekKey(dateStr) {
  if (!dateStr) return null;
  const d   = new Date(dateStr);
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo    = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// Convert an ISO week key back to its Monday date
function isoWeekToMonday(weekKey) {
  const [yr, wStr] = weekKey.split('-W');
  const week  = parseInt(wStr);
  const jan4  = new Date(parseInt(yr), 0, 4);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
  return monday;
}

// ── State ────────────────────────────────────────────────────────────────

const allActivities = JSON.parse(
  document.getElementById('activities-data').textContent
);

let dateStart = '';
let dateEnd   = '';
const selectedSports = new Set();
let searchQuery  = '';
let sortColumn   = 'date';
let sortDir      = 'desc';
let currentPage  = 1;
let pageSize     = 25;

let weeklyChart      = null;
let weeklyTimeChart  = null;
let monthlyChart     = null;
let monthlyTimeChart = null;
let sportChart       = null;
let sportTimeChart   = null;
let paceChart        = null;
let elevationChart   = null;

const heatmapMonths = new Set(); // 1-indexed months; empty = all

// ── Sport color map (built once so colors are stable across filters) ──────

const CHART_COLORS = [
  '#FC4C02','#1a56b0','#2e7d32','#0277bd','#e65100',
  '#880e4f','#6a1b9a','#00695c','#4527a0','#c62828',
  '#0d47a1','#1b5e20','#827717','#4e342e','#263238',
];

const SPORT_COLOR_MAP = (() => {
  const sports = [...new Set(
    allActivities.map(a => a.sport_type || a.type || 'Other')
  )].sort();
  const map = {};
  sports.forEach((s, i) => { map[s] = CHART_COLORS[i % CHART_COLORS.length]; });
  return map;
})();

function sportColor(sport) {
  return SPORT_COLOR_MAP[sport] || CHART_COLORS[CHART_COLORS.length - 1];
}

// ── Filtering ────────────────────────────────────────────────────────────

function getFilteredActivities() {
  return allActivities.filter(a => {
    const sport   = a.sport_type || a.type || '';
    const actDate = (a.start_date_local || a.start_date || '').slice(0, 10);

    if (dateStart && actDate < dateStart) return false;
    if (dateEnd   && actDate > dateEnd)   return false;
    if (selectedSports.size > 0 && !selectedSports.has(sport)) return false;
    if (searchQuery) {
      const name = (a.name || '').toLowerCase();
      if (!name.includes(searchQuery.toLowerCase())) return false;
    }
    return true;
  });
}

// ── Stats cards ──────────────────────────────────────────────────────────

function updateStats(activities) {
  const totalM    = activities.reduce((s, a) => s + (a.distance || 0), 0);
  const totalSecs = activities.reduce((s, a) => s + (a.moving_time || 0), 0);
  const totalElev = activities.reduce((s, a) => s + (a.total_elevation_gain || 0), 0);

  document.getElementById('stat-distance').textContent    = fmtMiles(metersToMiles(totalM));
  document.getElementById('stat-distance-km').textContent = fmtKm(totalM);
  document.getElementById('stat-time').textContent        = fmtTime(totalSecs);
  document.getElementById('stat-elevation').textContent   = fmtFeet(metersToFeet(totalElev));
  document.getElementById('stat-elevation-m').textContent = fmtMeters(totalElev);
  document.getElementById('stat-count').textContent       = activities.length.toLocaleString();
}

// ── Weekly chart builder (shared) ─────────────────────────────────────────

/**
 * Build stacked-bar chart data broken down by sport for a given week metric.
 * valueGetter(activity) → numeric value to accumulate.
 */
function buildWeeklyStackedData(activities, valueGetter) {
  // Collect all week keys
  const weekKeySet = new Set();
  for (const a of activities) {
    const k = isoWeekKey(a.start_date_local || a.start_date);
    if (k) weekKeySet.add(k);
  }
  const keys = [...weekKeySet].sort();

  // Axis labels (short) and tooltip labels (with day of week)
  const labels        = keys.map(k => isoWeekToMonday(k).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  const tooltipLabels = keys.map(k => isoWeekToMonday(k).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));

  // Sports present in the current filtered set (sorted for stable ordering)
  const sports = [...new Set(
    activities.map(a => a.sport_type || a.type || 'Other')
  )].sort();

  // Accumulate per sport per week
  const buckets = {};
  for (const sport of sports) {
    buckets[sport] = {};
    for (const k of keys) buckets[sport][k] = 0;
  }
  for (const a of activities) {
    const k = isoWeekKey(a.start_date_local || a.start_date);
    if (!k) continue;
    const sport = a.sport_type || a.type || 'Other';
    buckets[sport][k] = (buckets[sport][k] || 0) + valueGetter(a);
  }

  const datasets = sports.map(sport => ({
    label: `${sportIcon(sport)} ${sport}`,
    data: keys.map(k => +(buckets[sport][k] || 0).toFixed(2)),
    backgroundColor: sportColor(sport) + 'cc',
    borderColor: sportColor(sport),
    borderWidth: 1,
    borderRadius: 2,
  }));

  return { labels, tooltipLabels, datasets };
}

// ── Shared: rolling average line dataset ──────────────────────────────────

/**
 * Given per-week total values, return a cumulative rolling-average array.
 * avg[i] = mean of values[0..i]  (expanding window across the full timeline).
 */
function cumulativeAvgDataset(weekTotals, label, color) {
  let runSum = 0;
  const data = weekTotals.map((v, i) => { runSum += v; return +(runSum / (i + 1)).toFixed(3); });
  return {
    type: 'line',
    label,
    data,
    borderColor: color,
    borderWidth: 2,
    borderDash: [5, 3],
    backgroundColor: 'transparent',
    pointRadius: 0,
    pointHoverRadius: 4,
    fill: false,
    tension: 0.4,
    order: 0,   // draw on top of bars
  };
}

// ── Weekly Distance chart ─────────────────────────────────────────────────

function updateWeeklyChart(activities) {
  const { labels, tooltipLabels, datasets } = buildWeeklyStackedData(
    activities,
    a => metersToMiles(a.distance || 0)
  );

  // Cumulative rolling average across the full timeline
  const weekTotals = labels.map((_, i) => datasets.reduce((s, ds) => s + (ds.data[i] || 0), 0));
  const avgDs = cumulativeAvgDataset(weekTotals, 'Rolling Avg', 'rgba(80,80,80,0.55)');

  if (weeklyChart) { weeklyChart.destroy(); weeklyChart = null; }

  const ctx = document.getElementById('weekly-chart').getContext('2d');
  weeklyChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [...datasets, avgDs] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 11 }, boxWidth: 12, padding: 8 },
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            title: items => tooltipLabels[items[0].dataIndex],
            label: item => {
              if (item.dataset.label === 'Rolling Avg') {
                return ` Rolling Avg: ${item.parsed.y.toFixed(1)} mi/wk`;
              }
              return item.parsed.y > 0 ? ` ${item.dataset.label}: ${item.parsed.y.toFixed(1)} mi` : null;
            },
            footer: items => {
              const total = items
                .filter(i => i.dataset.label !== 'Rolling Avg')
                .reduce((s, i) => s + i.parsed.y, 0);
              return `Total: ${total.toFixed(1)} mi`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { maxTicksLimit: 12, font: { size: 11 } },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: '#f0f0f0' },
          ticks: { font: { size: 11 }, callback: v => v + ' mi' },
        },
      },
    },
  });
}

// ── Weekly Time chart ─────────────────────────────────────────────────────

function fmtHoursShort(h) {
  if (h === 0) return '0h';
  if (h < 1)   return Math.round(h * 60) + 'm';
  return h % 1 === 0 ? h + 'h' : h.toFixed(1) + 'h';
}

function updateWeeklyTimeChart(activities) {
  const { labels, tooltipLabels, datasets } = buildWeeklyStackedData(
    activities,
    a => (a.moving_time || 0) / 3600   // seconds → hours
  );

  // Cumulative rolling average across the full timeline
  const weekTotals = labels.map((_, i) => datasets.reduce((s, ds) => s + (ds.data[i] || 0), 0));
  const avgDs = cumulativeAvgDataset(weekTotals, 'Rolling Avg', 'rgba(80,80,80,0.55)');

  if (weeklyTimeChart) { weeklyTimeChart.destroy(); weeklyTimeChart = null; }

  const ctx = document.getElementById('weekly-time-chart').getContext('2d');
  weeklyTimeChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [...datasets, avgDs] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 11 }, boxWidth: 12, padding: 8 },
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            title: items => tooltipLabels[items[0].dataIndex],
            label: item => {
              if (item.dataset.label === 'Rolling Avg') {
                return ` Rolling Avg: ${fmtHoursShort(item.parsed.y)}/wk`;
              }
              return item.parsed.y > 0 ? ` ${item.dataset.label}: ${fmtHoursShort(item.parsed.y)}` : null;
            },
            footer: items => {
              const total = items
                .filter(i => i.dataset.label !== 'Rolling Avg')
                .reduce((s, i) => s + i.parsed.y, 0);
              const h = Math.floor(total);
              const m = Math.round((total - h) * 60);
              return h > 0 ? `Total: ${h}h ${String(m).padStart(2,'0')}m` : `Total: ${m}m`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { maxTicksLimit: 12, font: { size: 11 } },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: '#f0f0f0' },
          ticks: { font: { size: 11 }, callback: v => fmtHoursShort(v) },
        },
      },
    },
  });
}

// ── Sport breakdown chart ─────────────────────────────────────────────────

function updateSportChart(activities) {
  const totals = {};
  for (const a of activities) {
    const sport = a.sport_type || a.type || 'Other';
    totals[sport] = (totals[sport] || 0) + metersToMiles(a.distance || 0);
  }
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([s]) => `${sportIcon(s)} ${s}`);
  const values = sorted.map(([, v]) => +v.toFixed(2));
  const colors = sorted.map(([s]) => sportColor(s));

  const ctx = document.getElementById('sport-chart').getContext('2d');
  if (sportChart) {
    sportChart.data.labels                        = labels;
    sportChart.data.datasets[0].data              = values;
    sportChart.data.datasets[0].backgroundColor   = colors;
    sportChart.update();
    return;
  }
  sportChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 11 }, boxWidth: 12, padding: 8 },
        },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.parsed.toFixed(1)} mi` },
        },
      },
    },
  });
}

// ── Activity table ────────────────────────────────────────────────────────

function sortActivities(activities) {
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...activities].sort((a, b) => {
    switch (sortColumn) {
      case 'date':      return dir * ((a.start_date || '').localeCompare(b.start_date || ''));
      case 'sport':     return dir * ((a.sport_type || a.type || '').localeCompare(b.sport_type || b.type || ''));
      case 'distance':  return dir * (distanceSortVal(a) - distanceSortVal(b));
      case 'time':      return dir * ((a.moving_time || 0) - (b.moving_time || 0));
      case 'pace':      return dir * ((a.average_speed || 0) - (b.average_speed || 0));
      case 'elevation': return dir * ((a.total_elevation_gain || 0) - (b.total_elevation_gain || 0));
      default:          return 0;
    }
  });
}

function sportBadgeClass(type) {
  const known = ['Run','Ride','VirtualRide','MountainBikeRide','Swim','Walk','Hike',
                 'TrailRun','WeightTraining','Yoga','Workout','Rowing'];
  return known.includes(type) ? `sport-${type}` : 'sport-default';
}

function updateTable(activities) {
  const tbody  = document.getElementById('activity-tbody');
  const sorted = sortActivities(activities);
  const total  = sorted.length;

  document.getElementById('table-count').textContent = total.toLocaleString();

  const emptyState = document.getElementById('empty-state');
  if (total === 0) {
    tbody.innerHTML = '';
    emptyState.classList.remove('d-none');
    renderPagination(0);
    return;
  }
  emptyState.classList.add('d-none');

  const totalPages = Math.ceil(total / pageSize);
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const start = (currentPage - 1) * pageSize;
  const page  = sorted.slice(start, start + pageSize);

  const rows = page.map(a => {
    const sport  = a.sport_type || a.type || 'Other';
    const date   = activityDate(a);
    const name   = a.name || '—';
    const dist   = fmtDistance(a);
    const time   = fmtTimeLong(a.moving_time || 0);
    const pace   = fmtPace(a);
    const elevFt = a.total_elevation_gain ? fmtFeet(metersToFeet(a.total_elevation_gain)) : '—';

    return `<tr>
      <td class="text-muted" style="white-space:nowrap">${date}</td>
      <td>
        <a href="https://www.strava.com/activities/${a.id}" target="_blank"
           rel="noopener" class="text-decoration-none fw-semibold text-dark">
          ${escHtml(name)}
        </a>
      </td>
      <td><span class="sport-badge ${sportBadgeClass(sport)}">${sportIcon(sport)} ${sport}</span></td>
      <td class="text-end text-nowrap">${dist}</td>
      <td class="text-end text-nowrap">${time}</td>
      <td class="text-end text-nowrap">${pace}</td>
      <td class="text-end text-nowrap">${elevFt}</td>
    </tr>`;
  });

  tbody.innerHTML = rows.join('');
  renderPagination(total);
}

function renderPagination(total) {
  const totalPages = Math.ceil(total / pageSize);
  const info       = document.getElementById('pagination-info');
  const controls   = document.getElementById('pagination-controls');
  const bar        = document.getElementById('pagination-bar');

  if (total === 0) {
    info.textContent  = '';
    controls.innerHTML = '';
    bar.style.display = 'none';
    return;
  }

  bar.style.display = '';
  const start = (currentPage - 1) * pageSize + 1;
  const end   = Math.min(currentPage * pageSize, total);
  info.textContent = `Showing ${start}–${end} of ${total.toLocaleString()} entries`;

  const buttons = [];

  buttons.push(`<li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
    <a class="page-link" href="#" data-page="${currentPage - 1}" aria-label="Previous">&#8249;</a>
  </li>`);

  const delta = 2;
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
      pages.push(i);
    }
  }
  let prev = null;
  for (const p of pages) {
    if (prev !== null && p - prev > 1) {
      buttons.push(`<li class="page-item disabled"><a class="page-link" href="#">…</a></li>`);
    }
    buttons.push(`<li class="page-item ${p === currentPage ? 'active' : ''}">
      <a class="page-link" href="#" data-page="${p}">${p}</a>
    </li>`);
    prev = p;
  }

  buttons.push(`<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
    <a class="page-link" href="#" data-page="${currentPage + 1}" aria-label="Next">&#8250;</a>
  </li>`);

  controls.innerHTML = buttons.join('');

  controls.querySelectorAll('[data-page]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const p = parseInt(link.dataset.page);
      if (p >= 1 && p <= totalPages && p !== currentPage) {
        currentPage = p;
        updateTable(getFilteredActivities());
        document.getElementById('activity-table').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Monthly Distance chart ────────────────────────────────────────────────

function buildMonthlyStackedData(activities, valueGetter) {
  const monthKeySet = new Set();
  for (const a of activities) {
    const d = a.start_date_local || a.start_date || '';
    if (d) monthKeySet.add(d.slice(0, 7)); // "YYYY-MM"
  }
  const keys = [...monthKeySet].sort();

  const MNAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const labels = keys.map(k => {
    const [yr, mo] = k.split('-');
    return `${MNAMES[parseInt(mo) - 1]} '${yr.slice(2)}`;
  });

  const sports = [...new Set(activities.map(a => a.sport_type || a.type || 'Other'))].sort();

  const buckets = {};
  for (const sport of sports) {
    buckets[sport] = {};
    for (const k of keys) buckets[sport][k] = 0;
  }
  for (const a of activities) {
    const d = a.start_date_local || a.start_date || '';
    if (!d) continue;
    const k     = d.slice(0, 7);
    const sport = a.sport_type || a.type || 'Other';
    buckets[sport][k] = (buckets[sport][k] || 0) + valueGetter(a);
  }

  const datasets = sports.map(sport => ({
    label: `${sportIcon(sport)} ${sport}`,
    data: keys.map(k => +(buckets[sport][k] || 0).toFixed(2)),
    backgroundColor: sportColor(sport) + 'cc',
    borderColor: sportColor(sport),
    borderWidth: 1,
    borderRadius: 2,
  }));

  return { labels, datasets };
}

function updateMonthlyChart(activities) {
  const { labels, datasets } = buildMonthlyStackedData(
    activities,
    a => metersToMiles(a.distance || 0)
  );

  const monthTotals = labels.map((_, i) => datasets.reduce((s, ds) => s + (ds.data[i] || 0), 0));
  const avgDs = cumulativeAvgDataset(monthTotals, 'Rolling Avg', 'rgba(80,80,80,0.55)');

  if (monthlyChart) { monthlyChart.destroy(); monthlyChart = null; }

  const ctx = document.getElementById('monthly-chart').getContext('2d');
  monthlyChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [...datasets, avgDs] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 11 }, boxWidth: 12, padding: 8 },
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: item => {
              if (item.dataset.label === 'Rolling Avg') {
                return ` Rolling Avg: ${item.parsed.y.toFixed(1)} mi/mo`;
              }
              return item.parsed.y > 0 ? ` ${item.dataset.label}: ${item.parsed.y.toFixed(1)} mi` : null;
            },
            footer: items => {
              const total = items
                .filter(i => i.dataset.label !== 'Rolling Avg')
                .reduce((s, i) => s + i.parsed.y, 0);
              return `Total: ${total.toFixed(1)} mi`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { maxTicksLimit: 18, font: { size: 11 } },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: '#f0f0f0' },
          ticks: { font: { size: 11 }, callback: v => v + ' mi' },
        },
      },
    },
  });
}

// ── Monthly Time chart ────────────────────────────────────────────────────

function updateMonthlyTimeChart(activities) {
  const { labels, datasets } = buildMonthlyStackedData(
    activities,
    a => (a.moving_time || 0) / 3600   // seconds → hours
  );

  const monthTotals = labels.map((_, i) => datasets.reduce((s, ds) => s + (ds.data[i] || 0), 0));
  const avgDs = cumulativeAvgDataset(monthTotals, 'Rolling Avg', 'rgba(80,80,80,0.55)');

  if (monthlyTimeChart) { monthlyTimeChart.destroy(); monthlyTimeChart = null; }

  const ctx = document.getElementById('monthly-time-chart').getContext('2d');
  monthlyTimeChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [...datasets, avgDs] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 8 } },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: item => {
              if (item.dataset.label === 'Rolling Avg') {
                return ` Rolling Avg: ${fmtHoursShort(item.parsed.y)}/mo`;
              }
              return item.parsed.y > 0 ? ` ${item.dataset.label}: ${fmtHoursShort(item.parsed.y)}` : null;
            },
            footer: items => {
              const total = items
                .filter(i => i.dataset.label !== 'Rolling Avg')
                .reduce((s, i) => s + i.parsed.y, 0);
              const h = Math.floor(total);
              const m = Math.round((total - h) * 60);
              return h > 0 ? `Total: ${h}h ${String(m).padStart(2,'0')}m` : `Total: ${m}m`;
            },
          },
        },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { maxTicksLimit: 18, font: { size: 11 } } },
        y: { stacked: true, beginAtZero: true, grid: { color: '#f0f0f0' },
             ticks: { font: { size: 11 }, callback: v => fmtHoursShort(v) } },
      },
    },
  });
}

// ── Time by Sport donut ───────────────────────────────────────────────────

function updateSportTimeChart(activities) {
  const totals = {};
  for (const a of activities) {
    const sport = a.sport_type || a.type || 'Other';
    totals[sport] = (totals[sport] || 0) + (a.moving_time || 0);
  }
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([s]) => `${sportIcon(s)} ${s}`);
  const values = sorted.map(([, v]) => +(v / 3600).toFixed(2));   // hours
  const colors = sorted.map(([s]) => sportColor(s));

  const ctx = document.getElementById('sport-time-chart').getContext('2d');
  if (sportTimeChart) {
    sportTimeChart.data.labels                      = labels;
    sportTimeChart.data.datasets[0].data            = values;
    sportTimeChart.data.datasets[0].backgroundColor = colors;
    sportTimeChart.update();
    return;
  }
  sportTimeChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 8 } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const h = Math.floor(ctx.parsed);
              const m = Math.round((ctx.parsed - h) * 60);
              return ` ${h > 0 ? h + 'h ' : ''}${m}m`;
            },
          },
        },
      },
    },
  });
}

// ── Avg Speed / Pace trend ────────────────────────────────────────────────

function updatePaceChart(activities) {
  const weekKeySet = new Set();
  for (const a of activities) {
    const k = isoWeekKey(a.start_date_local || a.start_date);
    if (k) weekKeySet.add(k);
  }
  const keys          = [...weekKeySet].sort();
  const labels        = keys.map(k => isoWeekToMonday(k).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  const tooltipLabels = keys.map(k => isoWeekToMonday(k).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));

  const sports = [...new Set(activities.map(a => a.sport_type || a.type || 'Other'))].sort();

  // Accumulate dist + time per sport per week to get true avg speed
  const buckets = {};
  for (const sport of sports) {
    buckets[sport] = {};
    for (const k of keys) buckets[sport][k] = { dist: 0, time: 0 };
  }
  for (const a of activities) {
    const k = isoWeekKey(a.start_date_local || a.start_date);
    if (!k || !a.moving_time) continue;
    const sport = a.sport_type || a.type || 'Other';
    buckets[sport][k].dist += (a.distance || 0);
    buckets[sport][k].time += a.moving_time;
  }

  const RUN_TYPES = ['Run','TrailRun','VirtualRun','Walk','Hike'];

  const datasets = sports.map(sport => ({
    label: `${sportIcon(sport)} ${sport}`,
    data: keys.map(k => {
      const b = buckets[sport][k];
      if (!b.time) return null;
      return +((b.dist / b.time) * 2.23694).toFixed(2); // m/s → mph
    }),
    borderColor: sportColor(sport),
    backgroundColor: sportColor(sport) + '18',
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 5,
    fill: false,
    tension: 0.3,
    spanGaps: true,
  }));

  if (paceChart) { paceChart.destroy(); paceChart = null; }

  const ctx = document.getElementById('pace-chart').getContext('2d');
  paceChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 8 } },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            title: items => tooltipLabels[items[0].dataIndex],
            label: item => {
              if (item.parsed.y === null) return null;
              const sport  = sports[item.datasetIndex] || '';
              const mph    = item.parsed.y;
              let str = ` ${item.dataset.label}: ${mph.toFixed(1)} mph`;
              if (RUN_TYPES.includes(sport) && mph > 0) {
                const mps    = mph / 2.23694;
                const minMi  = 1 / (mps * 0.000621371) / 60;
                const mins   = Math.floor(minMi);
                const secs   = Math.round((minMi - mins) * 60);
                str += ` (${mins}:${String(secs).padStart(2,'0')} /mi)`;
              }
              return str;
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 12, font: { size: 11 } } },
        y: { beginAtZero: false, grid: { color: '#f0f0f0' },
             ticks: { font: { size: 11 }, callback: v => v + ' mph' } },
      },
    },
  });
}

// ── Weekly Elevation Gain chart ───────────────────────────────────────────

function updateElevationChart(activities) {
  const { labels, tooltipLabels, datasets } = buildWeeklyStackedData(
    activities,
    a => metersToFeet(a.total_elevation_gain || 0)
  );

  if (elevationChart) { elevationChart.destroy(); elevationChart = null; }

  const ctx = document.getElementById('elevation-chart').getContext('2d');
  elevationChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 8 } },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            title: items => tooltipLabels[items[0].dataIndex],
            label: item => item.parsed.y > 0 ? ` ${item.dataset.label}: ${Math.round(item.parsed.y).toLocaleString()} ft` : null,
            footer: items => {
              const total = items.reduce((s, i) => s + i.parsed.y, 0);
              return `Total: ${Math.round(total).toLocaleString()} ft`;
            },
          },
        },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { maxTicksLimit: 12, font: { size: 11 } } },
        y: { stacked: true, beginAtZero: true, grid: { color: '#f0f0f0' },
             ticks: { font: { size: 11 }, callback: v => v.toLocaleString() + ' ft' } },
      },
    },
  });
}

// ── Year-over-Year badges ─────────────────────────────────────────────────

/**
 * Compute YoY % change for each stat using sport-filtered activities
 * (ignores date range filter so the badge always reflects full calendar years).
 */
function updateYoY() {
  const currentYear = new Date().getFullYear();
  const prevYear    = currentYear - 1;

  // Use sport filter but not date filter for YoY
  const sportFiltered = allActivities.filter(a => {
    const sport = a.sport_type || a.type || '';
    return selectedSports.size === 0 || selectedSports.has(sport);
  });

  const thisYear = sportFiltered.filter(a => activityYear(a) === currentYear);
  const lastYear = sportFiltered.filter(a => activityYear(a) === prevYear);

  function pctChange(curr, prev) {
    if (prev === 0) return null;
    return (curr - prev) / prev * 100;
  }

  function badge(pct) {
    if (pct === null) return '';
    const up    = pct >= 0;
    const arrow = up ? '↑' : '↓';
    const cls   = up ? 'yoy-up' : 'yoy-down';
    return `<span class="yoy-badge ${cls}">${arrow} ${Math.abs(pct).toFixed(0)}% YoY</span>`;
  }

  const distPct = pctChange(
    thisYear.reduce((s, a) => s + (a.distance || 0), 0),
    lastYear.reduce((s, a) => s + (a.distance || 0), 0)
  );
  const timePct = pctChange(
    thisYear.reduce((s, a) => s + (a.moving_time || 0), 0),
    lastYear.reduce((s, a) => s + (a.moving_time || 0), 0)
  );
  const elevPct = pctChange(
    thisYear.reduce((s, a) => s + (a.total_elevation_gain || 0), 0),
    lastYear.reduce((s, a) => s + (a.total_elevation_gain || 0), 0)
  );
  const cntPct  = pctChange(thisYear.length, lastYear.length);

  document.getElementById('yoy-distance').innerHTML  = badge(distPct);
  document.getElementById('yoy-time').innerHTML      = badge(timePct);
  document.getElementById('yoy-elevation').innerHTML = badge(elevPct);
  document.getElementById('yoy-count').innerHTML     = badge(cntPct);
}

// ── Activity Calendar Heatmap ─────────────────────────────────────────────

function buildHeatmap(activities) {
  const container = document.getElementById('heatmap-container');
  if (!container) return;

  // Build day-count map filtered by heatmapMonths
  const dayCounts = {};
  for (const a of activities) {
    const d = (a.start_date_local || a.start_date || '').slice(0, 10);
    if (!d) continue;
    const m1 = parseInt(d.slice(5, 7));
    if (heatmapMonths.size > 0 && !heatmapMonths.has(m1)) continue;
    dayCounts[d] = (dayCounts[d] || 0) + 1;
  }

  // Date range: 52 full weeks back from today's Sunday
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const thisWeekSunday = new Date(today);
  thisWeekSunday.setDate(today.getDate() - today.getDay());

  const startDate = new Date(thisWeekSunday);
  startDate.setDate(thisWeekSunday.getDate() - 52 * 7);

  const TOTAL_WEEKS = 53;
  const CELL = 13;
  const GAP  = 2;
  const STEP = CELL + GAP;
  const LEFT  = 28; // space for day labels
  const TOP   = 20; // space for month labels

  const svgW = LEFT + TOTAL_WEEKS * STEP;
  const svgH = TOP + 7 * STEP;

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAY_LABELS  = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  let svg = '';

  // Day labels
  for (let d = 0; d < 7; d++) {
    if (DAY_LABELS[d]) {
      svg += `<text x="${LEFT - 4}" y="${TOP + d * STEP + CELL - 2}" `
           + `font-size="10" fill="#9ca3af" text-anchor="end">${DAY_LABELS[d]}</text>`;
    }
  }

  // Month labels + cells
  let prevMonth = -1;
  for (let week = 0; week < TOTAL_WEEKS; week++) {
    const weekSunday = new Date(startDate);
    weekSunday.setDate(startDate.getDate() + week * 7);
    const wMonth = weekSunday.getMonth();

    if (wMonth !== prevMonth) {
      svg += `<text x="${LEFT + week * STEP}" y="13" font-size="10" fill="#9ca3af">`
           + `${MONTH_NAMES[wMonth]}</text>`;
      prevMonth = wMonth;
    }

    for (let day = 0; day < 7; day++) {
      const cellDate = new Date(weekSunday);
      cellDate.setDate(weekSunday.getDate() + day);
      if (cellDate > today) continue;

      const dateStr  = cellDate.toISOString().slice(0, 10);
      const count    = dayCounts[dateStr] || 0;
      const cellM1   = cellDate.getMonth() + 1;
      const inFilter = heatmapMonths.size === 0 || heatmapMonths.has(cellM1);

      let fill;
      if (!inFilter || count === 0) {
        fill = '#ebedf0';
      } else if (count === 1) {
        fill = 'rgba(252,76,2,0.3)';
      } else if (count <= 3) {
        fill = 'rgba(252,76,2,0.55)';
      } else if (count <= 6) {
        fill = 'rgba(252,76,2,0.8)';
      } else {
        fill = '#FC4C02';
      }

      const x = LEFT + week * STEP;
      const y = TOP  + day  * STEP;
      const title = count > 0
        ? `${count} activit${count === 1 ? 'y' : 'ies'} — ${dateStr}`
        : `No activities — ${dateStr}`;

      svg += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${fill}">`
           + `<title>${escHtml(title)}</title></rect>`;
    }
  }

  container.innerHTML = `<svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
}

function initHeatmapMonthFilter() {
  const container = document.getElementById('heatmap-month-filters');
  if (!container) return;

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  MONTHS.forEach((name, i) => {
    const btn = document.createElement('button');
    btn.className = 'btn pill-btn-sm';
    btn.dataset.month = i + 1;
    btn.textContent = name;
    btn.addEventListener('click', () => {
      const m = i + 1;
      if (heatmapMonths.has(m)) {
        heatmapMonths.delete(m);
        btn.classList.remove('active');
      } else {
        heatmapMonths.add(m);
        btn.classList.add('active');
      }
      const allBtn = container.querySelector('[data-month="0"]');
      if (allBtn) allBtn.classList.toggle('active', heatmapMonths.size === 0);
      buildHeatmap(getFilteredActivities());
    });
    container.appendChild(btn);
  });

  const allBtn = container.querySelector('[data-month="0"]');
  if (allBtn) {
    allBtn.addEventListener('click', () => {
      heatmapMonths.clear();
      container.querySelectorAll('.pill-btn-sm').forEach(b => b.classList.remove('active'));
      allBtn.classList.add('active');
      buildHeatmap(getFilteredActivities());
    });
  }
}

// ── Personal Record cards ─────────────────────────────────────────────────

function updatePRCards(activities) {
  // Longest activity (non-swim, in miles)
  const nonSwim = activities.filter(a => (a.sport_type || a.type) !== 'Swim' && (a.distance || 0) > 0);
  const longest = nonSwim.reduce((best, a) => (!best || a.distance > best.distance) ? a : best, null);

  const longestEl  = document.getElementById('pr-longest-distance');
  const longestSub = document.getElementById('pr-longest-sub');
  if (longest) {
    longestEl.textContent  = fmtMiles(metersToMiles(longest.distance));
    longestSub.textContent = `${escHtml(longest.name || 'Activity')} · ${activityDate(longest)}`;
  } else {
    longestEl.textContent  = '—';
    longestSub.textContent = '';
  }

  // Best pace: prefer runs, fall back to rides
  const runTypes  = ['Run','TrailRun','VirtualRun'];
  const rideTypes = ['Ride','VirtualRide','MountainBikeRide','EBikeRide'];
  const runs  = activities.filter(a => runTypes.includes(a.sport_type || a.type) && (a.average_speed || 0) > 0);
  const rides = activities.filter(a => rideTypes.includes(a.sport_type || a.type) && (a.average_speed || 0) > 0);
  const fastestRun  = runs.reduce((best, a)  => (!best || a.average_speed > best.average_speed) ? a : best, null);
  const fastestRide = rides.reduce((best, a) => (!best || a.average_speed > best.average_speed) ? a : best, null);
  const bestPaceAct = fastestRun || fastestRide;

  const paceEl    = document.getElementById('pr-best-pace');
  const paceSub   = document.getElementById('pr-best-pace-sub');
  const paceLabel = document.getElementById('pr-pace-label');
  if (bestPaceAct) {
    const sport = bestPaceAct.sport_type || bestPaceAct.type || '';
    if (paceLabel) paceLabel.textContent = runTypes.includes(sport) ? 'Best Run Pace' : 'Best Ride Speed';
    paceEl.textContent  = fmtPace(bestPaceAct);
    paceSub.textContent = `${escHtml(bestPaceAct.name || 'Activity')} · ${activityDate(bestPaceAct)}`;
  } else {
    if (paceLabel) paceLabel.textContent = 'Best Pace';
    paceEl.textContent  = '—';
    paceSub.textContent = '';
  }

  // Biggest elevation gain (single activity)
  const bigElev = activities.filter(a => (a.total_elevation_gain || 0) > 0)
    .reduce((best, a) => (!best || a.total_elevation_gain > best.total_elevation_gain) ? a : best, null);

  const elevEl  = document.getElementById('pr-best-elevation');
  const elevSub = document.getElementById('pr-best-elevation-sub');
  if (bigElev) {
    elevEl.textContent  = fmtFeet(metersToFeet(bigElev.total_elevation_gain));
    elevSub.textContent = `${escHtml(bigElev.name || 'Activity')} · ${activityDate(bigElev)}`;
  } else {
    elevEl.textContent  = '—';
    elevSub.textContent = '';
  }
}

// ── Update all ────────────────────────────────────────────────────────────

function updateAll() {
  const filtered = getFilteredActivities();
  updateStats(filtered);
  updateYoY();
  updatePRCards(filtered);
  buildHeatmap(filtered);
  updateWeeklyChart(filtered);
  updateMonthlyChart(filtered);
  updateWeeklyTimeChart(filtered);
  updateMonthlyTimeChart(filtered);
  updateSportChart(filtered);
  updateSportTimeChart(filtered);
  updatePaceChart(filtered);
  updateElevationChart(filtered);
  updateTable(filtered);
}

// ── Date range filter ─────────────────────────────────────────────────────

function initDateRangeFilter() {
  const startInput = document.getElementById('date-start');
  const endInput   = document.getElementById('date-end');
  const clearBtn   = document.getElementById('date-clear-btn');

  function onDateChange() {
    dateStart = startInput.value;
    dateEnd   = endInput.value;
    clearBtn.style.display = (dateStart || dateEnd) ? '' : 'none';
    currentPage = 1;
    updateAll();
  }

  startInput.addEventListener('change', onDateChange);
  endInput.addEventListener('change', onDateChange);

  clearBtn.addEventListener('click', () => {
    startInput.value = '';
    endInput.value   = '';
    dateStart = '';
    dateEnd   = '';
    clearBtn.style.display = 'none';
    currentPage = 1;
    updateAll();
  });
}

function buildSportPills() {
  const sports = [...new Set(
    allActivities.map(a => a.sport_type || a.type).filter(Boolean)
  )].sort();
  const container = document.getElementById('sport-filters');
  for (const sport of sports) {
    const btn = document.createElement('button');
    btn.className   = 'btn pill-btn';
    btn.dataset.sport = sport;
    btn.innerHTML   = `${sportIcon(sport)} ${sport}`;
    btn.addEventListener('click', () => toggleSportFilter(sport, btn));
    container.appendChild(btn);
  }
}

// ── Toggle handlers ───────────────────────────────────────────────────────

function toggleSportFilter(sport, btn) {
  const allBtn = document.querySelector('#sport-filters [data-sport="all"]');
  if (selectedSports.has(sport)) {
    selectedSports.delete(sport);
    btn.classList.remove('active');
  } else {
    selectedSports.add(sport);
    btn.classList.add('active');
  }
  allBtn.classList.toggle('active', selectedSports.size === 0);
  currentPage = 1;
  updateAll();
}

// ── Sort handlers ─────────────────────────────────────────────────────────

function initSortHandlers() {
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortColumn === col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortColumn = col;
        sortDir    = col === 'date' ? 'desc' : 'asc';
      }
      document.querySelectorAll('th.sortable').forEach(h => h.classList.remove('sort-asc','sort-desc'));
      th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      currentPage = 1;
      updateTable(getFilteredActivities());
    });
  });
  const defaultTh = document.querySelector('th[data-col="date"]');
  if (defaultTh) defaultTh.classList.add('sort-desc');
}

// ── Search ────────────────────────────────────────────────────────────────

function initSearch() {
  document.getElementById('search-input').addEventListener('input', e => {
    searchQuery = e.target.value.trim();
    currentPage = 1;
    updateAll();
  });
}

// ── Page size selector ────────────────────────────────────────────────────

function initPageSize() {
  document.getElementById('page-size-select').addEventListener('change', e => {
    pageSize = parseInt(e.target.value);
    currentPage = 1;
    updateTable(getFilteredActivities());
  });
}

// ── "All" pill reset (sports) ─────────────────────────────────────────────

function initAllPills() {
  document.querySelector('#sport-filters [data-sport="all"]').addEventListener('click', () => {
    selectedSports.clear();
    document.querySelectorAll('#sport-filters .pill-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('#sport-filters [data-sport="all"]').classList.add('active');
    currentPage = 1;
    updateAll();
  });
}

// ── Init ──────────────────────────────────────────────────────────────────

(function init() {
  buildSportPills();
  initAllPills();
  initHeatmapMonthFilter();
  initSortHandlers();
  initSearch();
  initPageSize();
  initDateRangeFilter();
  updateAll();
})();
