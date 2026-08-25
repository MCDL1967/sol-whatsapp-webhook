/*
File: visible_options.js
Role: Single source of truth for which of a branch's options are
      guest-visible right now, and what number each one displays as.

Options linked to a venue with show_in_restaurant_list=false (e.g. a venue
closed for remodeling -- see
docs/db_planning/SOL_DB_Master_Plan_v1.0.md section 9) are excluded
entirely, and the remaining options renumber contiguously (1, 2, 3, ...)
rather than skipping the hidden option's original choice_number. Both
fast_path_classifier.js (what a typed number resolves to) and
fast_path_responder.js (what number is printed in the list) import this so
the two can never drift apart -- a guest typing the number they were shown
must always resolve to that same option.
*/

'use strict';

function findVenue(venues, venueId) {
  return (venues || []).find((v) => v.id === venueId) || null;
}

function isVenueHidden(venues, venueId) {
  if (!venueId) return false;
  return findVenue(venues, venueId)?.show_in_restaurant_list === false;
}

// Options with a hidden venue are dropped before renumbering, so the
// remaining options' displayNumber is always contiguous starting at 1 --
// identical to their original choice_number whenever nothing is hidden.
function getVisibleNumberedOptions(branch, venues) {
  return (branch.options || [])
    .filter((o) => o.choice_number != null)
    .filter((o) => !isVenueHidden(venues, o.venue_id))
    .sort((a, b) => a.choice_number - b.choice_number)
    .map((o, index) => ({ ...o, displayNumber: index + 1 }));
}

module.exports = { isVenueHidden, getVisibleNumberedOptions };
