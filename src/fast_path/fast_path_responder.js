/*
File: fast_path_classifier.js
Version: v14.0.1
Date: 2026-05-11
Role: Fast Path classifier using menu_dictionary and context
Status: upgraded for restaurant continuation fixes with menu-driven choice aliases

This version changes:
- preserves current main-menu and restaurant-list deterministic handling
- adds menu-driven normalized choice parsing through `choice_aliases`
- keeps parsing reusable for future branch-by-branch menu-tree population
- supports mixed deterministic selection input such as `2, ...`, `#2`, `two`, `dos`, `option 2`, `opción 2`
- adds restaurant follow-up submenu classification without changing broader architecture
*/

function normalize(text = "") {
  return text.toLowerCase().trim();
}

function buildAliasToChoiceMap(choiceAliases = {}) {
  const aliasMap = {};

  for (const [choice, aliases] of Object.entries(choiceAliases)) {
    aliasMap[normalize(choice)] = choice;

    for (const alias of aliases || []) {
      aliasMap[normalize(alias)] = choice;
    }
  }

  return aliasMap;
}

function extractLeadingChoice(text = "", choiceAliases = {}) {
  const normalized = normalize(text);
  if (!normalized) return null;

  const aliasMap = buildAliasToChoiceMap(choiceAliases);

  const directMatch = aliasMap[normalized];
  if (directMatch) {
    return {
      choice: directMatch,
      remainder: ""
    };
  }

  const punctuationLeadingMatch = normalized.match(/^#?\d+\b/);
  if (punctuationLeadingMatch) {
    const token = punctuationLeadingMatch[0].replace(/^#/, "");
    const mappedChoice = aliasMap[token] || token;
    const remainder = normalized
      .slice(punctuationLeadingMatch[0].length)
      .replace(/^[\s,.)\-:]+/, "")
      .trim();

    return {
      choice: mappedChoice,
      remainder
    };
  }

  const sortedAliases = Object.keys(aliasMap).sort((a, b) => b.length - a.length);

  for (const alias of sortedAliases) {
    if (!alias) continue;

    if (normalized === alias) {
      return {
        choice: aliasMap[alias],
        remainder: ""
      };
    }

    if (
      normalized.startsWith(`${alias} `) ||
      normalized.startsWith(`${alias},`) ||
      normalized.startsWith(`${alias}.`) ||
      normalized.startsWith(`${alias}-`) ||
      normalized.startsWith(`${alias}:`)
    ) {
      const remainder = normalized
        .slice(alias.length)
        .replace(/^[\s,.)\-:]+/, "")
        .trim();

      return {
        choice: aliasMap[alias],
        remainder
      };
    }
  }

  return null;
}

function classifyFastPath({ input = "", session = {}, menuDictionary = {} }) {
  const text = normalize(input);
  const menus = menuDictionary.menus || {};
  const context = session.fast_path_context || "main_menu";

  if (context === "main_menu" && menus.main_menu) {
    const lookup = menus.main_menu.lookup || {};
    if (lookup[text]) {
      return {
        type: "menu_selection",
        key: lookup[text],
        next_context: menus.main_menu.options[lookup[text]]?.next_context || null
      };
    }
  }

  if (context === "restaurants_menu" && menus.restaurants_menu) {
    const triggers = menus.restaurants_menu.list_triggers || {};
    const listTriggers = [...(triggers.en || []), ...(triggers.es || [])];

    if (listTriggers.some((t) => text.includes(normalize(t)))) {
      return { type: "restaurant_list" };
    }

    const lookup = menus.restaurants_menu.lookup || {};
    if (lookup[text]) {
      return {
        type: "restaurant_selection",
        key: lookup[text]
      };
    }

    const choiceAliases = menus.restaurants_menu.choice_aliases || {};
    const leadingChoice = extractLeadingChoice(text, choiceAliases);

    if (leadingChoice?.choice && lookup[leadingChoice.choice]) {
      return {
        type: "restaurant_selection",
        key: lookup[leadingChoice.choice],
        trailing_text: leadingChoice.remainder || null
      };
    }
  }

  if (context === "restaurant_followup_menu" && menus.restaurant_followup_menu) {
    const lookup = menus.restaurant_followup_menu.lookup || {};
    if (lookup[text]) {
      return {
        type: "restaurant_followup_selection",
        key: lookup[text]
      };
    }

    const choiceAliases = menus.restaurant_followup_menu.choice_aliases || {};
    const leadingChoice = extractLeadingChoice(text, choiceAliases);

    if (leadingChoice?.choice && lookup[leadingChoice.choice]) {
      return {
        type: "restaurant_followup_selection",
        key: lookup[leadingChoice.choice],
        trailing_text: leadingChoice.remainder || null
      };
    }
  }

  return null;
}

module.exports = { classifyFastPath };
