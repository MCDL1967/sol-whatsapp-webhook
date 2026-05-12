/*
File: fast_path_responder.js
Version: v14.0.1
Date: 2026-05-07
Role: Fast Path responder using property data
Status: upgraded for restaurant continuation layer
*/

function getSelectableRestaurants(propertyMasterData) {
  return (propertyMasterData?.dining?.venues || []).filter(
    v => v.canonical_name !== "Room Service"
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
    venues.find(v => String(v.menu_key || "").toLowerCase() === normalizedKey) ||
    null
  );
}

function fillTemplate(template, replacements) {
  return Object.entries(replacements).reduce((output, [key, value]) => {
    return output.replace(new RegExp(`{{${key}}}`, "g"), value ?? "");
  }, template);
}

function getVenueType(venue, language = "en") {
  if (language === "es") {
    const map = {
      "all-day café and restaurant": "café-restaurante de servicio todo el día",
      "sports bar / casual dining venue": "bar deportivo / lugar de comida casual",
      "poolside lounge and bar": "lounge y bar junto a la piscina",
      "coffee shop / grab-and-go venue": "coffee shop / opción grab-and-go",
      "lobby cocktail lounge": "bar tipo lounge en el lobby",
      "Lebanese and Mediterranean restaurant": "restaurante libanés y mediterráneo",
      "in-room dining service": "servicio de alimentos a la habitación"
    };
    return map[venue?.type] || "lugar de alimentos y bebidas";
  }

  return venue?.type || "dining venue";
}

function getReservationNoteSentence(venue, propertyMasterData, language = "en") {
  const groupThreshold =
    propertyMasterData?.dining?.reservation_facts?.advance_reservations_recommended_for_groups_over || 8;

  if (language === "es") {
    if (venue?.canonical_name === "Room Service") {
      return "Room Service se maneja como una solicitud de servicio y no como una reservación de mesa.";
    }

    if (venue?.reservation_led) {
      return `Las reservaciones para la cena son recomendadas. Los grupos mayores de ${groupThreshold} personas deben reservar con anticipación.`;
    }

    return "Los walk-ins pueden ser posibles según disponibilidad.";
  }

  if (venue?.canonical_name === "Room Service") {
    return "Room Service is handled as a service request rather than a table reservation.";
  }

  if (venue?.reservation_led) {
    return `Dinner reservations are recommended. Groups larger than ${groupThreshold} should reserve in advance.`;
  }

  return "Walk-ins may be possible based on availability.";
}

function getHoursSentence(venue, propertyMasterData, language = "en") {
  const teamName =
    propertyMasterData?.property?.team_name_1 || "Guest Services";

  const roomService24 =
    propertyMasterData?.dining?.hours_boundary?.room_service_available_24_hours;

  if (venue?.canonical_name === "Room Service" && roomService24) {
    return language === "es"
      ? "El servicio a la habitación está disponible 24 horas."
      : "Room service is available 24 hours.";
  }

  return language === "es"
    ? `Los horarios exactos de este lugar no están configurados actualmente en el runtime. Para confirmación en tiempo real o el horario de hoy, ${teamName} puede ayudarte.`
    : `Exact outlet hours for this venue are not currently configured in runtime data. For live confirmation or today's hours, ${teamName} can help.`;
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
        type: getVenueType(selectedVenue, language),
        short_description:
          language === "es"
            ? selectedVenue.short_description_es
            : selectedVenue.short_description_en,
        reservation_note_sentence: getReservationNoteSentence(
          selectedVenue,
          propertyMasterData,
          language
        ),
        hours_sentence: getHoursSentence(
          selectedVenue,
          propertyMasterData,
          language
        )
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

  return null;
}

module.exports = { buildResponse };
