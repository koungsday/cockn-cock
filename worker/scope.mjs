// Clubs live in D1 (PLATFORM.md 모임 발급). platform/clubs.mjs only names the Worker secrets that clubs from before
// the console still use: their member PINs are hashed with their own pepper, and their first organiser may still be
// in CLUB_ADMIN_ID/PIN until the first sign-in moves it (auth.mjs).
const encoder = new TextEncoder();
export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const bindingPattern = /^[A-Z][A-Z0-9_]*$/;
// Clubs made in the console derive their pepper from this secret and their id, so no new secret is needed per club.
const rootPepperBinding = 'CLUB_AUTH_PEPPER';

export function legacyIndex(clubs) {
  const bySlug = new Map();
  const bindings = new Set();
  for (const club of clubs) {
    if (typeof club.slug !== 'string' || club.slug.length > 64 || !slugPattern.test(club.slug) || bySlug.has(club.slug)) {
      throw new Error('Each registered club must have a unique slug.');
    }
    for (const key of [club.adminIdBinding, club.adminPinBinding, club.authPepperBinding]) {
      if (typeof key !== 'string' || !bindingPattern.test(key) || bindings.has(key)) {
        throw new Error('Each registered club must use distinct secret bindings.');
      }
      bindings.add(key);
    }
    bySlug.set(club.slug, club);
  }
  return bySlug;
}

const usableDb = db => Boolean(db) && typeof db.prepare === 'function' && typeof db.batch === 'function';

function fromRow(row) {
  return {
    slug: row.id, name: row.name, subtitle: row.subtitle, schedule: row.schedule,
    defaultPlace: row.default_place, status: row.status, createdAt: row.created_at
  };
}

const clubFields = 'id, name, subtitle, schedule, default_place, status, created_at';

// undefined: no usable database (503). null: no such club (404). A row without a name was never finished: 404.
export async function findClub(env, slug) {
  if (!usableDb(env.DB)) return undefined;
  const row = await env.DB.prepare(`SELECT ${clubFields} FROM clubs WHERE id = ?`).bind(slug).first();
  return row?.name ? fromRow(row) : null;
}

export async function allClubs(env) {
  const { results } = await env.DB.prepare(`SELECT ${clubFields} FROM clubs WHERE name != '' ORDER BY created_at, id`).all();
  return results.map(fromRow);
}

async function derivedPepper(root, slug) {
  if (typeof root !== 'string' || root.length < 32) return null;
  const key = await crypto.subtle.importKey('raw', encoder.encode(root), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode('club-pepper\0' + slug));
  return Array.from(new Uint8Array(mac), byte => byte.toString(16).padStart(2, '0')).join('');
}

// The env a club's API sees: the shared DB, this club's id and pepper, and (older clubs) the not-yet-moved organiser.
// null when the configuration cannot serve the club safely; the caller answers 503 instead of guessing.
export async function scopeEnv(club, legacy, env) {
  if (!usableDb(env.DB)) return null;
  const old = legacy.get(club.slug);
  const pepper = old ? env[old.authPepperBinding] : await derivedPepper(env[rootPepperBinding], club.slug);
  if (typeof pepper !== 'string' || pepper.length < 32) return null;
  if (old) {
    for (const other of legacy.values()) {
      if (other !== old && env[other.authPepperBinding] === pepper) return null;
    }
  }
  const scoped = { DB: env.DB, CLUB_SCOPE: club.slug, CLUB_AUTH_PEPPER: pepper };
  if (old) {
    scoped.CLUB_ADMIN_ID = env[old.adminIdBinding];
    scoped.CLUB_ADMIN_PIN = env[old.adminPinBinding];
  }
  return scoped;
}
