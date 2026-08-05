-- Adds a real FK from a menu option to the venue it represents, replacing
-- the hardcoded KNOWN_RESERVATION_VENUES fuzzy-text-matching array in
-- webhook.js. Lets the fast-path rewrite resolve "which venue did the guest
-- pick" directly from the option the guest selected, rather than re-parsing
-- text against a separate hardcoded venue list. Nullable -- most options
-- (anything that isn't a restaurant-style selection) have no venue.
-- See docs/db_planning/SOL_DB_Master_Plan_v1.0.md section 3 (webhook rewrite).

alter table menu_options add column venue_id uuid references venues(id);
