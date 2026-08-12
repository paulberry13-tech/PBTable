-- A tournament needs a link an organiser can put on a poster. A UUID cannot be typed,
-- read out, or trusted by a player; a slug can.
alter table public.tournaments add column slug text;

create or replace function public.slugify(p_text text)
returns text language sql immutable set search_path = '' as $$
  select trim(both '-' from
           regexp_replace(
             regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'),
             '-+', '-', 'g'));
$$;

-- Fill on insert (and when an organiser clears it), keeping it unique by appending a
-- counter rather than failing the write.
create or replace function public.set_tournament_slug()
returns trigger language plpgsql set search_path = '' as $$
declare base text; candidate text; n int := 1;
begin
  if new.slug is not null and trim(new.slug) <> '' then
    candidate := public.slugify(new.slug);
  else
    candidate := public.slugify(new.name);
  end if;
  if candidate = '' then candidate := 'tournament'; end if;

  base := candidate;
  while exists (select 1 from public.tournaments t
                 where t.slug = candidate and t.id is distinct from new.id) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;

  new.slug := candidate;
  return new;
end;
$$;

create trigger tournaments_slug
before insert or update of slug, name on public.tournaments
for each row execute function public.set_tournament_slug();

-- backfill existing rows through the same trigger
update public.tournaments set slug = null;

alter table public.tournaments alter column slug set not null;
create unique index tournaments_slug_key on public.tournaments (slug);
