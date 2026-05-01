/*
File: fast_path_responder.js
Version: v14.0.0
Date: 2026-04-30
Role: Fast Path responder using property data
Status: upgraded for dynamic menus
*/

function buildRestaurantList(propertyMasterData, language = "en") {
  const venues = propertyMasterData?.dining?.venues || [];

  return venues
    .filter(v => v.canonical_name !== "Room Service")
    .map((v, i) => `${i + 1}. ${v.canonical_name}`)
    .join("\n");
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

  return null;
}

module.exports = { buildResponse };
