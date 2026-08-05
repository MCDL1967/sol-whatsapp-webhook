/*
File: fast_path_responder.js
Role: Generic fast-path responder driven by the compiled runtime_packages
      data instead of one hardcoded if-block per branch/option. Replaces
      the old per-context responder -- see
      docs/db_planning/SOL_DB_Master_Plan_v1.0.md section 3.

Key generalizations from the old responder:
- Any option with venue_id set (menu_options.venue_id, added alongside this
  rewrite) shares one property-wide "you selected this venue" template with
  {{restaurant_name}}/{{short_description}} filled in from the real venues
  data -- replaces the old restaurants_menu-specific handling, so a tenant's
  Menu Tree edits to that branch actually take effect for guests.
- No-match and "no reply resolvable" fall back to one generic bilingual
  message rather than the old per-branch stayMap (which only covered 7 of
  10 branches).
- "__back" (already real alias data -- see
  docs/db_planning/DB_Construction_Decisions_v0.1.md) now navigates to the
  actual parent branch via parent_branch_key, re-showing whatever reply
  would normally introduce that branch, instead of always jumping to
  main_menu.

Known gap, not solved here: a tenant-created option with no template_key
(Menu Tree only lets tenants set structure/labels, not leaf wording -- see
the Menu Tree section of the master plan) returns null and falls through to
the normal Voiceflow path, same as any other no-match. Not a crash, but a
real product gap once Response Templates editing doesn't exist yet either.
*/

'use strict';

const GENERIC_FALLBACK_TEMPLATE = {
  en: 'Sorry, I didn\'t catch that — please choose a number from the list, or type "menu" to start over.',
  es: 'Disculpa, no entendí eso — por favor elige un número de la lista, o escribe "menú" para comenzar de nuevo.'
};

const GENERIC_LIST_INTRO = {
  en: "Here's the full list:",
  es: 'Aquí está la lista completa:'
};

// Every option that represents "the guest picked this venue" shares one
// property-wide confirm template rather than needing its own per-option
// template_key -- see the venue-linkage decision in
// docs/db_planning/SOL_DB_Master_Plan_v1.0.md section 3.
const VENUE_SELECTED_TEMPLATE_KEY = 'restaurant_selection_confirm';
const MAIN_MENU_TEMPLATE_KEY = 'main_menu_prompt';

function fillTemplate(template, replacements) {
  return Object.entries(replacements).reduce(
    (output, [key, value]) => output.replace(new RegExp(`{{${key}}}`, 'g'), value ?? ''),
    template || ''
  );
}

function templateFor(responseTemplates, templateKey, language) {
  if (!templateKey) return null;
  return responseTemplates[`${templateKey}_${language}`] || null;
}

function findVenue(venues, venueId) {
  return (venues || []).find((v) => v.id === venueId) || null;
}

function venueDescription(venue, language) {
  return venue?.descriptions?.[language]?.short_description || '';
}

// Finds the option (in whichever branch) whose next_branch_key routes into
// branchKey -- i.e. how a guest normally arrives there. Reused both for a
// forward selection (option.next_branch_key) and for __back landing on a
// non-root branch, so "entering a branch" always resolves the same way.
function findEntryOption(menuBranches, branchKey) {
  for (const parentBranch of Object.values(menuBranches)) {
    const option = (parentBranch.options || []).find((o) => o.next_branch_key === branchKey);
    if (option) return option;
  }
  return null;
}

// A newly-selected venue (option.venue_id) always wins; otherwise falls back
// to whichever venue was selected earlier in the conversation
// (session.selected_venue_id), so leaf options further down
// restaurant_followup_menu (e.g. "venue_info", whose template body still
// references {{restaurant_name}}/{{short_description}}) resolve against the
// venue the guest already picked rather than having no venue at all.
function buildOptionReply({ responseTemplates, venues, option, session, language }) {
  const isNewVenueSelection = !!option.venue_id;
  const templateKey = isNewVenueSelection ? VENUE_SELECTED_TEMPLATE_KEY : option.template_key;
  const template = templateFor(responseTemplates, templateKey, language);
  if (!template) return null;

  const venueId = option.venue_id || session?.selected_venue_id;
  const venue = venueId ? findVenue(venues, venueId) : null;

  return fillTemplate(template, {
    restaurant_name: venue?.display_name || '',
    short_description: venue ? venueDescription(venue, language) : ''
  });
}

function buildBranchEntryReply({ menuBranches, responseTemplates, venues, branchKey, session, language }) {
  if (!branchKey || branchKey === 'main_menu') {
    return templateFor(responseTemplates, MAIN_MENU_TEMPLATE_KEY, language);
  }

  const entryOption = findEntryOption(menuBranches, branchKey);
  if (!entryOption) return null;

  return buildOptionReply({ responseTemplates, venues, option: entryOption, session, language });
}

function buildGenericList(branch, venues, language) {
  const options = (branch.options || [])
    .filter((o) => o.choice_number != null)
    .sort((a, b) => a.choice_number - b.choice_number);

  const lines = options.map((o) => {
    const label = (language === 'es' ? o.label_es : o.label_en) || o.label_en;
    if (o.venue_id) {
      const description = venueDescription(findVenue(venues, o.venue_id), language);
      return description ? `${o.choice_number}. ${label} — ${description}` : `${o.choice_number}. ${label}`;
    }
    return `${o.choice_number}. ${label}`;
  });

  const intro = GENERIC_LIST_INTRO[language] || GENERIC_LIST_INTRO.en;
  return `${intro}\n${lines.join('\n')}`;
}

function buildResponse({ result, session, propertyData }) {
  const { menuBranches = {}, responseTemplates = {}, venues = [] } = propertyData || {};
  const language = session.current_language || 'en';

  if (!result) {
    return GENERIC_FALLBACK_TEMPLATE[language] || GENERIC_FALLBACK_TEMPLATE.en;
  }

  if (result.type === 'list_request') {
    const branch = menuBranches[result.branch_key];
    if (!branch) return null;
    return buildGenericList(branch, venues, language);
  }

  if (result.type === 'menu_back') {
    const branch = menuBranches[result.branch_key];
    const targetBranchKey = branch?.parent_branch_key || 'main_menu';
    session.fast_path_context = targetBranchKey;
    return buildBranchEntryReply({ menuBranches, responseTemplates, venues, branchKey: targetBranchKey, session, language });
  }

  if (result.type === 'option_selected') {
    const branch = menuBranches[result.branch_key];
    const option = (branch?.options || []).find((o) => o.option_key === result.option_key);
    if (!option) return null;

    const reply = buildOptionReply({ responseTemplates, venues, option, session, language });

    if (option.venue_id) {
      const venue = findVenue(venues, option.venue_id);
      session.selected_restaurant = venue?.display_name || null;
      session.selected_venue_id = option.venue_id;
    }

    if (option.next_branch_key) {
      session.fast_path_context = option.next_branch_key;
    }

    return reply;
  }

  return null;
}

module.exports = { buildResponse };
