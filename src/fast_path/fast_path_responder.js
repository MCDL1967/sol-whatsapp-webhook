/*
File: fast_path_responder.js
Version: v14.0.0
Date: 2026-05-06
Role: Fast Path responder using property data
Status: upgraded for dynamic menus
*/

function getSelectableRestaurants(propertyMasterData) {
  return (propertyMasterData?.dining?.venues || []).filter(
    v => v.canonical_name !== "Room Service"
  );
}

function buildRestaurantList(propertyMasterData, language = "en") {
  const venues = getSelectableRestaurants(propertyMasterData);

  return venues
    .map((v, i) => `${i + 1}. ${v.canonical_name}`)
    .join("\n");
}

function resolveRestaurantByKey(propertyMasterData, restaurantKey) {
  const venues = getSelectableRestaurants(propertyMasterData);

  const normalizedKey = String(restaurantKey || "").trim().toLowerCase();

  const keyMap = {
    la_brasserie: "La Brasserie",
    larrys_sports_bar_terrace: "Larry's Sports Bar & Terrace",
    acua_pool_lounge_bar: "Acua Pool Lounge & Bar",
    larrys_market: "Larry's Market",
    garden_lobby_bar: "The Garden Lobby Bar",
    fenicia: "Fenicia"
  };

  const canonicalName = keyMap[normalizedKey];
  if (!canonicalName) return null;

  return venues.find(v => v.canonical_name === canonicalName) || null;
}

function buildResponse({ result, session, propertyData }) {
  const { propertyMasterData, responseTemplates } = propertyData;
  const language = session.current_language || "en";

  if (!result) return null;

  if (result.type === "menu_selection" && result.key === "restaurants") {
    session.fast_path_context = "restaurants_menu";

    return language === "es"
      ? "Claro — puedo ayudarte con restaurantes. ¿Ya sabes dónde quieres ir? Puedes decir el nombre del restaurante o escribir LISTA para ver todas las opciones."
      : "Sure — I can help with dining. Do you already know where you'd like to go? You can say the restaurant name or type LIST to see all options.";
  }

  if (result.type === "restaurant_list") {
    const list = buildRestaurantList(propertyMasterData, language);

    const template = language === "es"
      ? responseTemplates.restaurant_list_es
      : responseTemplates.restaurant_list_en;

    return template.replace("{{list}}", list);
  }

  if (result.type === "restaurant_selection") {
    const selectedVenue = resolveRestaurantByKey(propertyMasterData, result.key);

    if (!selectedVenue) {
      return language === "es"
        ? responseTemplates.restaurant_selection_invalid_es
        : responseTemplates.restaurant_selection_invalid_en;
    }

    session.selected_restaurant = selectedVenue.canonical_name;

    const template = language === "es"
      ? responseTemplates.restaurant_selection_confirm_es
      : responseTemplates.restaurant_selection_confirm_en;

    return template.replace("{{restaurant_name}}", selectedVenue.canonical_name);
  }

  return null;
}

module.exports = { buildResponse };
