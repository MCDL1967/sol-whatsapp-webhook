/*
File: fast_path_classifier.js
Version: v14.0.4
Date: 2026-05-12
Role: Fast Path classifier using menu_dictionary and context
Status: additive cross-context loyalty re-entry guard for V14 mid-track

This version changes (v14.0.4, additive only):
- preserves all v14.0.3 main-menu, restaurants_menu, restaurant_followup_menu,
  and loyalty_rewards_menu handling exactly
- adds a final cross-context fallback that re-routes textual top-level keywords
  (e.g. "loyalty", "loyalty and points", "rewards", "points", "club card") into
  the approved main-menu branch when the guest is currently in a sub-context
- bare numeric digits are intentionally excluded from the fallback so existing
  numbered sub-menu choices (restaurants, restaurant follow-up, loyalty submenu)
  continue to behave deterministically
- does not invent new loyalty sub-branches
- does not change restaurant deterministic selection, follow-up submenu, or
  reservation carry-forward
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

  if (context === "loyalty_rewards_menu" && menus.loyalty_rewards_menu) {
    const lookup = menus.loyalty_rewards_menu.lookup || {};
    if (lookup[text]) {
      return {
        type: "loyalty_selection",
        key: lookup[text]
      };
    }

    const choiceAliases = menus.loyalty_rewards_menu.choice_aliases || {};
    const leadingChoice = extractLeadingChoice(text, choiceAliases);

    if (leadingChoice?.choice && lookup[leadingChoice.choice]) {
      return {
        type: "loyalty_selection",
        key: lookup[leadingChoice.choice],
        trailing_text: leadingChoice.remainder || null
      };
    }
  }

  // v14.0.4 additive: cross-context textual top-level fallback.
  // When the guest types an explicit textual main-menu keyword (e.g. "loyalty",
  // "loyalty and points", "rewards", "club card") from inside a sub-context such
  // as restaurants_menu, restaurant_followup_menu, or loyalty_rewards_menu, the
  // classifier re-routes them into the approved main-menu branch so the deeper
  // sub-menus do not silently fall through to the LLM fallback (which has been
  // observed to drift Loyalty into non-approved submenu wording).
  //
  // Bare numeric digits are excluded so that existing in-context numbered
  // selections (1–7 for restaurants, 1–3 for restaurant follow-up, 1–3 for
  // loyalty) continue to take precedence and the restaurant flow is preserved.
  if (context !== "main_menu" && menus.main_menu) {
    const lookup = menus.main_menu.lookup || {};
    const isBareDigit = /^\d+$/.test(text);
    if (!isBareDigit && text && lookup[text]) {
      return {
        type: "menu_selection",
        key: lookup[text],
        next_context: menus.main_menu.options[lookup[text]]?.next_context || null
      };
    }
  }

  return null;
}

module.exports = { classifyFastPath };
