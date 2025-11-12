const FILTER_CONFIG = {
  advertiser: {
    label: 'Advertiser',
    valueLabel: 'Advertisers',
    valueSource: 'advertisers',
    operators: [
      { value: 'in', label: 'In', input: 'multi' },
      { value: 'not_in', label: 'Not in', input: 'multi' },
      { value: 'like', label: 'Like', input: 'text', valueLabel: 'Search text' },
      { value: 'not_like', label: 'Not like', input: 'text', valueLabel: 'Search text' },
    ],
  },
  domain: {
    label: 'Domain',
    valueLabel: 'Domains',
    valueSource: 'domains',
    operators: [
      { value: 'in', label: 'In', input: 'multi' },
      { value: 'not_in', label: 'Not in', input: 'multi' },
      { value: 'like', label: 'Like', input: 'text', valueLabel: 'Search text' },
      { value: 'not_like', label: 'Not like', input: 'text', valueLabel: 'Search text' },
    ],
  },
  adCount: {
    label: '# of ads (per advertiser)',
    valueLabel: '# of ads',
    operators: [
      { value: '>', label: '>' , input: 'number' },
      { value: '<', label: '<', input: 'number' },
      { value: '>=', label: '>=', input: 'number' },
      { value: '<=', label: '<=', input: 'number' },
      { value: '=', label: '=', input: 'number' },
    ],
  },
  lastShown: {
    label: 'Last shown',
    valueLabel: 'Date range',
    operators: [{ value: 'between', label: 'Between', input: 'date-range' }],
  },
};

const ORDER_FIELDS = {
  last_shown_timestamp: 'Last shown',
  advertiser_name: 'Advertiser',
  domain: 'Domain',
  ad_count: 'Number of ads',
};

const DEFAULT_ORDER_FIELD = 'last_shown_timestamp';
const DEFAULT_ORDER_DIRECTION = 'desc';

