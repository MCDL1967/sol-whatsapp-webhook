/*
File: property_loader.js
Version: v14.0.0
Date: 2026-04-30
Role: Load property package JSON files for SOL V14 Fast Path trial
Status: trial scaffold

Purpose:
- Load property-specific configuration from JSON files.
- Keep client/property data out of webhook logic.
- Return safe empty structures if the selected package cannot be loaded.
*/

'use strict';

const path = require('path');

function safeRequireJson(resolvedPath, fallback) {
  try {
    delete require.cache[require.resolve(resolvedPath)];
    return require(resolvedPath);
  } catch (err) {
    console.error(`[FAST PATH LOADER] failed path=${resolvedPath} error=${err?.message || err}`);
    return fallback;
  }
}

function loadPropertyPackage(propertyId = 'demo') {
  const packageRoot = path.join(__dirname, '..', '..', 'property_packages', propertyId);

  return {
    propertyId,
    propertyConfig: safeRequireJson(path.join(packageRoot, 'property_config.json'), {}),
    propertyMasterData: safeRequireJson(path.join(packageRoot, 'property_master_data.json'), {}),
    menuDictionary: safeRequireJson(path.join(packageRoot, 'menu_dictionary.json'), { menus: {} }),
    responseTemplates: safeRequireJson(path.join(packageRoot, 'response_templates.json'), {})
  };
}

module.exports = { loadPropertyPackage };
