/*
File: fast_path_classifier.js
Version: v14.0.5
Date: 2026-05-18
Role: Fast Path classifier using menu_dictionary and context
Status: additive loyalty Program-information submenu for V14 mid-track

This version changes (v14.0.5, additive only):
- preserves all v14.0.4 main-menu, restaurants_menu, restaurant_followup_menu,
  loyalty_rewards_menu, and cross-context textual fallback handling exactly
- adds a new sub-context handler for `loyalty_program_info_menu` covering the
  three KB-grounded sub-options: Club Card overview, Enrollment, Tier levels
- accepts numeric (1/2/3), leading-digit, and word-form replies in EN and ES
- returns a new result type `loyalty_program_info_selection` that webhook.js
  maps to KB-grounded templates without invoking the responder
- does NOT redesign the menu tree
- does NOT change restaurant deterministic selection, follow-up submenu, or
  reservation carry-forward
- the sub-context lookup is intentionally local to the classifier to keep
  menu_dictionary.json untouched (minimum patch surface)

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

  // v14.0.5 additive: Loyalty Program-information submenu.
  // Triggered when webhook.js has placed the session in the
  // `loyalty_program_info_menu` context after the guest selected
  // "Program information" from the Loyalty top-level menu. The submenu is
  // intentionally local to the classifier so menu_dictionary.json is not
  // modified for this minimum-surface patch. Sub-options are KB-backed:
  //   1. Club Card overview
  //   2. Enrollment
  //   3. Tier levels
  if (context === "loyalty_program_info_menu") {
    const submenuLookup = {
      // numeric
      "1": "club_card",
      "2": "enrollment",
      "3": "tier_levels",
      // Club Card overview — EN / ES
      "club card": "club_card",
      "club card overview": "club_card",
      "overview": "club_card",
      "your casino club card": "club_card",
      "card": "club_card",
      "loyalty card": "club_card",
      "tarjeta": "club_card",
      "tarjeta del club": "club_card",
      "tarjeta de club": "club_card",
      "resumen": "club_card",
      "resumen del club": "club_card",
      // Enrollment — EN / ES
      "enroll": "enrollment",
      "enrollment": "enrollment",
      "sign up": "enrollment",
      "signup": "enrollment",
      "register": "enrollment",
      "join": "enrollment",
      "how to enroll": "enrollment",
      "inscripcion": "enrollment",
      "inscripción": "enrollment",
      "inscribirse": "enrollment",
      "registrarse": "enrollment",
      "registro": "enrollment",
      // Tier levels — EN / ES
      "tier": "tier_levels",
      "tiers": "tier_levels",
      "tier levels": "tier_levels",
      "levels": "tier_levels",
      "tier benefits": "tier_levels",
      "silver": "tier_levels",
      "gold": "tier_levels",
      "black": "tier_levels",
      "diamond": "tier_levels",
      "niveles": "tier_levels",
      "nivel": "tier_levels",
      "niveles del programa": "tier_levels"
    };

    if (submenuLookup[text]) {
      return {
        type: "loyalty_program_info_selection",
        key: submenuLookup[text]
      };
    }

    const submenuChoiceAliases = {
      "1": ["1", "#1", "one", "uno", "option 1", "opcion 1", "opción 1"],
      "2": ["2", "#2", "two", "dos", "option 2", "opcion 2", "opción 2"],
      "3": ["3", "#3", "three", "tres", "option 3", "opcion 3", "opción 3"]
    };
    const submenuLeading = extractLeadingChoice(text, submenuChoiceAliases);
    if (submenuLeading?.choice && submenuLookup[submenuLeading.choice]) {
      return {
        type: "loyalty_program_info_selection",
        key: submenuLookup[submenuLeading.choice],
        trailing_text: submenuLeading.remainder || null
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