const dom = {
  searchInput: document.getElementById('search-input'),
  suggestionsContainer: document.getElementById('suggestions-container'),
  selectedSuggestions: document.getElementById('selected-suggestions'),
  clearSuggestionsButton: document.getElementById('clear-suggestions'),
  selectionsPanel: document.querySelector('.panel--selections'),
  collapseSelectionsButton: document.getElementById('collapse-selections'),
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
  filtersPanel: document.querySelector('.panel--filters'),
  collapseFiltersButton: document.getElementById('collapse-filters'),
  filterDialog: document.getElementById('filter-dialog'),
  filterForm: document.getElementById('filter-form'),
  filterTypeSelect: document.getElementById('filter-type'),
  filterOperatorWrapper: document.getElementById('filter-operator-wrapper'),
  filterOperatorSelect: document.getElementById('filter-operator'),
  filterValueWrapper: document.getElementById('filter-value-wrapper'),
  filterValueLabel: document.getElementById('filter-value-label'),
  filterMultiValue: document.getElementById('filter-multi-value'),
  filterTextValue: document.getElementById('filter-text-value'),
  filterNumberValue: document.getElementById('filter-number-value'),
  filterDateRange: document.getElementById('filter-date-range'),
  filterDateStart: document.getElementById('filter-date-start'),
  filterDateEnd: document.getElementById('filter-date-end'),
  filterSubmitButton: document.getElementById('filter-submit-button'),
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
  filterOptions: {
    advertisers: [],
    domains: [],
  },
  searchQuery: '',
  isSearchCollapsed: false,
  isSelectionsCollapsed: true,
  isFiltersCollapsed: false,
  orderBy: {
    field: DEFAULT_ORDER_FIELD,
    direction: DEFAULT_ORDER_DIRECTION,
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

const URL_PARAM_KEYS = {
  query: 'q',
  tracked: 'tracked',
  filters: 'filters',
  orderField: 'order',
  orderDirection: 'dir',
  collapsed: 'collapsed',
};

let urlSyncTimer = null;
let suppressUrlSync = false;
let editingFilterId = null;

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

function safeJsonParse(value, fallback) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function serializeSuggestionForUrl(suggestion) {
  return {
    value: suggestion.value,
    display: suggestion.display || suggestion.value,
    type: suggestion.type || 'text',
    metadata: { ...(suggestion.metadata || {}) },
  };
}

function serializeFilterForUrl(filter) {
  const payload = { type: filter.type };
  if (filter.operator) {
    payload.operator = filter.operator;
  }
  if (filter.value !== undefined) {
    payload.value = filter.value;
  }
  return payload;
}

function serializeStateToParams() {
  const params = new URLSearchParams();
  if (state.searchQuery) {
    params.set(URL_PARAM_KEYS.query, state.searchQuery);
  }
  if (state.selectedSuggestions.length) {
    params.set(
      URL_PARAM_KEYS.tracked,
      JSON.stringify(state.selectedSuggestions.map((suggestion) => serializeSuggestionForUrl(suggestion))),
    );
  }
  if (state.customFilters.length) {
    params.set(
      URL_PARAM_KEYS.filters,
      JSON.stringify(state.customFilters.map((filter) => serializeFilterForUrl(filter))),
    );
  }
  if (state.orderBy.field && state.orderBy.field !== DEFAULT_ORDER_FIELD) {
    params.set(URL_PARAM_KEYS.orderField, state.orderBy.field);
  }
  if (state.orderBy.direction && state.orderBy.direction !== DEFAULT_ORDER_DIRECTION) {
    params.set(URL_PARAM_KEYS.orderDirection, state.orderBy.direction);
  }
  if (state.isSearchCollapsed) {
    params.set(URL_PARAM_KEYS.collapsed, '1');
  }
  return params;
}

function scheduleUrlSync() {
  if (suppressUrlSync || typeof window === 'undefined' || typeof window.history === 'undefined') {
    return;
  }
  if (urlSyncTimer) {
    window.clearTimeout(urlSyncTimer);
  }
  urlSyncTimer = window.setTimeout(() => {
    urlSyncTimer = null;
    const params = serializeStateToParams();
    const search = params.toString();
    const hash = window.location.hash || '';
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${hash}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState({}, '', nextUrl);
    }
  }, 150);
}

function withSuppressedUrlSync(callback) {
  suppressUrlSync = true;
  try {
    callback();
  } finally {
    suppressUrlSync = false;
  }
}

function normalizeSuggestionFromUrl(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const rawValue = entry.value ?? entry.display;
  if (!rawValue) {
    return null;
  }
  const value = String(rawValue);
  const display = entry.display ? String(entry.display) : value;
  const allowedTypes = new Set(['advertiser', 'domain', 'text']);
  const type = allowedTypes.has(entry.type) ? entry.type : 'text';
  const metadata = entry.metadata && typeof entry.metadata === 'object' ? { ...entry.metadata } : {};
  return { value, display, type, metadata };
}

function normalizeFilterFromUrl(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const migrated = migrateLegacyFilter(entry);
  const type = migrated?.type || entry.type;
  const config = FILTER_CONFIG[type];
  if (!config) {
    return null;
  }
  const operatorValue = migrated?.operator || entry.operator || config.operators[0]?.value;
  const operatorConfig = config.operators.find((op) => op.value === operatorValue);
  if (!operatorConfig) {
    return null;
  }
  const normalizedValue = normalizeFilterValue(migrated?.value ?? entry.value, operatorConfig.input);
  if (normalizedValue == null) {
    return null;
  }
  return {
    id: createFilterId(),
    type,
    operator: operatorConfig.value,
    value: normalizedValue,
  };
}

function migrateLegacyFilter(entry) {
  switch (entry.type) {
    case 'includeAdvertiser':
      return { type: 'advertiser', operator: 'in', value: entry.value ? [entry.value] : [] };
    case 'excludeAdvertiser':
      return { type: 'advertiser', operator: 'not_in', value: entry.value ? [entry.value] : [] };
    case 'includeDomain':
      return { type: 'domain', operator: 'in', value: entry.value ? [entry.value] : [] };
    case 'excludeDomain':
      return { type: 'domain', operator: 'not_in', value: entry.value ? [entry.value] : [] };
    case 'minAds':
      return { type: 'adCount', operator: '>=', value: entry.value };
    default:
      return null;
  }
}

function normalizeFilterValue(value, mode) {
  switch (mode) {
    case 'multi':
      return normalizeMultiValue(value);
    case 'text':
      return normalizeTextValue(value);
    case 'number':
      return normalizeNumberValue(value);
    case 'date-range':
      return normalizeDateRangeValue(value);
    default:
      return null;
  }
}

function normalizeMultiValue(value) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string' && value
      ? [value]
      : [];
  const normalized = raw
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
  if (!normalized.length) {
    return null;
  }
  const deduped = Array.from(new Set(normalized));
  return deduped.sort((a, b) => a.localeCompare(b));
}

function normalizeTextValue(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeNumberValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric;
}

