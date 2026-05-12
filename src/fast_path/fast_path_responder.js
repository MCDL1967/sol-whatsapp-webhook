/*
File: fast_path_responder.js
Version: v14.0.3
Date: 2026-05-11
Role: Fast Path responder using property data
Status: upgraded for restaurant continuation layer and loyalty branch population

This version changes:
- preserves dynamic restaurant list rendering from property data
- preserves selected restaurant in session for downstream continuity
- preserves restaurant follow-up submenu handling
- aligns top-level entry to the approved 6-branch menu tree
- adds loyalty branch handling at the approved next useful tree level
- keeps response logic branch-local and additive so future KB population can continue branch by branch
- loyalty responses remain limited to KB-safe general guidance and escalation boundaries
*/

function getSelectableRestaurants(propertyMasterData) {
  return (propertyMasterData?.dining?.venues || []).filter(
    (v) => v.canonical_name !== "Room Service"
  );
}

function getRestaurantPresentation(language = "en") {
  return {
    en: {
      numberEmojis: ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣"],
      venueCopy: {
        "La Brasserie": "All-day café serving breakfast, lunch, and dinner 🍽️",
        "Larry's Sports Bar & Terrace": "Casual sports bar with large screens 🍻",
        "Acua Pool Lounge & Bar": "Poolside lounge for cocktails and light bites 🏝️",
        "Larry's Market": "Coffee shop / grab-and-go sandwiches and salads ☕",
        "The Garden Lobby Bar": "Relaxed lobby cocktail lounge 🍸",
        "Fenicia": "Lebanese / Mediterranean restaurant with lounge and terrace 🥙"
      }
    },
    es: {
      numberEmojis: ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣"],
      venueCopy: {
        "La Brasserie": "Café-restaurante todo el día (desayuno, almuerzo y cena) 🍽️",
        "Larry's Sports Bar & Terrace": "Bar deportivo con pantallas y comida casual 🏈",
        "Acua Pool Lounge & Bar": "Lounge junto a la piscina, cocteles y bocados ligeros 🏝️",
        "Larry's Market": "Coffee shop y opción grab-and-go (sándwiches, ensaladas, café) ☕",
        "The Garden Lobby Bar": "Bar de lobby relajado para bebidas y socializar 🍸",
        "Fenicia": "Restaurante de cocina libanesa / mediterránea con terraza 🌿"
      }
    }
  }[language] || {
    numberEmojis: ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣"],
    venueCopy: {}
  };
}

function buildRestaurantList(propertyMasterData, language = "en") {
  const venues = getSelectableRestaurants(propertyMasterData);
  const presentation = getRestaurantPresentation(language);

  return venues
    .map((v, i) => {
      const numberLabel = presentation.numberEmojis[i] || `${i + 1}.`;
      const description = presentation.venueCopy[v.canonical_name] || "";
      return description
        ? `${numberLabel} ${v.canonical_name} — ${description}`
        : `${numberLabel} ${v.canonical_name}`;
    })
    .join("\n");
}

function resolveRestaurantByKey(propertyMasterData, restaurantKey) {
  const venues = propertyMasterData?.dining?.venues || [];
  const normalizedKey = String(restaurantKey || "").trim().toLowerCase();

  return (
    venues.find((v) => String(v.menu_key || "").toLowerCase() === normalizedKey) ||
    null
  );
}

function fillTemplate(template, replacements) {
  return Object.entries(replacements).reduce((output, [key, value]) => {
    return output.replace(new RegExp(`{{${key}}}`, "g"), value ?? "");
  }, template);
}

function buildResponse({ result, session, propertyData }) {
  const { propertyMasterData, responseTemplates } = propertyData;
  const language = session.current_language || "en";

  if (!result) return null;

  if (result.type === "menu_selection" && result.key === "restaurants") {
    session.fast_path_context = "restaurants_menu";

    return language === "es"
      ? responseTemplates.restaurant_intro_es
      : responseTemplates.restaurant_intro_en;
  }

  if (result.type === "menu_selection" && result.key === "loyalty_rewards") {
    session.fast_path_context = "loyalty_rewards_menu";

    return language === "es"
      ? responseTemplates.loyalty_intro_es
      : responseTemplates.loyalty_intro_en;
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
    session.selected_restaurant_key = selectedVenue.menu_key;
    session.fast_path_context = "restaurant_followup_menu";

    const template = language === "es"
      ? responseTemplates.restaurant_selection_confirm_es
      : responseTemplates.restaurant_selection_confirm_en;

    return template.replace("{{restaurant_name}}", selectedVenue.canonical_name);
  }

  if (result.type === "restaurant_followup_selection") {
    const selectedVenue = resolveRestaurantByKey(
      propertyMasterData,
      session.selected_restaurant_key
    );

    if (!selectedVenue) {
      session.fast_path_context = "restaurants_menu";

      return language === "es"
        ? responseTemplates.restaurant_selection_invalid_es
        : responseTemplates.restaurant_selection_invalid_en;
    }

    if (result.key === "venue_info") {
      const template = language === "es"
        ? responseTemplates.restaurant_venue_info_es
        : responseTemplates.restaurant_venue_info_en;

      return fillTemplate(template, {
        restaurant_name: selectedVenue.canonical_name,
        short_description:
          language === "es"
            ? selectedVenue.short_description_es
            : selectedVenue.short_description_en
      });
    }

    if (result.key === "new_reservation") {
      const template = language === "es"
        ? responseTemplates.restaurant_new_reservation_prompt_es
        : responseTemplates.restaurant_new_reservation_prompt_en;

      return template.replace("{{restaurant_name}}", selectedVenue.canonical_name);
    }

    if (result.key === "existing_change_vip_group") {
      return language === "es"
        ? responseTemplates.restaurant_escalation_existing_change_vip_group_es
        : responseTemplates.restaurant_escalation_existing_change_vip_group_en;
    }
  }

  if (result.type === "loyalty_selection") {
    if (result.key === "program_info") {
      return language === "es"
        ? responseTemplates.loyalty_program_info_es
        : responseTemplates.loyalty_program_info_en;
    }

    if (result.key === "rewards_points_info") {
      return language === "es"
        ? responseTemplates.loyalty_rewards_points_info_es
        : responseTemplates.loyalty_rewards_points_info_en;
    }

    if (result.key === "account_specific_issue") {
      return language === "es"
        ? responseTemplates.loyalty_account_issue_es
        : responseTemplates.loyalty_account_issue_en;
    }
  }

  return null;
}

module.exports = { buildResponse };
