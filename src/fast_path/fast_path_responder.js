function buildResponse(intent, templates, language = "en") {
  if (intent === "restaurants") {
    return language === "es"
      ? templates.restaurant_list_es
      : templates.restaurant_list_en;
  }

  return null;
}

module.exports = { buildResponse };