function normalizeDateRangeValue(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const start = typeof value.start === 'string' ? value.start : value.from;
  const end = typeof value.end === 'string' ? value.end : value.to;
  if (!start || !end) {
    return null;
  }
  const startStr = String(start).slice(0, 10);
  const endStr = String(end).slice(0, 10);
  if (!startStr || !endStr || startStr > endStr) {
    return null;
  }
  const startMs = Date.parse(`${startStr}T00:00:00Z`);
  const endMs = Date.parse(`${endStr}T00:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return null;
  }
  return { start: startStr, end: endStr };
}

function areSuggestionListsEqual(nextList, currentList) {
  if (nextList.length !== currentList.length) {
    return false;
  }
  return nextList.every(
    (entry, index) => entry.value === currentList[index].value && entry.type === currentList[index].type,
  );
}

function areFiltersEqual(nextFilters, currentFilters) {
  if (nextFilters.length !== currentFilters.length) {
    return false;
  }
  return nextFilters.every((entry, index) => {
    const current = currentFilters[index];
    if (!current) {
      return false;
    }
    if (entry.type !== current.type) {
      return false;
    }
    if ((entry.operator || '') !== (current.operator || '')) {
      return false;
    }
    return areFilterValuesEqual(entry.value, current.value);
  });
}

function areFilterValuesEqual(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((value, index) => value === b[index]);
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length) {
      return false;
    }
    return keysA.every((key, index) => keysB[index] === key && a[key] === b[key]);
  }
  return a === b;
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function applySearchPanelState() {
  if (!dom.searchPanel || !dom.collapseSearchButton) {
    return;
  }
  if (state.isSearchCollapsed) {
    dom.searchPanel.setAttribute('data-collapsed', 'true');
    dom.collapseSearchButton.textContent = 'Show search';
  } else {
    dom.searchPanel.setAttribute('data-collapsed', 'false');
    dom.collapseSearchButton.textContent = 'Hide search';
  }
}

function applySelectionsPanelState() {
  if (!dom.selectionsPanel || !dom.collapseSelectionsButton) {
    return;
  }
  if (state.isSelectionsCollapsed) {
    dom.selectionsPanel.setAttribute('data-collapsed', 'true');
    dom.collapseSelectionsButton.textContent = 'Show tracked';
  } else {
    dom.selectionsPanel.setAttribute('data-collapsed', 'false');
    dom.collapseSelectionsButton.textContent = 'Hide tracked';
  }
}

function applyFiltersPanelState() {
  if (!dom.filtersPanel || !dom.collapseFiltersButton) {
    return;
  }
  if (state.isFiltersCollapsed) {
    dom.filtersPanel.setAttribute('data-collapsed', 'true');
    dom.collapseFiltersButton.textContent = 'Show filters';
  } else {
    dom.filtersPanel.setAttribute('data-collapsed', 'false');
    dom.collapseFiltersButton.textContent = 'Hide filters';
  }
}

function hydrateStateFromUrl() {
  if (typeof window === 'undefined') {
    return {
      selectionsChanged: false,
      filtersChanged: false,
      orderChanged: false,
      queryChanged: false,
      collapsedChanged: false,
    };
  }
  const params = new URLSearchParams(window.location.search || '');
  const nextQuery = params.get(URL_PARAM_KEYS.query) || '';
  const nextSuggestions = safeJsonParse(params.get(URL_PARAM_KEYS.tracked), [])
    .map((entry) => normalizeSuggestionFromUrl(entry))
    .filter(Boolean);
  const nextFilters = safeJsonParse(params.get(URL_PARAM_KEYS.filters), [])
    .map((entry) => normalizeFilterFromUrl(entry))
    .filter(Boolean);
  const orderFieldCandidate = params.get(URL_PARAM_KEYS.orderField);
  const nextOrderField = ORDER_FIELDS[orderFieldCandidate] ? orderFieldCandidate : DEFAULT_ORDER_FIELD;
  const orderDirectionCandidate = params.get(URL_PARAM_KEYS.orderDirection);
  const nextOrderDirection = orderDirectionCandidate === 'asc' ? 'asc' : DEFAULT_ORDER_DIRECTION;
  const nextCollapsed = params.get(URL_PARAM_KEYS.collapsed) === '1';

  const selectionsChanged = !areSuggestionListsEqual(nextSuggestions, state.selectedSuggestions);
  const filtersChanged = !areFiltersEqual(nextFilters, state.customFilters);
  const orderChanged =
    nextOrderField !== state.orderBy.field || nextOrderDirection !== state.orderBy.direction;
  const queryChanged = nextQuery !== state.searchQuery;
  const collapsedChanged = nextCollapsed !== state.isSearchCollapsed;

  withSuppressedUrlSync(() => {
    state.searchQuery = nextQuery;
    state.selectedSuggestions = nextSuggestions;
    state.customFilters = nextFilters;
    state.orderBy.field = nextOrderField;
    state.orderBy.direction = nextOrderDirection;
    state.isSearchCollapsed = nextCollapsed;
    if (dom.searchInput) {
      dom.searchInput.value = state.searchQuery;
    }
    if (dom.orderBySelect) {
      dom.orderBySelect.value = state.orderBy.field;
    }
    if (dom.orderByDirectionButton) {
      dom.orderByDirectionButton.textContent = state.orderBy.direction === 'asc' ? 'Asc' : 'Desc';
    }
    applySearchPanelState();
    applySelectionsPanelState();
    applyFiltersPanelState();
  });

  return { selectionsChanged, filtersChanged, orderChanged, queryChanged, collapsedChanged };
}

function handlePopState() {
  const changes = hydrateStateFromUrl();
  renderSelectedSuggestions();
  renderActiveFilters();
  applyFilters();

  if (changes.queryChanged) {
    if (state.searchQuery) {
      fetchSuggestions(state.searchQuery);
    } else {
      state.suggestions = [];
      renderSuggestions([]);
    }
  }

  if (changes.selectionsChanged) {
    if (state.selectedSuggestions.length) {
      scheduleCreativeFetch();
    } else {
      resetCreatives();
    }
  }
}

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
    last_shown_ms: toTimestampMs(lastShown),
    last_shown_human: formatTimestamp(lastShown),
    ad_data: adData || '',
    ad_image_url: extractImageUrl(adData),
    url:
      advertiserId && creativeId
        ? `https://adstransparency.google.com/advertiser/${advertiserId}/creative/${creativeId}`
        : '',
  };
}

