const FILTER_DEFINITIONS = {
  includeAdvertiser: {
    label: 'Include advertiser',
    placeholder: 'Start typing an advertiser',
    input: 'text',
    datalist: 'advertiser',
  },
  excludeAdvertiser: {
    label: 'Exclude advertiser',
    placeholder: 'Start typing an advertiser',
    input: 'text',
    datalist: 'advertiser',
  },
  includeDomain: {
    label: 'Include domain',
    placeholder: 'example.com',
    input: 'text',
    datalist: 'domain',
  },
  excludeDomain: {
    label: 'Exclude domain',
    placeholder: 'example.com',
    input: 'text',
    datalist: 'domain',
  },
  minAds: {
    label: 'Min ads per advertiser',
    placeholder: '>= 1',
    input: 'number',
    min: 1,
  },
  minDomainAdvertisers: {
    label: 'Min advertisers per domain',
    placeholder: '>= 1',
    input: 'number',
    min: 1,
  },
};

const ORDER_FIELDS = {
  last_shown_timestamp: 'Last shown',
  advertiser_name: 'Advertiser',
  domain: 'Domain',
  ad_count: 'Number of ads',
};

const dom = {
  searchInput: document.getElementById('search-input'),
  suggestionsContainer: document.getElementById('suggestions-container'),
  selectedSuggestions: document.getElementById('selected-suggestions'),
  clearSuggestionsButton: document.getElementById('clear-suggestions'),
  creativeProgress: document.getElementById('creative-progress'),
  resultSummary: document.getElementById('result-summary'),
  galleryGrid: document.getElementById('gallery-grid'),
  statusPill: document.getElementById('status-pill'),
  suggestionChipTemplate: document.getElementById('suggestion-chip-template'),
  descriptionPanel: document.getElementById('description-panel'),
  toggleDescriptionButton: document.getElementById('toggle-description'),
  creativeDialog: document.getElementById('creative-dialog'),
  creativeDialogBody: document.getElementById('creative-dialog-body'),
  closeCreativeDialogButton: document.getElementById('close-creative-dialog'),
  collapseSearchButton: document.getElementById('collapse-search'),
  searchPanel: document.querySelector('.panel--search'),
  addFilterButton: document.getElementById('add-filter'),
  activeFilters: document.getElementById('active-filters'),
  filterDialog: document.getElementById('filter-dialog'),
  filterForm: document.getElementById('filter-form'),
  filterTypeSelect: document.getElementById('filter-type'),
  filterValueInput: document.getElementById('filter-value'),
  filterValueLabel: document.getElementById('filter-value-label'),
  filterAdvertisersOptions: document.getElementById('filter-advertisers-options'),
  filterDomainsOptions: document.getElementById('filter-domains-options'),
  orderBySelect: document.getElementById('order-by'),
  orderByDirectionButton: document.getElementById('order-by-direction'),
  exportDialog: document.getElementById('export-dialog'),
  exportForm: document.getElementById('export-form'),
  exportColumns: document.getElementById('export-columns'),
  openExportDialogButton: document.getElementById('open-export-dialog'),
};

const externalConfig = window.HONEST_ADS_CONFIG || window.honestAdsConfig || {};
const fallbackBaseUrl =
  (typeof window !== 'undefined' && window.location && window.location.origin) ||
  'https://adstransparency.google.com/';
const initialBaseUrl = (externalConfig.baseUrl || fallbackBaseUrl).trim() || fallbackBaseUrl;

const columns = [
  { key: 'suggestion', label: 'Suggestion' },
  { key: 'advertiser_name', label: 'Advertiser' },
  { key: 'advertiser_id', label: 'Advertiser ID' },
  { key: 'domain', label: 'Domain' },
  { key: 'creative_id', label: 'Creative ID' },
  { key: 'first_shown_human', label: 'First shown' },
  { key: 'last_shown_human', label: 'Last shown' },
  { key: 'ad_image_url', label: 'Image URL' },
  { key: 'ad_data', label: 'Ad text' },
  { key: 'url', label: 'Creative URL' },
];

const state = {
  suggestions: [],
  selectedSuggestions: [],
  creatives: [],
  filteredCreatives: [],
  customFilters: [],
  searchQuery: '',
  isSearchCollapsed: false,
  orderBy: {
    field: 'last_shown_timestamp',
    direction: 'desc',
  },
  config: {
    baseUrl: initialBaseUrl,
    pageLimit: 3,
    pageSize: 100,
    concurrency: 2,
    timeout: 15000,
  },
};

let suggestionDebounce;
let pendingFetchVersion = 0;

class HonestAdsClient {
  constructor(config) {
    this.baseUrl = config.baseUrl || 'https://adstransparency.google.com/';
    this.rpcPrefix = 'anji/_/rpc/';
    this.defaultParams = new URLSearchParams({ authuser: '' }).toString();
    this.config = { timeout: config.timeout || 15000 };
  }

