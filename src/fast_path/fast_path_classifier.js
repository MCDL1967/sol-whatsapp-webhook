/*
File: fast_path_classifier.js
Role: Generic fast-path classifier driven entirely by the compiled
      runtime_packages.package_json menu_branches data (aliases,
      list_triggers, choice_number) instead of one hardcoded if-block per
      branch name. Replaces the old per-context classifier -- see
      docs/db_planning/SOL_DB_Master_Plan_v1.0.md section 3.

Matching behavior preserved from the old classifier:
- Exact match of the full normalized input against any alias for the
  current branch.
- Prefix match: guest text starting with an alias followed by a word
  boundary (e.g. "5 please" matching alias "5") resolves to that alias's
  option, ignoring the trailing text -- longest alias wins so a more
  specific phrase is preferred over a shorter one it contains.
- choice_number and label_en/label_es are indexed as implicit aliases too,
  same effective coverage as the old lookup maps (which already folded
  numeric/label variants into their alias lists during the KB seed).

New, not present in the old per-branch classifier: back-navigation
("__back", already seeded as real alias rows -- see
docs/db_planning/DB_Construction_Decisions_v0.1.md) is now recognized
uniformly in every branch, not just the 7 branches the old hardcoded
classifier happened to check it for.
*/

'use strict';

const { isVenueHidden, getVisibleNumberedOptions } = require('./visible_options');

// Checked universally for every branch, not sourced from menu_option_aliases,
// because 3 of 10 demo branches (main_menu, restaurants_menu,
// restaurant_followup_menu) have no seeded "__back" alias rows at all --
// confirmed live. A back-navigation primitive shouldn't depend on whether a
// given branch happens to have that data; the already-seeded __back alias
// rows on the other 7 branches become redundant but harmless.
const BACK_TRIGGER_PHRASES = ['0', 'back', 'atras', 'volver', 'menu', 'main menu', 'menu principal', 'home'];

function normalize(text = '') {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// menu_option_aliases was originally seeded with explicit numeric-variant
// rows per option ("6", "#6", "option 6", "opcion 6", "six", ...), folded in
// at KB-seed time from each option's then-current choice_number (see the
// file header). Those rows are now unreliable: they're frozen at whatever
// choice_number existed at seed time, but a hidden venue (see below) shifts
// every later option's *effective* number down. Trusting a stale "5" row
// after the true position 5 has shifted to a different option would resolve
// a guest's typed number to the wrong venue, not just a redundant one --
// worse than simply not matching. Skipped entirely; getVisibleNumberedOptions
// below is the only source of truth for numeric matching. Real guests only
// ever typed bare digits in practice (confirmed live), so losing "#6"/"six"
// phrasing is an acceptable trade for not silently mis-resolving a number.
const LEGACY_NUMERIC_ALIAS = /^(#?\d+|option \d+|opcion \d+|one|two|three|four|five|six|seven|eight|nine|ten|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)$/;

// Options linked to a venue with show_in_restaurant_list=false (e.g. a venue
// closed for remodeling) are excluded entirely -- not just from the printed
// list (see buildGenericList in fast_path_responder.js), but from every way
// a guest could reach them: number, label, or an explicit alias row. Numeric
// matching uses each option's renumbered displayNumber (from
// visible_options.js), not its raw choice_number, so a guest typing the
// number they were actually shown always resolves to the right option even
// when something ahead of it in the list is hidden. See
// docs/db_planning/SOL_DB_Master_Plan_v1.0.md section 9.
function buildAliasIndex(branch, venues) {
  const index = new Map();
  const hiddenOptionKeys = new Set(
    (branch.options || [])
      .filter((o) => isVenueHidden(venues, o.venue_id))
      .map((o) => o.option_key)
  );

  const add = (aliasText, optionKey) => {
    if (hiddenOptionKeys.has(optionKey)) return;
    const normalized = normalize(String(aliasText || ''));
    if (normalized) index.set(normalized, optionKey);
  };

  for (const option of getVisibleNumberedOptions(branch, venues)) {
    add(option.displayNumber, option.option_key);
  }
  for (const option of branch.options || []) {
    add(option.label_en, option.option_key);
    add(option.label_es, option.option_key);
  }
  for (const alias of branch.aliases || []) {
    if (LEGACY_NUMERIC_ALIAS.test(normalize(alias.alias_text))) continue;
    add(alias.alias_text, alias.option_key);
  }

  return index;
}

function matchAlias(text, aliasIndex) {
  if (aliasIndex.has(text)) {
    return aliasIndex.get(text);
  }

  const sortedAliases = [...aliasIndex.keys()].sort((a, b) => b.length - a.length);

  for (const alias of sortedAliases) {
    if (
      text.startsWith(`${alias} `) ||
      text.startsWith(`${alias},`) ||
      text.startsWith(`${alias}.`) ||
      text.startsWith(`${alias}-`) ||
      text.startsWith(`${alias}:`)
    ) {
      return aliasIndex.get(alias);
    }
  }

  return null;
}

function findOption(branch, optionKey) {
  return (branch.options || []).find((o) => o.option_key === optionKey) || null;
}

function classifyFastPath({ input = '', session = {}, menuBranches = {}, venues = [] }) {
  const text = normalize(input);
  const branchKey = session.fast_path_context || 'main_menu';
  const branch = menuBranches[branchKey];

  if (!branch || !text) return null;

  const triggers = (branch.list_triggers || []).map((t) => normalize(t.trigger_text));
  if (triggers.some((trigger) => trigger && text.includes(trigger))) {
    return { type: 'list_request', branch_key: branchKey };
  }

  if (BACK_TRIGGER_PHRASES.includes(text)) {
    return { type: 'menu_back', branch_key: branchKey };
  }

  const aliasIndex = buildAliasIndex(branch, venues);
  const optionKey = matchAlias(text, aliasIndex);

  if (!optionKey) return null;

  if (optionKey === '__back') {
    return { type: 'menu_back', branch_key: branchKey };
  }

  const option = findOption(branch, optionKey);
  if (!option) return null;

  return {
    type: 'option_selected',
    branch_key: branchKey,
    option_key: option.option_key
  };
}

module.exports = { classifyFastPath };