function toTimestampMs(value) {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const stringified = String(value);
  if (stringified.length === 10) {
    return numeric * 1000;
  }
  if (stringified.length > 13) {
    return Math.floor(numeric / 1000);
  }
  return numeric;
}

function formatTimestamp(value) {
  const ms = toTimestampMs(value);
  if (!Number.isFinite(ms)) {
    return value || '';
  }
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return value || '';
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
  scheduleUrlSync();
}

function removeSuggestion(value) {
  state.selectedSuggestions = state.selectedSuggestions.filter((entry) => entry.value !== value);
  renderSelectedSuggestions();
  renderSuggestions(state.suggestions);
  scheduleCreativeFetch();
  scheduleUrlSync();
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

  state.filterOptions = { advertisers, domains };
  if (dom.filterDialog?.open) {
    refreshFilterValueInput(true);
  }
}

function buildStructuralStats(creatives) {
  const advertiserCounts = {};

  creatives.forEach((creative) => {
    const advertiser = creative.advertiser_name || creative.advertiser_id || '—';
    advertiserCounts[advertiser] = (advertiserCounts[advertiser] || 0) + 1;
  });

  return { advertiserCounts };
}

function evaluateFilter(filter, creative, advertiserCounts) {
  switch (filter.type) {
    case 'advertiser':
      return evaluateStringFilter(creative.advertiser_name || creative.advertiser_id || '', filter);
    case 'domain':
      return evaluateStringFilter(creative.domain || '', filter);
    case 'adCount': {
      const advertiser = creative.advertiser_name || creative.advertiser_id || '—';
      const count = advertiserCounts[advertiser] || 0;
      return evaluateNumericFilter(count, filter.operator, filter.value);
    }
    case 'lastShown':
      return evaluateLastShownFilter(creative, filter.value);
    default:
      return true;
  }
}

function evaluateStringFilter(targetValue, filter) {
  const target = String(targetValue || '').toLowerCase();
  if (filter.operator === 'like' || filter.operator === 'not_like') {
    const needle = String(filter.value || '').toLowerCase();
    const matches = needle.length ? target.includes(needle) : false;
    return filter.operator === 'like' ? matches : !matches;
  }
  if ((filter.operator === 'in' || filter.operator === 'not_in') && Array.isArray(filter.value)) {
    const haystack = new Set(filter.value.map((entry) => String(entry || '').toLowerCase()));
    const contains = haystack.has(target);
    return filter.operator === 'in' ? contains : !contains;
  }
  return true;
}

