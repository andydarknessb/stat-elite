-- GLOSSARY: Three-Pointers. Every Game before this one had them on, and the app on main never sends this column, so the default keeps that app working.
alter table games add column three_pointers boolean not null default true;
