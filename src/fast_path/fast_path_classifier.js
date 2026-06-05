/*
File: fast_path_classifier.js
Version: v14.0.7
Date: 2026-06-05
Role: Fast Path classifier using menu_dictionary and context
Status: additive loyalty Program-information submenu for V14 mid-track

This version changes (v14.0.7, additive only):
- fixes Issue A: active restaurant reservation detail turns such as
  "2 personas, manana 6pm" were being misread as follow-up submenu option 2
  (`new_reservation`) instead of continuing reservation extraction
- adds a narrow restaurant_followup_menu guard for active restaurant reservation
  continuations that include usable reservation details
- requires active_request.type="reservation" and selected_restaurant carry-forward
  before bypassing deterministic follow-up submenu handling
- returns null so existing reservation continuation / extraction ownership can
  process partial details without forcing a new submenu selection
- preserves pure restaurant follow-up submenu selections and does not change
  webhook.js, responder, templates, loader, voice integration, or menu structure

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

function hasRestaurantReservationDetailSignal(text = "") {
  const normalized = normalize(text);
  if (!normalized) return false;

  return [
    /\b\d{1,2}\s*(?:am|pm)\b/,
    /\b\d{1,2}:\d{2}\b/,
    /\b(?:today|tomorrow|tonight|hoy|manana|mañana|esta noche)\b/,
    /\b(?:monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|sunday|sun)\b/,
    /\b(?:lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\b/,
    /\b(?:party of|table for|for|para)\s+\d{1,2}\b/,
    /\b\d{1,2}\s+(?:guests?|people|persons?|personas?|huespedes|huéspedes|pax)\b/,
    /\b(?:somos|seremos)\s+\d{1,2}\b/
  ].some((pattern) => pattern.test(normalized));
}

function isActiveRestaurantReservationContinuation(session = {}) {
  return (
    session.active_request?.type === "reservation" &&
    !!session.selected_restaurant
  );
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
    if (
      isActiveRestaurantReservationContinuation(session) &&
      hasRestaurantReservationDetailSignal(text)
    ) {
      return null;
    }

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
    if (lookup[text] === "__back") {
      return { type: "menu_back" };
    }
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

  if (context === "loyalty_program_info_menu" && menus.loyalty_program_info_menu) {
    const lookup = menus.loyalty_program_info_menu.lookup || {};
    let resolvedKey = lookup[text] || null;

    if (!resolvedKey) {
      const choiceAliases = menus.loyalty_program_info_menu.choice_aliases || {};
      const leadingChoice = extractLeadingChoice(text, choiceAliases);
      if (leadingChoice?.choice && lookup[leadingChoice.choice]) {
        resolvedKey = lookup[leadingChoice.choice];
      }
    }

    if (resolvedKey === "__back") {
      return { type: "menu_back" };
    }
    if (resolvedKey) {
      return { type: "loyalty_program_selection", key: resolvedKey };
    }
  }

  if (context === "loyalty_points_rewards_menu" && menus.loyalty_points_rewards_menu) {
    const lookup = menus.loyalty_points_rewards_menu.lookup || {};
    let resolvedKey = lookup[text] || null;

    if (!resolvedKey) {
      const choiceAliases = menus.loyalty_points_rewards_menu.choice_aliases || {};
      const leadingChoice = extractLeadingChoice(text, choiceAliases);
      if (leadingChoice?.choice && lookup[leadingChoice.choice]) {
        resolvedKey = lookup[leadingChoice.choice];
      }
    }

    if (resolvedKey === "__back") {
      return { type: "menu_back" };
    }
    if (resolvedKey) {
      return { type: "loyalty_points_selection", key: resolvedKey };
    }
  }

  if (context === "shows_events_menu" && menus.shows_events_menu) {
    const lookup = menus.shows_events_menu.lookup || {};
    let resolvedKey = lookup[text] || null;

    if (!resolvedKey) {
      const choiceAliases = menus.shows_events_menu.choice_aliases || {};
      const leadingChoice = extractLeadingChoice(text, choiceAliases);
      if (leadingChoice?.choice && lookup[leadingChoice.choice]) {
        resolvedKey = lookup[leadingChoice.choice];
      }
    }

    if (resolvedKey === "__back") {
      return { type: "menu_back" };
    }
    if (resolvedKey) {
      return { type: "shows_selection", key: resolvedKey };
    }
  }

  if (context === "casino_gaming_menu" && menus.casino_gaming_menu) {
    const lookup = menus.casino_gaming_menu.lookup || {};
    let resolvedKey = lookup[text] || null;

    if (!resolvedKey) {
      const choiceAliases = menus.casino_gaming_menu.choice_aliases || {};
      const leadingChoice = extractLeadingChoice(text, choiceAliases);
      if (leadingChoice?.choice && lookup[leadingChoice.choice]) {
        resolvedKey = lookup[leadingChoice.choice];
      }
    }

    if (resolvedKey === "__back") {
      return { type: "menu_back" };
    }
    if (resolvedKey) {
      return { type: "gaming_selection", key: resolvedKey };
    }
  }

  if (context === "general_information_menu" && menus.general_information_menu) {
    const lookup = menus.general_information_menu.lookup || {};
    let resolvedKey = lookup[text] || null;

    if (!resolvedKey) {
      const choiceAliases = menus.general_information_menu.choice_aliases || {};
      const leadingChoice = extractLeadingChoice(text, choiceAliases);
      if (leadingChoice?.choice && lookup[leadingChoice.choice]) {
        resolvedKey = lookup[leadingChoice.choice];
      }
    }

    if (resolvedKey === "__back") {
      return { type: "menu_back" };
    }
    if (resolvedKey) {
      return { type: "general_info_selection", key: resolvedKey };
    }
  }

  if (context === "complaints_menu" && menus.complaints_menu) {
    const lookup = menus.complaints_menu.lookup || {};
    let resolvedKey = lookup[text] || null;

    if (!resolvedKey) {
      const choiceAliases = menus.complaints_menu.choice_aliases || {};
      const leadingChoice = extractLeadingChoice(text, choiceAliases);
      if (leadingChoice?.choice && lookup[leadingChoice.choice]) {
        resolvedKey = lookup[leadingChoice.choice];
      }
    }

    if (resolvedKey === "__back") {
      return { type: "menu_back" };
    }
    if (resolvedKey) {
      return { type: "complaints_selection", key: resolvedKey };
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