function evaluateNumericFilter(target, operator, value) {
  const comparison = Number(value);
  if (!Number.isFinite(comparison)) {
    return true;
  }
  switch (operator) {
    case '>':
      return target > comparison;
    case '<':
      return target < comparison;
    case '>=':
      return target >= comparison;
    case '<=':
      return target <= comparison;
    case '=':
      return target === comparison;
    default:
      return true;
  }
}

function evaluateLastShownFilter(creative, range) {
  if (!range || !range.start || !range.end) {
    return true;
  }
  const timestamp = Number.isFinite(creative.last_shown_ms)
    ? creative.last_shown_ms
    : toTimestampMs(creative.last_shown_timestamp);
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  const bounds = buildDateBounds(range.start, range.end);
  if (!bounds) {
    return true;
  }
  return timestamp >= bounds.start && timestamp <= bounds.end;
}

function buildDateBounds(start, end) {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T23:59:59.999Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return null;
  }
  return { start: startMs, end: endMs };
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
        valA = Number.isFinite(a.last_shown_ms) ? a.last_shown_ms : toTimestampMs(a.last_shown_timestamp) || 0;
        valB = Number.isFinite(b.last_shown_ms) ? b.last_shown_ms : toTimestampMs(b.last_shown_timestamp) || 0;
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
  const { advertiserCounts } = buildStructuralStats(state.creatives);
  let filtered = state.creatives.filter((creative) =>
    state.customFilters.every((filter) => evaluateFilter(filter, creative, advertiserCounts)),
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
  const config = FILTER_CONFIG[filter.type];
  if (!config) {
    return filter.type || 'Filter';
  }
  const operator = config.operators.find((entry) => entry.value === filter.operator);
  const operatorLabel = operator?.label || filter.operator || '';
  if ((filter.type === 'advertiser' || filter.type === 'domain') && Array.isArray(filter.value)) {
    return `${config.label} ${operatorLabel}: ${filter.value.join(', ')}`;
  }
  if (filter.type === 'advertiser' || filter.type === 'domain') {
    return `${config.label} ${operatorLabel.toLowerCase()} "${filter.value}"`;
  }
  if (filter.type === 'adCount') {
    return `${config.label} ${filter.operator} ${filter.value}`;
  }
  if (filter.type === 'lastShown') {
    const start = formatDateLabel(filter.value?.start);
    const end = formatDateLabel(filter.value?.end);
    return `${config.label} ${operatorLabel.toLowerCase()} ${start} to ${end}`;
  }
  return `${config.label}: ${filter.value}`;
}

function formatDateLabel(dateString) {
  if (!dateString) {
    return '—';
  }
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }
  return date.toISOString().slice(0, 10);
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
    const description = describeFilter(filter);
    chip.textContent = description;
    chip.dataset.filterId = filter.id;
    chip.tabIndex = 0;
    chip.setAttribute('role', 'button');
    chip.setAttribute('aria-label', `Edit filter: ${description}`);
    chip.title = 'Click to edit filter';
    chip.addEventListener('click', () => openFilterDialog(filter));
    chip.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openFilterDialog(filter);
      }
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Remove filter');
    remove.textContent = '✕';
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      state.customFilters = state.customFilters.filter((item) => item.id !== filter.id);
      renderActiveFilters();
      applyFilters();
      scheduleUrlSync();
    });
    chip.appendChild(remove);
    dom.activeFilters.appendChild(chip);
  });
}

function openFilterDialog(filter = null) {
  if (!dom.filterDialog) {
    return;
  }
  editingFilterId = filter?.id || null;
  const desiredType = filter?.type && FILTER_CONFIG[filter.type] ? filter.type : 'advertiser';
  if (dom.filterTypeSelect) {
    dom.filterTypeSelect.value = desiredType;
  }
  resetFilterValueInputs();
  refreshFilterOperatorOptions(true);
  if (filter?.operator && dom.filterOperatorSelect) {
    const hasOperator = Array.from(dom.filterOperatorSelect.options).some((option) => option.value === filter.operator);
    if (hasOperator) {
      dom.filterOperatorSelect.value = filter.operator;
    }
  }
  const preselectedMultiValues = Array.isArray(filter?.value) ? filter.value : null;
  refreshFilterValueInput(false, preselectedMultiValues);
  applyFilterValueToForm(filter);
  setFilterDialogSubmitLabel(filter ? 'Save' : 'Add');
  dom.filterDialog.showModal();
}

