-- Renames the 6 existing venues' backend keys from descriptive slugs
-- (fenicia, la_brasserie, ...) to generic venue_N, matching the same
-- tenant-doesn't-need-the-internal-identifier treatment already applied to
-- teams (see DB_Construction_Decisions_v0.1.md, "Team Routing Generalized").
-- display_name/id untouched. Confirmed safe: nothing reads venues.venue_key
-- from Supabase today — the live venue-matching path (supabase_client.js's
-- resolveVenueId, webhook.js's KNOWN_RESERVATION_VENUES) matches by
-- display_name, and webhook.js's own venue references are to the separate,
-- disconnected static JSON files in property_packages/, not this table.

update venues set venue_key = 'venue_1' where venue_key = 'acua_pool_lounge_bar';
update venues set venue_key = 'venue_2' where venue_key = 'fenicia';
update venues set venue_key = 'venue_3' where venue_key = 'garden_lobby_bar';
update venues set venue_key = 'venue_4' where venue_key = 'la_brasserie';
update venues set venue_key = 'venue_5' where venue_key = 'larrys_market';
update venues set venue_key = 'venue_6' where venue_key = 'larrys_sports_bar_terrace';