  updateConfig(partial) {
    if (partial.baseUrl) {
      this.baseUrl = partial.baseUrl;
    }
    if (typeof partial.timeout === 'number') {
      this.config.timeout = partial.timeout;
    }
  }

  async request(endpoint, payload) {
    const base = this.baseUrl.replace(/\/$/, '');
    const url = `${base}/${this.rpcPrefix}${endpoint}${this.defaultParams ? `?${this.defaultParams}` : ''}`;
    const body = new URLSearchParams();
    body.set('f.req', JSON.stringify(payload));

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), this.config.timeout);

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body,
        mode: 'cors',
        credentials: 'omit',
        signal: controller.signal,
      });
    } catch (error) {
      window.clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timed out after ${this.config.timeout}ms.`);
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`RPC request failed with status ${response.status}`);
    }

    const text = await response.text();
    return parseRpcPayload(text);
  }

  async searchSuggestions(text, limit = 10) {
    const payload = { 1: text, 2: limit, 3: 10 };
    const result = await this.request('SearchService/SearchSuggestions', payload);
    const suggestions = getNested(result, ['1'], []);
    return suggestions
      .map((entry) => {
        if (entry?.['1']) {
          const name = getNested(entry, ['1', '1']);
          const advertiserId = getNested(entry, ['1', '2']);
          const region = getNested(entry, ['1', '3']);
          const recentAds = Number(getNested(entry, ['1', '4', '2', '1']));
          const lifetimeAds = Number(getNested(entry, ['1', '4', '2', '2']));
          if (!name && !advertiserId) {
            return null;
          }
          return {
            display: name || advertiserId,
            value: advertiserId || name,
            type: 'advertiser',
            metadata: {
              region: region || '',
              publishedAds: Number.isFinite(recentAds) ? recentAds : null,
              lifetimeAds: Number.isFinite(lifetimeAds) ? lifetimeAds : null,
              creativeCountActual: null,
              domainCount: null,
            },
          };
        }
        if (entry?.['2']) {
          const domain = getNested(entry, ['2', '1']);
          const advertiserCount = Number(getNested(entry, ['2', '4', '1']));
          const creativeCount = Number(getNested(entry, ['2', '4', '2']));
          if (!domain) {
            return null;
          }
          return {
            display: domain,
            value: domain,
            type: 'domain',
            metadata: {
              advertiserCount: Number.isFinite(advertiserCount) ? advertiserCount : null,
              creativeCountActual: Number.isFinite(creativeCount) ? creativeCount : null,
            },
          };
        }
        const fallbackText = getNested(entry, ['3', '1']) || getNested(entry, ['4', '1']);
        if (fallbackText) {
          return {
            display: fallbackText,
            value: fallbackText,
            type: 'text',
            metadata: {},
          };
        }
        return null;
      })
      .filter(Boolean);
  }

  async searchCreativesByText(text, options) {
    const pageLimit = options?.pageLimit ?? 1;
    const pageSize = options?.pageSize ?? 100;
    const accumulator = [];
    let pageToken;
    let page = 0;

    while (page < pageLimit) {
      const payload = {
        2: pageSize,
        3: { 12: { 1: text, 2: true } },
        7: { 1: 1, 2: 0, 3: 0 },
      };

      if (pageToken) {
        payload['4'] = pageToken;
      }

      const result = await this.request('SearchService/SearchCreatives', payload);
      const creatives = getNested(result, ['1'], []);

      creatives.forEach((entry) => {
        accumulator.push(mapCreative(entry));
      });

      pageToken = getNested(result, ['2']);
      page += 1;

      if (!pageToken) {
        break;
      }
    }

    return accumulator;
  }
}

const client = new HonestAdsClient({ timeout: state.config.timeout, baseUrl: state.config.baseUrl });

function parseRpcPayload(payload) {
  const sanitized = payload.replace(/^\)\]\}'\n?/, '');
  try {
    return JSON.parse(sanitized);
  } catch (error) {
    throw new Error('Unable to parse RPC response');
  }
}

function getNested(obj, path, fallback) {
  let current = obj;
  for (const key of path) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return fallback;
    }
  }
  return current ?? fallback;
}

function mapCreative(entry) {
  const advertiserId = getNested(entry, ['1']);
  const creativeId = getNested(entry, ['2']);
  const advertiserName = getNested(entry, ['12']);
  const domain = getNested(entry, ['14']);
  const firstShown = getNested(entry, ['6', '1']);
  const lastShown = getNested(entry, ['7', '1']);

  const creativeBlock = getNested(entry, ['3']) || {};
  let adData = '';
  if ('3' in creativeBlock) {
    const raw = getNested(entry, ['3', '3', '2']) || '';
    const split = raw.split('"');
    adData = split.length > 1 ? split[1] : raw;
  } else {
    adData = getNested(entry, ['3', '1', '4']) || '';
  }

  return {
    advertiser_id: advertiserId || '',
    creative_id: creativeId || '',
    advertiser_name: advertiserName || '',
    domain: domain || '',
    first_shown: firstShown || '',
    first_shown_human: formatTimestamp(firstShown),
    last_shown_timestamp: lastShown || '',
    last_shown_human: formatTimestamp(lastShown),
    ad_data: adData || '',
    ad_image_url: extractImageUrl(adData),
    url:
      advertiserId && creativeId
        ? `https://adstransparency.google.com/advertiser/${advertiserId}/creative/${creativeId}`
        : '',
  };
}

