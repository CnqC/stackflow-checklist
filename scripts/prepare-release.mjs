import { readFileSync, writeFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const notes = JSON.parse(readFileSync(new URL('../release-notes.json', import.meta.url), 'utf8'));
const tag = process.argv[2];

if (tag !== `v${version}`) throw new Error(`Tag ${tag} must match package version v${version}`);
if (typeof notes.title !== 'string' || !Array.isArray(notes.changes) || notes.changes.length === 0 ||
  !notes.changes.every((change) => typeof change === 'string' && change.trim())) {
  throw new Error('release-notes.json needs a title and a nonempty list of changes');
}

writeFileSync('release-body.md', `## ${notes.title}\n\n${notes.changes.map((change) => `- ${change}`).join('\n')}\n`);
