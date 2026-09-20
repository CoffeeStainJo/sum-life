import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OffError,
  barcodeVariants,
  emptyCandidate,
  fetchProductByBarcode,
  normalizeBarcode,
  parseProduct,
  scaleMacros,
  searchProducts,
} from '../lib/openFoodFacts';

const nutriments100 = { 'energy-kcal_100g': 250, proteins_100g: 10, carbohydrates_100g: 30, fat_100g: 8 };

describe('parseProduct', () => {
  it('reads per-100g macros and scales a serving from serving_quantity', () => {
    const c = parseProduct({
      code: '123',
      product_name: 'Granola',
      brands: 'Acme, Other Brand',
      serving_size: '45 g',
      serving_quantity: 45,
      nutriments: nutriments100,
    });
    expect(c).toMatchObject({
      name: 'Granola',
      brand: 'Acme',
      barcode: '123',
      per100g: { calories: 250, protein: 10, carbs: 30, fat: 8 },
      missing: [],
      source: 'openfoodfacts',
    });
    expect(c?.serving).toEqual({
      label: '45 g',
      grams: 45,
      macros: { calories: 112.5, protein: 4.5, carbs: 13.5, fat: 3.6 },
    });
  });

  it('accepts numeric strings and decimal commas', () => {
    const c = parseProduct({
      product_name: 'X',
      serving_quantity: '30',
      nutriments: { 'energy-kcal_100g': '400', proteins_100g: '7,5', carbohydrates_100g: '50', fat_100g: '20' },
    });
    expect(c?.per100g).toEqual({ calories: 400, protein: 7.5, carbs: 50, fat: 20 });
    expect(c?.serving?.label).toBe('30 g');
  });

  it('falls back to kJ when kcal is absent', () => {
    const c = parseProduct({
      product_name: 'X',
      nutriments: { energy_100g: 1046, proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 },
    });
    expect(c?.per100g.calories).toBe(250);
    expect(c?.missing).toEqual([]);
  });

  it('flags missing macros and defaults them to 0', () => {
    const c = parseProduct({ product_name: 'X', nutriments: { 'energy-kcal_100g': 100 } });
    expect(c?.per100g).toEqual({ calories: 100, protein: 0, carbs: 0, fat: 0 });
    expect(c?.missing).toEqual(['protein', 'carbs', 'fat']);
  });

  it('uses OFF per-serving figures only when they are more complete than per-100g', () => {
    const c = parseProduct({
      product_name: 'X',
      serving_quantity: 50,
      nutriments: { 'energy-kcal_serving': 90, proteins_serving: 2, carbohydrates_serving: 10, fat_serving: 3 },
    });
    expect(c?.per100g.calories).toBe(0);
    expect(c?.missing).toHaveLength(4);
    expect(c?.serving?.macros).toEqual({ calories: 90, protein: 2, carbs: 10, fat: 3 });
  });

  it('uses fallback names and returns null without any name', () => {
    expect(parseProduct({ product_name: '  ', product_name_en: 'English name' })?.name).toBe('English name');
    expect(parseProduct({ generic_name: 'Generic' })?.name).toBe('Generic');
    expect(parseProduct({ code: '1' })).toBeNull();
  });

  it('ignores non-positive serving quantities', () => {
    expect(parseProduct({ product_name: 'X', serving_quantity: 0, nutriments: nutriments100 })?.serving).toBeUndefined();
  });
});

describe('helpers', () => {
  it('normalizes barcodes and pads short ones to 13 digits', () => {
    expect(normalizeBarcode(' 0 123456-789012 ')).toBe('0123456789012');
    expect(barcodeVariants('012345678905')).toEqual(['012345678905', '0012345678905']);
    expect(barcodeVariants('5000159484695')).toEqual(['5000159484695']);
  });

  it('scales macros to one decimal', () => {
    expect(scaleMacros({ calories: 333, protein: 10, carbs: 1, fat: 0.33 }, 0.3)).toEqual({
      calories: 99.9,
      protein: 3,
      carbs: 0.3,
      fat: 0.1,
    });
  });

  it('creates a blank manual candidate on a per-100 g basis', () => {
    const c = emptyCandidate();
    expect(c.source).toBe('manual');
    expect(c.serving).toEqual({ label: '100 g', grams: 100, macros: { calories: 0, protein: 0, carbs: 0, fat: 0 } });
    expect(c.missing).toEqual([]);
  });
});

describe('network', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('retries a 12-digit UPC with a leading zero when the raw code is not found', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(404, { status: 0 }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          status: 1,
          product: { code: '0012345678905', product_name: 'Soup', nutriments: nutriments100 },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const c = await fetchProductByBarcode('012345678905');

    expect(c?.name).toBe('Soup');
    expect(c?.barcode).toBe('012345678905');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/v2/product/012345678905.json');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/api/v2/product/0012345678905.json');
  });

  it('resolves null when no variant exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, { status: 0 })));
    await expect(fetchProductByBarcode('5000159484695')).resolves.toBeNull();
  });

  it('rejects short barcodes without touching the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchProductByBarcode('1234')).rejects.toBeInstanceOf(OffError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on server errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(503, {})));
    await expect(fetchProductByBarcode('5000159484695')).rejects.toThrow(/503/);
  });

  it('searches and drops products with no nutrition data or no name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        products: [
          { product_name: 'Good', nutriments: nutriments100 },
          { product_name: 'No data' },
          { nutriments: nutriments100 },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchProducts('good');

    expect(results.map((r) => r.name)).toEqual(['Good']);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/cgi/search.pl');
    expect(url.searchParams.get('search_terms')).toBe('good');
    expect(url.searchParams.get('search_simple')).toBe('1');
    expect(url.searchParams.get('json')).toBe('1');
  });
});
