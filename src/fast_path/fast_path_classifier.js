/*
File: fast_path_classifier.js
Version: v14.0.1
Date: 2026-05-07
Role: Fast Path classifier using menu_dictionary and context
Status: upgraded for restaurant continuation layer
*/

function normalize(text = "") {
  return text.toLowerCase().trim();
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

    if (listTriggers.some(t => text.includes(t))) {
      return { type: "restaurant_list" };
    }

    const lookup = menus.restaurants_menu.lookup || {};
    if (lookup[text]) {
      return {
        type: "restaurant_selection",
        key: lookup[text]
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
  }

  return null;
}

module.exports = { classifyFastPath };