function formatTimestamp(value) {
  if (!value) {
    return '';
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value;
  }
  let ms = numeric;
  if (`${value}`.length === 10) {
    ms = numeric * 1000;
  } else if (`${value}`.length > 13) {
    ms = Math.floor(numeric / 1000);
  }
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function extractImageUrl(adData) {
  if (!adData || typeof adData !== 'string') {
    return '';
  }

  const trimmed = adData.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(adData, 'text/html');
    const img = doc.querySelector('img');
    if (img && img.getAttribute('src')) {
      return img.getAttribute('src');
    }
    const styled = doc.querySelector('[style*="background"]');
    if (styled) {
      const style = styled.getAttribute('style') || '';
      const match = style.match(/url\((['"]?)(.*?)\1\)/i);
      if (match && match[2]) {
        return match[2];
      }
    }
  } catch (error) {
    // ignore and fall back to regex
  }

  const urlMatch = adData.match(/https?:\/\/[^\s"'<>]+/i);
  if (!urlMatch) {
    return '';
  }
  const url = urlMatch[0];
  const looksLikeImage =
    /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url) ||
    url.includes('googleusercontent.com') ||
    url.includes('gstatic.com');
  return looksLikeImage ? url : '';
}

function describeSuggestionMeta(suggestion) {
  const meta = suggestion.metadata || {};
  if (suggestion.type === 'advertiser') {
    const parts = [];
    if (meta.creativeCountActual != null) {
      parts.push(`${meta.creativeCountActual} ads loaded`);
    } else if (meta.publishedAds != null) {
      parts.push(`${meta.publishedAds} recent ads`);
    }
    if (meta.lifetimeAds != null && meta.lifetimeAds !== meta.publishedAds) {
      parts.push(`${meta.lifetimeAds} lifetime`);
    }
    if (meta.domainCount != null && meta.domainCount > 0) {
      parts.push(`${meta.domainCount} domains`);
    }
    if (meta.region) {
      parts.push(`Region: ${meta.region}`);
    }
    return parts.join(' • ') || 'Advertiser';
  }
  if (suggestion.type === 'domain') {
    const parts = [];
    if (meta.advertiserCount != null) {
      parts.push(`${meta.advertiserCount} advertisers`);
    }
    if (meta.creativeCountActual != null) {
      parts.push(`${meta.creativeCountActual} ads`);
    }
    return parts.join(' • ') || 'Domain';
  }
  return 'Keyword';
}

function getSelectedValues(select) {
  return Array.from(select.selectedOptions).map((option) => option.value);
}

function setStatus(message, variant = 'info') {
  if (!message) {
    dom.statusPill.hidden = true;
    dom.statusPill.textContent = '';
    dom.statusPill.removeAttribute('data-variant');
    return;
  }
  dom.statusPill.hidden = false;
  dom.statusPill.textContent = message;
  dom.statusPill.dataset.variant = variant;
}

function setProgress(message = '') {
  dom.creativeProgress.textContent = message;
}

function renderSuggestions(list) {
  if (!Array.isArray(list) || list.length === 0) {
    dom.suggestionsContainer.innerHTML = '<p class="empty">Start typing to see suggestions.</p>';
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'suggestions suggestions--compact';

  list.forEach((suggestion) => {
    const card = document.createElement('div');
    card.className = 'suggestion-card';

    const title = document.createElement('strong');
    title.textContent = suggestion.display;
    const subtitle = document.createElement('span');
    subtitle.textContent = suggestion.value;
    const meta = document.createElement('div');
    meta.className = 'suggestion-card__meta';
    meta.textContent = describeSuggestionMeta(suggestion);

    const button = document.createElement('button');
    button.type = 'button';
    const alreadyTracked = state.selectedSuggestions.some((item) => item.value === suggestion.value);
    button.textContent = alreadyTracked ? 'Tracking' : 'Track';
    button.disabled = alreadyTracked;
    button.addEventListener('click', () => {
      addSuggestion(suggestion);
      button.textContent = 'Tracking';
      button.disabled = true;
    });

    card.appendChild(title);
    card.appendChild(subtitle);
    card.appendChild(meta);
    card.appendChild(button);
    wrapper.appendChild(card);
  });

  dom.suggestionsContainer.innerHTML = '';
  dom.suggestionsContainer.appendChild(wrapper);
}

function addSuggestion(suggestion) {
  if (state.selectedSuggestions.some((entry) => entry.value === suggestion.value)) {
    return;
  }
  state.selectedSuggestions.push({
    ...suggestion,
    metadata: { ...(suggestion.metadata || {}) },
  });
  renderSelectedSuggestions();
  renderSuggestions(state.suggestions);
  scheduleCreativeFetch();
}

function removeSuggestion(value) {
  state.selectedSuggestions = state.selectedSuggestions.filter((entry) => entry.value !== value);
  renderSelectedSuggestions();
  renderSuggestions(state.suggestions);
  scheduleCreativeFetch();
}

function renderSelectedSuggestions() {
  dom.selectedSuggestions.innerHTML = '';

  if (state.selectedSuggestions.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No suggestions selected.';
    dom.selectedSuggestions.appendChild(empty);
    return;
  }

  state.selectedSuggestions.forEach((suggestion) => {
    const template = dom.suggestionChipTemplate.content.firstElementChild.cloneNode(true);
    template.dataset.value = suggestion.value;
    const spans = template.querySelectorAll('span, strong');
    if (spans[0]) {
      spans[0].textContent = suggestion.display;
    }
    if (spans[1]) {
      spans[1].textContent = describeSuggestionMeta(suggestion);
    }
    template.addEventListener('click', () => removeSuggestion(suggestion.value));
    dom.selectedSuggestions.appendChild(template);
  });
}

function populateFilterOptions(creatives) {
  const domains = Array.from(new Set(creatives.map((entry) => entry.domain).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
  const advertisers = Array.from(
    new Set(creatives.map((entry) => entry.advertiser_name || entry.advertiser_id).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  dom.filterDomainsOptions.innerHTML = domains.map((value) => `<option value="${value}">`).join('');
  dom.filterAdvertisersOptions.innerHTML = advertisers.map((value) => `<option value="${value}">`).join('');
}

function buildStructuralStats(creatives) {
  const advertiserCounts = {};
  const domainAdvertisers = {};

  creatives.forEach((creative) => {
    const advertiser = creative.advertiser_name || creative.advertiser_id || '—';
    const domain = creative.domain || '—';
    advertiserCounts[advertiser] = (advertiserCounts[advertiser] || 0) + 1;
    if (!domainAdvertisers[domain]) {
      domainAdvertisers[domain] = new Set();
    }
    domainAdvertisers[domain].add(advertiser);
  });

  const domainAdvertiserCounts = Object.fromEntries(
    Object.entries(domainAdvertisers).map(([domain, set]) => [domain, set.size]),
  );

  return { advertiserCounts, domainAdvertiserCounts };
}

function evaluateFilter(filter, creative, advertiserCounts, domainAdvertiserCounts) {
  const advertiserKey = (creative.advertiser_name || creative.advertiser_id || '').toLowerCase();
  const domainKey = (creative.domain || '').toLowerCase();
  const value = String(filter.value || '').toLowerCase();

  switch (filter.type) {
    case 'includeAdvertiser':
      return advertiserKey === value;
    case 'excludeAdvertiser':
      return advertiserKey !== value;
    case 'includeDomain':
      return domainKey === value;
    case 'excludeDomain':
      return domainKey !== value;
    case 'minAds': {
      const count = advertiserCounts[creative.advertiser_name || creative.advertiser_id || '—'] || 0;
      return count >= Number(filter.value || 0);
    }
    case 'minDomainAdvertisers': {
      const count = domainAdvertiserCounts[creative.domain || '—'] || 0;
      return count >= Number(filter.value || 0);
    }
    default:
      return true;
  }
}

function sortCreatives(creatives, advertiserCounts) {
  const multiplier = state.orderBy.direction === 'asc' ? 1 : -1;
  const field = state.orderBy.field;

  return [...creatives].sort((a, b) => {
    let valA;
    let valB;
    switch (field) {
      case 'advertiser_name':
        valA = (a.advertiser_name || '').toLowerCase();
        valB = (b.advertiser_name || '').toLowerCase();
        break;
      case 'domain':
        valA = (a.domain || '').toLowerCase();
        valB = (b.domain || '').toLowerCase();
        break;
      case 'ad_count':
        valA = advertiserCounts[a.advertiser_name || a.advertiser_id || '—'] || 0;
        valB = advertiserCounts[b.advertiser_name || b.advertiser_id || '—'] || 0;
        break;
      default:
        valA = Number(a.last_shown_timestamp) || 0;
        valB = Number(b.last_shown_timestamp) || 0;
        break;
    }

    if (valA < valB) {
      return -1 * multiplier;
    }
    if (valA > valB) {
      return 1 * multiplier;
    }
    return 0;
  });
}

function applyFilters() {
  const { advertiserCounts, domainAdvertiserCounts } = buildStructuralStats(state.creatives);
  let filtered = state.creatives.filter((creative) =>
    state.customFilters.every((filter) => evaluateFilter(filter, creative, advertiserCounts, domainAdvertiserCounts)),
  );

  filtered = sortCreatives(filtered, advertiserCounts);

  state.filteredCreatives = filtered;
  updateResultSummary();
  renderGallery();
}

function updateResultSummary() {
  if (!state.creatives.length) {
    dom.resultSummary.textContent = 'No creatives yet.';
    return;
  }
  dom.resultSummary.textContent = `${state.filteredCreatives.length} creatives displayed (out of ${state.creatives.length}).`;
}

function renderGallery() {
  if (!state.filteredCreatives.length) {
    dom.galleryGrid.innerHTML = '<p class="empty">No creatives match the current filters.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  state.filteredCreatives.forEach((creative) => {
    const card = document.createElement('article');
    card.className = 'gallery-card';

    const imageButton = document.createElement('button');
    imageButton.type = 'button';
    imageButton.className = 'gallery-card__image';
    imageButton.addEventListener('click', () => openCreativeDialog(creative));

    if (creative.ad_image_url) {
      const img = document.createElement('img');
      img.src = creative.ad_image_url;
      img.alt = `Creative for ${creative.advertiser_name || creative.domain || 'advertiser'}`;
      imageButton.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'empty';
      placeholder.textContent = 'View creative';
      imageButton.appendChild(placeholder);
    }

    const body = document.createElement('div');
    body.className = 'gallery-card__body';

    const title = document.createElement('div');
    title.className = 'gallery-card__title';
    title.textContent = creative.advertiser_name || 'Unknown advertiser';

    const meta = document.createElement('div');
    meta.className = 'gallery-card__meta';
    meta.textContent = `${creative.domain || 'Unknown domain'} • ${creative.last_shown_human || 'Unknown date'}`;

    const chips = document.createElement('div');
    chips.className = 'chip-list';

    const suggestionPill = document.createElement('span');
    suggestionPill.className = 'pill';
    suggestionPill.textContent = creative.suggestion ? creative.suggestion : 'Manual follow';
    chips.appendChild(suggestionPill);

    body.appendChild(title);
    body.appendChild(meta);
    body.appendChild(chips);

    card.appendChild(imageButton);
    card.appendChild(body);
    fragment.appendChild(card);
  });

  dom.galleryGrid.innerHTML = '';
  dom.galleryGrid.appendChild(fragment);
}

function resetAll() {
  state.searchQuery = '';
  if (dom.searchInput) {
    dom.searchInput.value = '';
  }
  state.suggestions = [];
  state.selectedSuggestions = [];
  state.creatives = [];
  state.filteredCreatives = [];
  state.customFilters = [];
  renderSelectedSuggestions();
  renderSuggestions([]);
  renderActiveFilters();
  populateFilterOptions([]);
  updateResultSummary();
  renderGallery();
  setProgress('');
}

function buildCsvLine(values) {
  return values
    .map((value) => {
      if (value == null) {
        return '';
      }
      const stringValue = String(value);
      if (/[",\n]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    })
    .join(',');
}

function exportCsv(columnsToUse) {
  if (!state.filteredCreatives.length) {
    setStatus('No creatives to export.', 'error');
    return;
  }
  const header = buildCsvLine(columnsToUse.map((key) => findColumnLabel(key)));
  const rows = state.filteredCreatives.map((creative) =>
    buildCsvLine(columnsToUse.map((key) => creative[key] ?? '')),
  );
  const csv = [header, ...rows].join('\n');
  downloadBlob(csv, `honestads-${Date.now()}.csv`, 'text/csv;charset=utf-8;');
  setStatus('CSV download ready.', 'success');
}

function exportJson(columnsToUse) {
  if (!state.filteredCreatives.length) {
    setStatus('No creatives to export.', 'error');
    return;
  }
  const payload = state.filteredCreatives.map((creative) => {
    const subset = {};
    columnsToUse.forEach((key) => {
      subset[key] = creative[key] ?? '';
    });
    return subset;
  });
  downloadBlob(JSON.stringify(payload, null, 2), `honestads-${Date.now()}.json`, 'application/json');
  setStatus('JSON download ready.', 'success');
}

function downloadBlob(payload, filename, type) {
  const blob = typeof payload === 'string' ? new Blob([payload], { type }) : payload;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function renderExportColumns() {
  dom.exportColumns.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'export-columns-options';
  columns.forEach((column) => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'export-column';
    checkbox.value = column.key;
    checkbox.checked = true;
    label.appendChild(checkbox);
    label.append(` ${column.label}`);
    wrapper.appendChild(label);
  });
  dom.exportColumns.appendChild(wrapper);
}

function findColumnLabel(key) {
  return columns.find((col) => col.key === key)?.label || key;
}

function getSelectedExportColumns() {
  return Array.from(dom.exportColumns.querySelectorAll('input[name="export-column"]:checked')).map(
    (input) => input.value,
  );
}

function scheduleCreativeFetch() {
  if (!state.selectedSuggestions.length) {
    resetCreatives();
    return;
  }
  fetchCreativesForSelections();
}

function resetCreatives() {
  state.creatives = [];
  state.filteredCreatives = [];
  populateFilterOptions([]);
  renderGallery();
  updateResultSummary();
}

function describeFilter(filter) {
  const def = FILTER_DEFINITIONS[filter.type];
  if (!def) {
    return filter.type;
  }
  if (filter.type === 'minAds' || filter.type === 'minDomainAdvertisers') {
    return `${def.label}: ${filter.value}`;
  }
  return `${def.label}: ${filter.value}`;
}

function createFilterId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `filter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function renderActiveFilters() {
  dom.activeFilters.innerHTML = '';
  if (!state.customFilters.length) {
    const helper = document.createElement('p');
    helper.className = 'helper-text';
    helper.textContent = 'No custom filters yet.';
    dom.activeFilters.appendChild(helper);
    return;
  }

  state.customFilters.forEach((filter) => {
    const chip = document.createElement('div');
    chip.className = 'chip chip--filter';
    chip.textContent = describeFilter(filter);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Remove filter');
    remove.textContent = '✕';
    remove.addEventListener('click', () => {
      state.customFilters = state.customFilters.filter((item) => item.id !== filter.id);
      renderActiveFilters();
      applyFilters();
    });
    chip.appendChild(remove);
    dom.activeFilters.appendChild(chip);
  });
}

function openFilterDialog() {
  if (!dom.filterDialog) {
    return;
  }
  dom.filterTypeSelect.value = 'includeAdvertiser';
  updateFilterDialogInput();
  dom.filterValueInput.value = '';
  dom.filterDialog.showModal();
}

function updateFilterDialogInput() {
  const type = dom.filterTypeSelect.value;
  const def = FILTER_DEFINITIONS[type];
  if (!def) {
    return;
  }
  dom.filterValueLabel.textContent = def.label;
  dom.filterValueInput.placeholder = def.placeholder || '';
  dom.filterValueInput.type = def.input === 'number' ? 'number' : 'text';
  dom.filterValueInput.value = '';
  dom.filterValueInput.removeAttribute('list');
  dom.filterValueInput.removeAttribute('min');
  if (def.input === 'number' && def.min) {
    dom.filterValueInput.min = def.min;
  }
  if (def.datalist === 'advertiser') {
    dom.filterValueInput.setAttribute('list', 'filter-advertisers-options');
  } else if (def.datalist === 'domain') {
    dom.filterValueInput.setAttribute('list', 'filter-domains-options');
  }
}

function handleFilterFormSubmit(event) {
  event.preventDefault();
  const type = dom.filterTypeSelect.value;
  const def = FILTER_DEFINITIONS[type];
  if (!def) {
    dom.filterDialog.close();
    return;
  }
  let value = dom.filterValueInput.value.trim();
  if (!value) {
    setStatus('Filter value cannot be empty.', 'error');
    return;
  }
  if (def.input === 'number') {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      setStatus('Provide a numeric value.', 'error');
      return;
    }
    value = numberValue;
  } else {
    value = value.toLowerCase();
  }
  const filter = {
    id: createFilterId(),
    type,
    value,
  };
  state.customFilters.push(filter);
  renderActiveFilters();
  applyFilters();
  dom.filterDialog.close();
}

function handleFilterDialogClose() {
  dom.filterValueInput.value = '';
}

function renderExportDialog() {
  renderExportColumns();
  dom.exportDialog.showModal();
}

function handleExportDialogClose() {
  if (dom.exportDialog.returnValue !== 'submit') {
    return;
  }
  const selectedColumns = getSelectedExportColumns();
  if (!selectedColumns.length) {
    setStatus('Select at least one column to export.', 'error');
    return;
  }
  const format = dom.exportForm.querySelector('input[name="export-format"]:checked')?.value || 'json';
  if (format === 'csv') {
    exportCsv(selectedColumns);
  } else {
    exportJson(selectedColumns);
  }
}

function toggleDescription() {
  if (!dom.descriptionPanel) {
    return;
  }
  const hidden = dom.descriptionPanel.hasAttribute('hidden');
  if (hidden) {
    dom.descriptionPanel.removeAttribute('hidden');
    dom.toggleDescriptionButton.textContent = 'Hide';
  } else {
    dom.descriptionPanel.setAttribute('hidden', '');
    dom.toggleDescriptionButton.textContent = 'About';
  }
}

function toggleSearchPanel() {
  state.isSearchCollapsed = !state.isSearchCollapsed;
  if (state.isSearchCollapsed) {
    dom.searchPanel.setAttribute('data-collapsed', 'true');
    dom.collapseSearchButton.textContent = 'Show search';
  } else {
    dom.searchPanel.setAttribute('data-collapsed', 'false');
    dom.collapseSearchButton.textContent = 'Hide search';
  }
}

function toggleOrderDirection() {
  state.orderBy.direction = state.orderBy.direction === 'asc' ? 'desc' : 'asc';
  dom.orderByDirectionButton.textContent = state.orderBy.direction === 'asc' ? 'Asc' : 'Desc';
  applyFilters();
}

function handleOrderByChange(event) {
  state.orderBy.field = event.target.value;
  applyFilters();
}

function buildSuggestionStats(creatives) {
  const stats = {};
  creatives.forEach((creative) => {
    const key = creative.suggestion;
    if (!key) {
      return;
    }
    if (!stats[key]) {
      stats[key] = {
        creativeCount: 0,
        advertisers: new Set(),
        domains: new Set(),
      };
    }
    stats[key].creativeCount += 1;
    if (creative.advertiser_name) {
      stats[key].advertisers.add(creative.advertiser_name);
    }
    if (creative.domain) {
      stats[key].domains.add(creative.domain);
    }
  });
  return stats;
}

function applySuggestionStats(stats) {
  const enrich = (suggestion) => {
    const stat = stats[suggestion.display];
    if (!stat) {
      return suggestion;
    }
    const metadata = { ...(suggestion.metadata || {}) };
    metadata.creativeCountActual = stat.creativeCount;
    metadata.advertiserCount = stat.advertisers.size;
    metadata.domainCount = stat.domains.size;
    return { ...suggestion, metadata };
  };

  state.selectedSuggestions = state.selectedSuggestions.map(enrich);
  state.suggestions = state.suggestions.map(enrich);
}

function handleSearchInput(event) {
  const value = event.target.value;
  state.searchQuery = value;
  if (suggestionDebounce) {
    window.clearTimeout(suggestionDebounce);
  }
  suggestionDebounce = window.setTimeout(() => {
    fetchSuggestions(value);
  }, 300);
}

function handleSearchKeyDown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    if (state.suggestions.length) {
      addSuggestion(state.suggestions[0]);
    }
  }
}

async function fetchSuggestions(rawValue) {
  const query = rawValue.trim();
  if (!query) {
    state.suggestions = [];
    renderSuggestions([]);
    return;
  }
  dom.suggestionsContainer.innerHTML = '<p class="empty">Searching suggestions...</p>';
  try {
    state.suggestions = await client.searchSuggestions(query);
    if (!state.suggestions.length) {
      dom.suggestionsContainer.innerHTML = '<p class="empty">No suggestions returned.</p>';
      setStatus('No suggestions returned.', 'error');
    } else {
      renderSuggestions(state.suggestions);
      setStatus(`Loaded ${state.suggestions.length} suggestions.`, 'info');
    }
  } catch (error) {
    console.error(error);
    dom.suggestionsContainer.innerHTML = '<p class="empty">Unable to fetch suggestions.</p>';
    setStatus(buildNetworkErrorMessage(error, 'Suggestion search failed'), 'error');
  }
}

function buildNetworkErrorMessage(error, context) {
  if (!error) {
    return context;
  }
  if (typeof error.message === 'string' && error.message.length) {
    if (/timed out/i.test(error.message)) {
      return `${context}: ${error.message}`;
    }
    if (error instanceof TypeError) {
      return `${context}: Browser blocked the request (CORS).`;
    }
    return `${context}: ${error.message}`;
  }
  if (error instanceof TypeError) {
    return `${context}: Browser blocked the request (CORS).`;
  }
  return `${context}: Unexpected network error.`;
}

async function fetchCreativesForSelections() {
  if (!state.selectedSuggestions.length) {
    resetCreatives();
    return;
  }

  const version = ++pendingFetchVersion;
  dom.galleryGrid.innerHTML = '<p class="empty">Fetching creatives…</p>';
  setStatus('Fetching creatives...', 'info');
  setProgress('Starting downloads...');

  const queue = state.selectedSuggestions.map((suggestion) => ({
    suggestion,
    run: () =>
      client.searchCreativesByText(suggestion.value, {
        pageLimit: state.config.pageLimit,
        pageSize: state.config.pageSize,
      }),
  }));

  const combinedResults = [];
  const errors = [];
  let completed = 0;
  const total = queue.length;

  const worker = async () => {
    while (queue.length) {
      const job = queue.shift();
      if (!job) {
        return;
      }
      setProgress(`Fetching ${job.suggestion.display} (${completed + 1}/${total})...`);
      try {
        const creatives = await job.run();
        creatives.forEach((creative) => {
          combinedResults.push({ ...creative, suggestion: job.suggestion.display });
        });
      } catch (error) {
        errors.push({ suggestion: job.suggestion.display, error });
      } finally {
        completed += 1;
        setProgress(`Completed ${completed}/${total} suggestions.`);
      }
    }
  };

  const concurrency = Math.min(state.config.concurrency, total);
  await Promise.all(Array.from({ length: concurrency }, worker));

  if (version !== pendingFetchVersion) {
    return;
  }

  setProgress('');

  if (errors.length) {
    console.error(errors);
    const firstError = errors[0];
    const detail = buildNetworkErrorMessage(firstError?.error, firstError?.suggestion || 'Request');
    setStatus(`Fetched with ${errors.length} error(s). ${detail}`, 'error');
  } else {
    setStatus(`Fetched ${combinedResults.length} creatives.`, 'success');
  }

  state.creatives = combinedResults;
  populateFilterOptions(state.creatives);
  const stats = buildSuggestionStats(combinedResults);
  applySuggestionStats(stats);
  renderSuggestions(state.suggestions);
  renderSelectedSuggestions();
  applyFilters();
}

function handleClearSuggestions() {
  state.selectedSuggestions = [];
  renderSelectedSuggestions();
  scheduleCreativeFetch();
}

function openCreativeDialog(creative) {
  if (!dom.creativeDialog || !dom.creativeDialogBody) {
    return;
  }

  const fragment = document.createDocumentFragment();

  if (creative.ad_image_url) {
    const media = document.createElement('div');
    media.className = 'creative-modal__media';
    const img = document.createElement('img');
    img.src = creative.ad_image_url;
    img.alt = `Creative preview for ${creative.advertiser_name || creative.creative_id || 'creative'}`;
    media.appendChild(img);
    fragment.appendChild(media);
  }

  const details = document.createElement('dl');
  details.className = 'creative-details';
  const rows = [
    ['Advertiser', creative.advertiser_name || '—'],
    ['Suggestion', creative.suggestion || '—'],
    ['Domain', creative.domain || '—'],
    ['Creative ID', creative.creative_id || '—'],
    ['Advertiser ID', creative.advertiser_id || '—'],
    ['First shown', creative.first_shown_human || '—'],
    ['Last shown', creative.last_shown_human || '—'],
    ['Creative URL', creative.url || '', 'link'],
    ['Image URL', creative.ad_image_url || '', 'link'],
  ];

  rows.forEach(([label, value, type]) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    if (type === 'link' && value) {
      const link = document.createElement('a');
      link.href = value;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = value;
      link.className = 'table__link';
      dd.appendChild(link);
    } else {
      dd.textContent = value || '—';
    }
    details.appendChild(dt);
    details.appendChild(dd);
  });

  fragment.appendChild(details);

  const jsonBlock = document.createElement('pre');
  jsonBlock.className = 'creative-json';
  jsonBlock.textContent = JSON.stringify(creative, null, 2);
  fragment.appendChild(jsonBlock);

  dom.creativeDialogBody.innerHTML = '';
  dom.creativeDialogBody.appendChild(fragment);
  dom.creativeDialog.showModal();
}

function closeCreativeDialog() {
  if (dom.creativeDialog && dom.creativeDialog.open) {
    dom.creativeDialog.close();
  }
}

function maybeWarnAboutCors() {
  const hostIsGoogle = /(^|\.)google\.com$/i.test(window.location.hostname);
  const usingGoogleBase = /adstransparency\.google\.com/i.test(state.config.baseUrl);
  if (!hostIsGoogle && usingGoogleBase) {
    setStatus('Running outside google.com? Configure a proxy to avoid CORS errors.', 'info');
  }
}

function init() {
  renderSelectedSuggestions();
  renderSuggestions([]);
  renderGallery();
  renderExportColumns();
  renderActiveFilters();

  dom.searchInput.addEventListener('input', handleSearchInput);
  dom.searchInput.addEventListener('keydown', handleSearchKeyDown);
  dom.clearSuggestionsButton.addEventListener('click', handleClearSuggestions);

  dom.addFilterButton.addEventListener('click', openFilterDialog);
  dom.filterTypeSelect.addEventListener('change', updateFilterDialogInput);
  dom.filterForm.addEventListener('submit', handleFilterFormSubmit);
  dom.filterDialog.addEventListener('close', handleFilterDialogClose);

  dom.orderBySelect.addEventListener('change', handleOrderByChange);
  dom.orderByDirectionButton.addEventListener('click', toggleOrderDirection);
  dom.orderByDirectionButton.textContent = 'Desc';

  dom.openExportDialogButton.addEventListener('click', renderExportDialog);
  dom.exportDialog.addEventListener('close', handleExportDialogClose);

  dom.toggleDescriptionButton.addEventListener('click', toggleDescription);
  dom.collapseSearchButton.addEventListener('click', toggleSearchPanel);

  if (dom.closeCreativeDialogButton) {
    dom.closeCreativeDialogButton.addEventListener('click', closeCreativeDialog);
  }
  if (dom.creativeDialog) {
    dom.creativeDialog.addEventListener('click', (event) => {
      if (event.target === dom.creativeDialog) {
        closeCreativeDialog();
      }
    });
    dom.creativeDialog.addEventListener('cancel', closeCreativeDialog);
  }

  maybeWarnAboutCors();
}

init();