function refreshFilterOperatorOptions(forceReset = false) {
  if (!dom.filterTypeSelect || !dom.filterOperatorSelect) {
    return;
  }
  const type = dom.filterTypeSelect.value;
  const config = FILTER_CONFIG[type];
  if (!config) {
    if (dom.filterOperatorWrapper) {
      dom.filterOperatorWrapper.setAttribute('hidden', 'true');
    }
    if (dom.filterValueWrapper) {
      dom.filterValueWrapper.setAttribute('hidden', 'true');
    }
    return;
  }
  if (dom.filterValueWrapper) {
    dom.filterValueWrapper.removeAttribute('hidden');
  }
  const previousValue = dom.filterOperatorSelect.value;
  dom.filterOperatorSelect.innerHTML = '';
  config.operators.forEach((operator) => {
    const option = document.createElement('option');
    option.value = operator.value;
    option.textContent = operator.label;
    dom.filterOperatorSelect.appendChild(option);
  });
  const operatorExists = config.operators.some((operator) => operator.value === previousValue);
  const shouldResetSelection = forceReset || !operatorExists;
  dom.filterOperatorSelect.value = shouldResetSelection ? config.operators[0]?.value || '' : previousValue;
  const hideOperator = config.operators.length <= 1;
  if (dom.filterOperatorWrapper) {
    if (hideOperator) {
      dom.filterOperatorWrapper.setAttribute('hidden', 'true');
    } else {
      dom.filterOperatorWrapper.removeAttribute('hidden');
    }
  }
  dom.filterOperatorSelect.disabled = hideOperator;
  refreshFilterValueInput();
}

function refreshFilterValueInput(preserveMultiSelection = false, presetMultiValues = null) {
  if (!dom.filterTypeSelect) {
    return;
  }
  const type = dom.filterTypeSelect.value;
  const config = FILTER_CONFIG[type];
  if (!config) {
    return;
  }
  const operatorValue =
    (dom.filterOperatorSelect && dom.filterOperatorSelect.value) || config.operators[0]?.value || '';
  const operatorConfig = config.operators.find((entry) => entry.value === operatorValue) || config.operators[0];
  const valueMode = operatorConfig?.input || 'text';
  const label = operatorConfig?.valueLabel || config.valueLabel || 'Value';
  if (dom.filterValueLabel) {
    dom.filterValueLabel.textContent = label;
  }
  const showMulti = valueMode === 'multi';
  toggleFilterInput(dom.filterMultiValue, showMulti);
  if (showMulti && config.valueSource) {
    populateMultiSelectOptions(config.valueSource, preserveMultiSelection, presetMultiValues);
  }
  if (!showMulti && dom.filterMultiValue) {
    Array.from(dom.filterMultiValue.options).forEach((option) => {
      option.selected = false;
    });
  }
  const showText = valueMode === 'text';
  toggleFilterInput(dom.filterTextValue, showText);
  const showNumber = valueMode === 'number';
  toggleFilterInput(dom.filterNumberValue, showNumber);
  const showDate = valueMode === 'date-range';
  if (dom.filterDateRange) {
    if (showDate) {
      dom.filterDateRange.removeAttribute('hidden');
    } else {
      dom.filterDateRange.setAttribute('hidden', 'true');
    }
  }
  if (dom.filterDateStart) {
    dom.filterDateStart.disabled = !showDate;
  }
  if (dom.filterDateEnd) {
    dom.filterDateEnd.disabled = !showDate;
  }
}

function toggleFilterInput(element, show) {
  if (!element) {
    return;
  }
  if (show) {
    element.removeAttribute('hidden');
    if ('disabled' in element) {
      element.disabled = false;
    }
  } else {
    element.setAttribute('hidden', 'true');
    if ('disabled' in element) {
      element.disabled = true;
    }
  }
}

function populateMultiSelectOptions(source, preserveSelection, ensureValues = null) {
  if (!dom.filterMultiValue) {
    return;
  }
  const initialOptions = state.filterOptions[source] || [];
  const unique = new Set(initialOptions);
  if (Array.isArray(ensureValues)) {
    ensureValues.forEach((value) => {
      if (value) {
        unique.add(value);
      }
    });
  }
  const options = Array.from(unique).sort((a, b) => a.localeCompare(b));
  const previousSelection = preserveSelection
    ? new Set(Array.from(dom.filterMultiValue.selectedOptions).map((option) => option.value))
    : new Set();
  const ensureSelection = Array.isArray(ensureValues) ? new Set(ensureValues.map((value) => String(value))) : null;
  dom.filterMultiValue.innerHTML = '';
  options.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    if ((preserveSelection && previousSelection.has(value)) || (ensureSelection && ensureSelection.has(value))) {
      option.selected = true;
    }
    dom.filterMultiValue.appendChild(option);
  });
  dom.filterMultiValue.disabled = !options.length;
}

