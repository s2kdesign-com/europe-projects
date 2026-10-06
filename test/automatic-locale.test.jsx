import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import CountryProvider, { useCountry } from '../app/components/country/CountryProvider.jsx';
import I18nProvider, { useLanguage } from '../app/components/i18n/I18nProvider.jsx';
import { automaticDeviceLanguage } from '../app/lib/i18n/language-store.js';
import i18n from '../app/lib/i18n/config.js';

vi.mock('../app/lib/i18n/catalog.js', () => ({ ensureCatalog: async () => true }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); delete window.__I18N_INITIAL; });

it('records the automatic country independently from the manual profile country', async () => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ro-RO']);
  vi.stubGlobal('fetch', vi.fn(async path => new Response(JSON.stringify(path === '/api/geo' ? { country: 'DE' } : path === '/api/profile/country' ? { country: 'GR', mode: 'manual' } : { countries: [] }), { headers: { 'content-type': 'application/json' } })));
  let country;
  function Probe() { country = useCountry(); return null; }
  render(<CountryProvider><Probe /></CountryProvider>);
  await waitFor(() => expect(country.ready).toBe(true));
  expect(country.selectedCountry).toBe('GR');
  expect(country.countryMode).toBe('manual');
  expect(country.automaticCountry).toBe('DE');
  expect(country.automaticCountrySource).toBe('cloudflare');
  await act(async () => { await country.resetToAutomaticCountry(); });
  expect(country.selectedCountry).toBe('DE'); expect(country.countryMode).toBe('auto');
});

it('logs browser-region and fallback resolutions without changing them into manual selections', async () => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ro-RO']);
  vi.stubGlobal('fetch', vi.fn(async path => new Response(JSON.stringify(path === '/api/geo' ? { country: null } : path === '/api/profile/country' ? { mode: 'auto' } : { countries: [] }))));
  let country;
  function Probe() { country = useCountry(); return null; }
  const view = render(<CountryProvider><Probe /></CountryProvider>);
  await waitFor(() => expect(country.ready).toBe(true));
  expect(country.automaticCountry).toBe('RO'); expect(country.automaticCountrySource).toBe('browser_locale');
  view.unmount();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
  render(<CountryProvider><Probe /></CountryProvider>);
  await waitFor(() => expect(country.ready).toBe(true));
  expect(country.automaticCountry).toBe('BG'); expect(country.automaticCountrySource).toBe('fallback');
  expect(country.countryMode).toBe('auto');
});

it('keeps automatic device language separate from URL and manual language overrides', async () => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ro-RO', 'en-US']);
  localStorage.setItem('evroproekti_language', 'de'); localStorage.setItem('evroproekti_language_mode', 'manual');
  window.__I18N_INITIAL = 'el';
  let language;
  function Probe() { language = useLanguage(); return null; }
  render(<I18nProvider><Probe /></I18nProvider>);
  await waitFor(() => expect(language.lang).toBe('el'));
  expect(language.automaticLanguage).toBe('ro'); expect(language.automaticLanguageSource).toBe('browser_locale');
  await act(async () => { await language.resetToDevice(); });
  expect(language.lang).toBe('ro'); expect(language.automaticLanguage).toBe('ro');
  await act(async () => { await i18n.changeLanguage('bg'); });
});

it('records the supported fallback for an unsupported device language', () => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ja-JP']);
  expect(automaticDeviceLanguage()).toEqual({ language: 'en', source: 'fallback' });
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue([]);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('');
  expect(automaticDeviceLanguage()).toEqual({ language: 'bg', source: 'fallback' });
});
