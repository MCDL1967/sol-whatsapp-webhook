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

function buildAliasIndex(branch) {
  const index = new Map();

  const add = (aliasText, optionKey) => {
    const normalized = normalize(String(aliasText || ''));
    if (normalized) index.set(normalized, optionKey);
  };

  for (const option of branch.options || []) {
    add(option.choice_number, option.option_key);
    add(option.label_en, option.option_key);
    add(option.label_es, option.option_key);
  }
  for (const alias of branch.aliases || []) {
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

function classifyFastPath({ input = '', session = {}, menuBranches = {} }) {
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

  const aliasIndex = buildAliasIndex(branch);
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
