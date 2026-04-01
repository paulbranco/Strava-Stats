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

let weeklyChart     = null;
let weeklyTimeChart = null;
let sportChart      = null;

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

// ── Weekly Distance chart ─────────────────────────────────────────────────

function updateWeeklyChart(activities) {
  const { labels, tooltipLabels, datasets } = buildWeeklyStackedData(
    activities,
    a => metersToMiles(a.distance || 0)
  );

  if (weeklyChart) { weeklyChart.destroy(); weeklyChart = null; }

  const ctx = document.getElementById('weekly-chart').getContext('2d');
  weeklyChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
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
            label: item  => ` ${item.dataset.label}: ${item.parsed.y.toFixed(1)} mi`,
            footer: items => {
              const total = items.reduce((s, i) => s + i.parsed.y, 0);
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

function updateWeeklyTimeChart(activities) {
  const { labels, tooltipLabels, datasets } = buildWeeklyStackedData(
    activities,
    a => (a.moving_time || 0) / 60   // seconds → minutes
  );

  if (weeklyTimeChart) { weeklyTimeChart.destroy(); weeklyTimeChart = null; }

  const ctx = document.getElementById('weekly-time-chart').getContext('2d');
  weeklyTimeChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
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
            label: item  => ` ${item.dataset.label}: ${item.parsed.y.toFixed(0)} min`,
            footer: items => {
              const total = items.reduce((s, i) => s + i.parsed.y, 0);
              const h = Math.floor(total / 60);
              const m = Math.round(total % 60);
              return h > 0 ? `Total: ${h}h ${String(m).padStart(2,'0')}m` : `Total: ${m} min`;
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
          ticks: { font: { size: 11 }, callback: v => v + ' min' },
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

// ── Update all ────────────────────────────────────────────────────────────

function updateAll() {
  const filtered = getFilteredActivities();
  updateStats(filtered);
  updateWeeklyChart(filtered);
  updateWeeklyTimeChart(filtered);
  updateSportChart(filtered);
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
  initSortHandlers();
  initSearch();
  initPageSize();
  initDateRangeFilter();
  updateAll();
})();
