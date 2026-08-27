import { badRequest } from './http.js';

export function str(value, field, { max = 500, min = 0, required = true } = {}) {
  const s = value === undefined || value === null ? '' : String(value).trim();
  if (!s && required) throw badRequest(`${field} is required`, { field });
  if (s.length < min) throw badRequest(`${field} is too short`, { field });
  if (s.length > max) throw badRequest(`${field} is too long (max ${max})`, { field });
  return s;
}

export function email(value, field = 'email', { required = true } = {}) {
  const s = str(value, field, { max: 254, required });
  if (!s && !required) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) {
    throw badRequest(`${field} is not a valid email address`, { field });
  }
  return s.toLowerCase();
}

export function int(value, field, { min = -Infinity, max = Infinity, fallback } = {}) {
  if ((value === undefined || value === '' || value === null) && fallback !== undefined) {
    return fallback;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw badRequest(`${field} must be a whole number`, { field });
  }
  if (n < min || n > max) throw badRequest(`${field} must be between ${min} and ${max}`, { field });
  return n;
}

export function rate(value, field, { fallback } = {}) {
  if ((value === undefined || value === '' || value === null) && fallback !== undefined) {
    return fallback;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw badRequest(`${field} must be a fraction between 0 and 1`, { field });
  }
  return n;
}

export function oneOf(value, field, allowed, fallback) {
  const s = value === undefined || value === null ? '' : String(value);
  if (!s && fallback !== undefined) return fallback;
  if (!allowed.includes(s)) {
    throw badRequest(`${field} must be one of: ${allowed.join(', ')}`, { field });
  }
  return s;
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Accepts a JSON array or a newline/comma separated list; returns clean hostnames. */
export function hostList(value) {
  let items = [];
  if (Array.isArray(value)) items = value;
  else if (typeof value === 'string') items = value.split(/[\n,]+/);
  return [
    ...new Set(
      items
        .map((raw) => {
          let s = String(raw).trim().toLowerCase();
          if (!s) return '';
          s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
          return /^[a-z0-9.*-]+\.[a-z]{2,}$|^localhost$/.test(s) ? s : '';
        })
        .filter(Boolean)
    ),
  ];
}

/** Domains may be registered as `*.example.com` to cover subdomains. */
export function hostMatches(host, patterns) {
  if (!host) return false;
  return patterns.some((pattern) => {
    if (pattern === host) return true;
    if (pattern.startsWith('*.')) {
      const base = pattern.slice(2);
      return host === base || host.endsWith(`.${base}`);
    }
    return false;
  });
}

export function jsonArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}