function resetFilterValueInputs() {
  if (dom.filterMultiValue) {
    Array.from(dom.filterMultiValue.options).forEach((option) => {
      option.selected = false;
    });
  }
  if (dom.filterTextValue) {
    dom.filterTextValue.value = '';
  }
  if (dom.filterNumberValue) {
    dom.filterNumberValue.value = '';
  }
  if (dom.filterDateStart) {
    dom.filterDateStart.value = '';
  }
  if (dom.filterDateEnd) {
    dom.filterDateEnd.value = '';
  }
}

function getOperatorConfig(type, operatorValue) {
  const config = FILTER_CONFIG[type];
  if (!config) {
    return null;
  }
  return config.operators.find((entry) => entry.value === operatorValue) || config.operators[0] || null;
}

function applyFilterValueToForm(filter) {
  if (!filter) {
    return;
  }
  const operatorConfig = getOperatorConfig(filter.type, filter.operator);
  if (!operatorConfig) {
    return;
  }
  switch (operatorConfig.input) {
    case 'multi': {
      if (!dom.filterMultiValue || !Array.isArray(filter.value)) {
        return;
      }
      const selected = new Set(filter.value.map((entry) => String(entry)));
      Array.from(dom.filterMultiValue.options).forEach((option) => {
        option.selected = selected.has(option.value);
      });
      break;
    }
    case 'text':
      if (dom.filterTextValue) {
        dom.filterTextValue.value = typeof filter.value === 'string' ? filter.value : '';
      }
      break;
    case 'number':
      if (dom.filterNumberValue) {
        dom.filterNumberValue.value =
          typeof filter.value === 'number' && Number.isFinite(filter.value) ? String(filter.value) : '';
      }
      break;
    case 'date-range':
      if (dom.filterDateStart) {
        dom.filterDateStart.value = filter.value?.start || '';
      }
      if (dom.filterDateEnd) {
        dom.filterDateEnd.value = filter.value?.end || '';
      }
      break;
    default:
      break;
  }
}

function setFilterDialogSubmitLabel(label) {
  if (dom.filterSubmitButton && typeof label === 'string' && label.length) {
    dom.filterSubmitButton.textContent = label;
  }
}

function enableAccessibleMultiSelect() {
  if (!dom.filterMultiValue) {
    return;
  }
  dom.filterMultiValue.addEventListener('mousedown', (event) => {
    const target = event.target;
    if (!target || target.tagName !== 'OPTION') {
      return;
    }
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      return;
    }
    event.preventDefault();
    const option = target;
    option.selected = !option.selected;
    dom.filterMultiValue.dispatchEvent(new Event('change', { bubbles: true }));
    dom.filterMultiValue.focus();
  });
}

function handleFilterFormSubmit(event) {
  event.preventDefault();
  const type = dom.filterTypeSelect?.value;
  const config = type ? FILTER_CONFIG[type] : null;
  if (!config) {
    dom.filterDialog?.close();
    return;
  }
  const operatorValue =
    (dom.filterOperatorSelect && dom.filterOperatorSelect.value) || config.operators[0]?.value;
  const operatorConfig = config.operators.find((entry) => entry.value === operatorValue);
  if (!operatorConfig) {
    setStatus('Select an operator.', 'error');
    return;
  }
  let value = null;
  if (operatorConfig.input === 'multi') {
    const selections = dom.filterMultiValue
      ? Array.from(dom.filterMultiValue.selectedOptions).map((option) => option.value).filter(Boolean)
      : [];
    if (!selections.length) {
      setStatus('Select at least one value.', 'error');
      return;
    }
    value = Array.from(new Set(selections)).sort((a, b) => a.localeCompare(b));
  } else if (operatorConfig.input === 'text') {
    const textRaw = dom.filterTextValue ? dom.filterTextValue.value : '';
    const text = textRaw.trim();
    if (!text) {
      setStatus('Enter a value.', 'error');
      return;
    }
    value = text;
  } else if (operatorConfig.input === 'number') {
    const numberRaw = dom.filterNumberValue ? dom.filterNumberValue.value : '';
    const raw = numberRaw.trim();
    if (!raw) {
      setStatus('Enter a number.', 'error');
      return;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      setStatus('Provide a numeric value.', 'error');
      return;
    }
    value = numeric;
  } else if (operatorConfig.input === 'date-range') {
    const start = dom.filterDateStart?.value;
    const end = dom.filterDateEnd?.value;
    if (!start || !end) {
      setStatus('Select both start and end dates.', 'error');
      return;
    }
    if (start > end) {
      setStatus('Start date must be before end date.', 'error');
      return;
    }
    value = { start, end };
  }
  if (value == null) {
    setStatus('Provide a filter value.', 'error');
    return;
  }
  const filterId = editingFilterId || createFilterId();
  const filter = {
    id: filterId,
    type,
    operator: operatorConfig.value,
    value,
  };
  if (editingFilterId) {
    state.customFilters = state.customFilters.map((item) => (item.id === editingFilterId ? filter : item));
  } else {
    state.customFilters.push(filter);
  }
  renderActiveFilters();
  applyFilters();
  dom.filterDialog.close();
  scheduleUrlSync();
}

