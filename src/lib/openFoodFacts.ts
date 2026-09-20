export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type MacroKey = keyof Macros;
export const MACRO_KEYS: readonly MacroKey[] = ['calories', 'protein', 'carbs', 'fat'];
export const ZERO_MACROS: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export interface ServingInfo {
  /** Label shown to the user, e.g. "30 g" or "1 bar (30 g)". */
  label: string;
  grams?: number;
  macros: Macros;
}

/**
 * A food as returned by search / barcode lookup, before the user has confirmed
 * which basis (per serving or per 100 g) they want to log it under.
 */
export interface FoodCandidate {
  name: string;
  brand?: string;
  barcode?: string;
  per100g: Macros;
  serving?: ServingInfo;
  /** Macros the source had no data for (they default to 0 and the UI flags them). */
  missing: MacroKey[];
  source: 'openfoodfacts' | 'manual';
}

export type Basis = 'serving' | '100g';

export const OFF_BASE_URL = 'https://world.openfoodfacts.org';

const FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'generic_name',
  'brands',
  'serving_size',
  'serving_quantity',
  'nutriments',
].join(',');

/** The parts of an Open Food Facts product document we read. */
export interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, unknown>;
}

export class OffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OffError';
  }
}

const KJ_PER_KCAL = 4.184;

function num(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number.parseFloat(value.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

function readMacros(
  n: Record<string, unknown>,
  suffix: '100g' | 'serving',
): { macros: Macros; missing: MacroKey[] } {
  // OFF publishes kcal directly when known; otherwise the energy_* fields are in kJ.
  let kcal = num(n[`energy-kcal_${suffix}`]);
  if (kcal === undefined) {
    const kj = num(n[`energy-kj_${suffix}`]) ?? num(n[`energy_${suffix}`]);
    if (kj !== undefined) kcal = kj / KJ_PER_KCAL;
  }
  const protein = num(n[`proteins_${suffix}`]);
  const carbs = num(n[`carbohydrates_${suffix}`]);
  const fat = num(n[`fat_${suffix}`]);

  const missing: MacroKey[] = [];
  if (kcal === undefined) missing.push('calories');
  if (protein === undefined) missing.push('protein');
  if (carbs === undefined) missing.push('carbs');
  if (fat === undefined) missing.push('fat');

  return {
    macros: {
      calories: round1(Math.max(0, kcal ?? 0)),
      protein: round1(Math.max(0, protein ?? 0)),
      carbs: round1(Math.max(0, carbs ?? 0)),
      fat: round1(Math.max(0, fat ?? 0)),
    },
    missing,
  };
}

export function scaleMacros(m: Macros, factor: number): Macros {
  return {
    calories: round1(m.calories * factor),
    protein: round1(m.protein * factor),
    carbs: round1(m.carbs * factor),
    fat: round1(m.fat * factor),
  };
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const v of values) {
    const t = v?.trim();
    if (t) return t;
  }
  return undefined;
}

function formatGrams(g: number): string {
  return Number.isInteger(g) ? String(g) : String(Math.round(g * 10) / 10);
}

/** Convert an OFF product document into a FoodCandidate. Returns null when there is no usable name. */
export function parseProduct(p: OffProduct): FoodCandidate | null {
  const name = firstNonEmpty(p.product_name, p.product_name_en, p.generic_name);
  if (!name) return null;

  const n = p.nutriments ?? {};
  const per100 = readMacros(n, '100g');
  const brand = firstNonEmpty(p.brands?.split(',')[0]);

  let serving: ServingInfo | undefined;
  const grams = num(p.serving_quantity);
  if (grams !== undefined && grams > 0) {
    const direct = readMacros(n, 'serving');
    const scaled = scaleMacros(per100.macros, grams / 100);
    // Prefer scaling from the per-100g figures (consistent with what the user sees),
    // unless OFF's own per-serving figures are more complete.
    const macros = direct.missing.length < per100.missing.length ? direct.macros : scaled;
    serving = {
      label: firstNonEmpty(p.serving_size) ?? `${formatGrams(grams)} g`,
      grams,
      macros,
    };
  }

  const candidate: FoodCandidate = {
    name,
    per100g: per100.macros,
    missing: per100.missing,
    source: 'openfoodfacts',
  };
  if (brand) candidate.brand = brand;
  const code = firstNonEmpty(p.code);
  if (code) candidate.barcode = code;
  if (serving) candidate.serving = serving;
  return candidate;
}

/** Blank candidate for the manual-entry form. Defaults to per-100 g figures so weighed food is quick to log. */
export function emptyCandidate(): FoodCandidate {
  return {
    name: '',
    per100g: { ...ZERO_MACROS },
    serving: { label: '100 g', grams: 100, macros: { ...ZERO_MACROS } },
    missing: [],
    source: 'manual',
  };
}

export function normalizeBarcode(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** OFF stores some UPC-A / EAN-8 codes zero-padded to 13 digits, so try both spellings. */
export function barcodeVariants(code: string): string[] {
  const variants = [code];
  if (code.length < 13) variants.push(code.padStart(13, '0'));
  return [...new Set(variants)];
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new OffError(`Open Food Facts responded with HTTP ${res.status}.`);
  return (await res.json()) as T;
}

interface ProductResponse {
  status?: number;
  product?: OffProduct;
}

/** Look a barcode up. Resolves to null when OFF has no such product. */
export async function fetchProductByBarcode(raw: string, signal?: AbortSignal): Promise<FoodCandidate | null> {
  const code = normalizeBarcode(raw);
  if (code.length < 8) throw new OffError('A barcode needs at least 8 digits.');

  for (const variant of barcodeVariants(code)) {
    const url = `${OFF_BASE_URL}/api/v2/product/${variant}.json?fields=${FIELDS}`;
    const data = await getJson<ProductResponse>(url, signal);
    if (data?.status === 1 && data.product) {
      const candidate = parseProduct(data.product);
      if (candidate) return { ...candidate, barcode: code };
    }
  }
  return null;
}

interface SearchResponse {
  products?: OffProduct[];
}

/** Free-text search. Products with no nutrition data at all are dropped. */
export async function searchProducts(query: string, signal?: AbortSignal): Promise<FoodCandidate[]> {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '20',
    fields: FIELDS,
  });
  const data = await getJson<SearchResponse>(`${OFF_BASE_URL}/cgi/search.pl?${params.toString()}`, signal);
  return (data?.products ?? [])
    .map(parseProduct)
    .filter((c): c is FoodCandidate => c !== null && c.missing.length < MACRO_KEYS.length);
}
