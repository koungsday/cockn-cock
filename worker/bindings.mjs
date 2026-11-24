export function verifyDatabaseBindings(clubs, databases) {
  const physical = new Map();
  for (const club of clubs) {
    const matches = databases.filter(database => database.binding === club.databaseBinding);
    if (matches.length !== 1) throw new Error(`Define one D1 binding for ${club.slug}.`);
    const [{ database_id: id, preview_database_id: previewId }] = matches;
    if (!id && clubs.length > 1) {
      throw new Error(`Set an explicit D1 database ID for ${club.slug} before building multiple clubs.`);
    }
    for (const raw of [id, previewId]) {
      if (!raw) continue;
      const key = raw.trim().toLowerCase();
      const owner = physical.get(key);
      if (owner && owner !== club.slug) throw new Error('Different clubs cannot share a D1 database ID.');
      physical.set(key, club.slug);
    }
  }
}