function handleFilterDialogClose() {
  resetFilterValueInputs();
  if (dom.filterTypeSelect) {
    dom.filterTypeSelect.value = 'advertiser';
  }
  refreshFilterOperatorOptions(true);
  editingFilterId = null;
  setFilterDialogSubmitLabel('Add');
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
  applySearchPanelState();
  scheduleUrlSync();
}

function toggleSelectionsPanel() {
  state.isSelectionsCollapsed = !state.isSelectionsCollapsed;
  applySelectionsPanelState();
}

function toggleFiltersPanel() {
  state.isFiltersCollapsed = !state.isFiltersCollapsed;
  applyFiltersPanelState();
}

function toggleOrderDirection() {
  state.orderBy.direction = state.orderBy.direction === 'asc' ? 'desc' : 'asc';
  dom.orderByDirectionButton.textContent = state.orderBy.direction === 'asc' ? 'Asc' : 'Desc';
  applyFilters();
  scheduleUrlSync();
}

function handleOrderByChange(event) {
  state.orderBy.field = event.target.value;
  applyFilters();
  scheduleUrlSync();
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
  scheduleUrlSync();
  if (suggestionDebounce) {
    window.clearTimeout(suggestionDebounce);
  }
  suggestionDebounce = window.setTimeout(() => {
    fetchSuggestions(value);
  }, 300);
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
  scheduleUrlSync();
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
  hydrateStateFromUrl();
  renderSelectedSuggestions();
  renderSuggestions([]);
  renderGallery();
  renderExportColumns();
  renderActiveFilters();
  applyFilters();

  dom.searchInput.addEventListener('input', handleSearchInput);
  dom.clearSuggestionsButton.addEventListener('click', handleClearSuggestions);

  dom.addFilterButton.addEventListener('click', () => openFilterDialog());
  if (dom.collapseSelectionsButton) {
    dom.collapseSelectionsButton.addEventListener('click', toggleSelectionsPanel);
  }
  if (dom.collapseFiltersButton) {
    dom.collapseFiltersButton.addEventListener('click', toggleFiltersPanel);
  }
  dom.filterTypeSelect.addEventListener('change', () => {
    resetFilterValueInputs();
    refreshFilterOperatorOptions(true);
  });
  dom.filterOperatorSelect.addEventListener('change', () => refreshFilterValueInput(true));
  dom.filterForm.addEventListener('submit', handleFilterFormSubmit);
  dom.filterDialog.addEventListener('close', handleFilterDialogClose);
  refreshFilterOperatorOptions(true);
  enableAccessibleMultiSelect();

  dom.orderBySelect.addEventListener('change', handleOrderByChange);
  dom.orderByDirectionButton.addEventListener('click', toggleOrderDirection);
  dom.orderByDirectionButton.textContent = state.orderBy.direction === 'asc' ? 'Asc' : 'Desc';

  dom.openExportDialogButton.addEventListener('click', renderExportDialog);
  dom.exportDialog.addEventListener('close', handleExportDialogClose);

  dom.toggleDescriptionButton.addEventListener('click', toggleDescription);
  dom.collapseSearchButton.addEventListener('click', toggleSearchPanel);
  applySearchPanelState();
  applySelectionsPanelState();
  applyFiltersPanelState();

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

  window.addEventListener('popstate', handlePopState);
  if (state.searchQuery) {
    fetchSuggestions(state.searchQuery);
  }
  if (state.selectedSuggestions.length) {
    scheduleCreativeFetch();
  }

  maybeWarnAboutCors();
}

init();
