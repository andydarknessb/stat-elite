-- 8 Periods (GLOSSARY: Period): a basketball Game can be in eighths, as well as in halves or quarters.
alter table games drop constraint games_period_format_check;
alter table games add constraint games_period_format_check check (period_format in ('halves', 'quarters', 'eighths', 'innings'));
alter table games drop constraint games_check;
alter table games add constraint games_check check ((sport = 'basketball') = (period_format in ('halves', 'quarters', 'eighths')));
