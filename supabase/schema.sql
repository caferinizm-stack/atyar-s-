-- ═══════════════════════════════════════════════════════════════════════════
-- Retra · At Yarışı — Supabase şeması (v2 · GERÇEK KRİSTAL)
--
-- Oyun, uygulamanın mevcut cüzdanını kullanır:
--   * bakiye  : public.profiles.crystals
--   * kullanıcı: public.profiles.username
--   * kimlik  : Supabase Auth (uygulamadaki e-posta/şifre veya Google hesabı)
--
-- Anonim giriş GEREKMEZ; oyuncu uygulamadaki hesabıyla giriş yapar ve
-- kristalleri iki tarafta ortaktır.
--
-- GEREKSİNİM: public.profiles tablosu (id, username, crystals) mevcut olmalı.
-- Kurulum: SQL Editor → bu dosyanın tamamı.
--
-- Daha önce v1 şemasını (horse_players + anonim) çalıştırdıysan, bir kez:
--   drop table if exists public.horse_bets cascade;
--   drop table if exists public.horse_round_secrets cascade;
--   drop table if exists public.horse_rounds cascade;
--   drop table if exists public.horse_players cascade;
--
-- Tur döngüsü sunucudadır: istemci saniyede bir `horse_state()` çağırır,
-- fonksiyon süresi dolan fazı ilerletir (bahis → yarış → sonuç → yeni tur).
-- Kazanan sıra `horse_round_secrets` tablosunda tutulur; istemcinin bu
-- tabloya erişimi yoktur, yalnız bahisler kapandıktan sonra RPC ile açılır.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ─── 1. Tablolar ───────────────────────────────────────────────────────────

create table if not exists public.horse_rounds (
  id uuid primary key default gen_random_uuid(),
  phase text not null default 'betting',
  betting_ends_at timestamptz not null,
  race_ends_at timestamptz,
  result_ends_at timestamptz,
  winner int,
  settled boolean not null default false,
  created_at timestamptz not null default now(),
  constraint horse_rounds_phase_check check (phase in ('betting', 'racing', 'result')),
  constraint horse_rounds_winner_check check (winner is null or winner between 1 and 6)
);

create index if not exists horse_rounds_created_idx
  on public.horse_rounds (created_at desc);

-- Aynı anda yalnız bir açık tur olabilir.
create unique index if not exists horse_rounds_single_open
  on public.horse_rounds (settled)
  where settled = false;

-- Gizli sonuç: kazanan sıra + at başına bitiş süresi (ms). İstemci okuyamaz.
create table if not exists public.horse_round_secrets (
  round_id uuid primary key references public.horse_rounds (id) on delete cascade,
  finish_order int[] not null,
  finish_times jsonb not null
);

-- Bahisler: oyuncu = uygulamanın gerçek kullanıcısı (profiles).
create table if not exists public.horse_bets (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.horse_rounds (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  horse int not null,
  amount bigint not null,
  status text not null default 'pending',
  payout bigint not null default 0,
  created_at timestamptz not null default now(),
  constraint horse_bets_horse_check check (horse between 1 and 6),
  constraint horse_bets_amount_check check (amount > 0),
  constraint horse_bets_status_check check (status in ('pending', 'won', 'lost'))
);

create index if not exists horse_bets_round_idx
  on public.horse_bets (round_id, horse);

create index if not exists horse_bets_player_idx
  on public.horse_bets (player_id, created_at desc);

-- **Eski (v1) kurulum düzeltmesi**: v1'de `horse_bets.player_id` boş
-- `horse_players` tablosuna bağlıydı. Tablo `create table if not exists` ile
-- yeniden oluşmadığı için o bağ KALIYOR ve gerçek kullanıcıyla bahis
-- konunca "violates foreign key constraint horse_bets_player_id_fkey"
-- hatası veriyordu. Burada bağ **profiles**'a çevrilir (eski satırlar
-- silinmez: `not valid`).
do $fk$
declare
  c record;
  v_ok boolean := false;
begin
  if to_regclass('public.horse_bets') is null then
    return;
  end if;

  for c in
    select con.conname, con.confrelid
      from pg_constraint con
     where con.conrelid = 'public.horse_bets'::regclass
       and con.contype = 'f'
       and con.confrelid <> 'public.horse_rounds'::regclass
  loop
    if c.confrelid = 'public.profiles'::regclass then
      v_ok := true;
    else
      execute format('alter table public.horse_bets drop constraint %I', c.conname);
    end if;
  end loop;

  if not v_ok then
    alter table public.horse_bets
      add constraint horse_bets_player_id_fkey
      foreign key (player_id) references public.profiles (id) on delete cascade
      not valid;
  end if;
end $fk$;

-- ─── 2. Yardımcılar ────────────────────────────────────────────────────────

-- Bahis çarpanları: 1→2x, 2→3x, 3→5x, 4→10x, 5→25x, 6→50x
create or replace function public.horse_odds(p_horse int)
returns bigint
language sql
immutable
as $$
  select case p_horse
           when 1 then 2
           when 2 then 3
           when 3 then 5
           when 4 then 10
           when 5 then 25
           when 6 then 50
           else 0
         end::bigint;
$$;

-- timestamptz → epoch milisaniye (istemciyle aynı birim).
create or replace function public.horse_ms(p_ts timestamptz)
returns bigint
language sql
immutable
as $$
  select case
           when p_ts is null then null
           else (extract(epoch from p_ts) * 1000)::bigint
         end;
$$;

-- ─── 2b. Sıralama defteri (şans oyunları sıralaması) ───────────────────────
--
-- Kazanç, uygulamadaki **son 24 saatlik şans oyunları sıralamasına** yazılır
-- (`public.game_results` + `record_game_result`). Bunlar `supabase_leaderboard.sql`
-- ile kurulur; yoksa oyun çalışır, yalnız deftere yazılmaz.
--
-- Yazım **turun kendi işaretiyle** korunur: aynı tur iki kez yazılamaz.
create table if not exists public.horse_ledger_rounds (
  round_id     uuid primary key,
  written_at   timestamptz not null default now(),
  rows_written integer not null default 0
);

alter table public.horse_ledger_rounds enable row level security;
revoke all on public.horse_ledger_rounds from anon, authenticated;

/** Bir turun bütün oyuncularını deftere yazar (idempotent). */
create or replace function public.horse_record_ledger(p_round uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer := 0;
begin
  if p_round is null then
    return 0;
  end if;

  -- Defter fonksiyonu hiç kurulu değilse işaret koyma: sonra kurulursa
  -- geriye dönük doldurma bu turu yine yakalayabilsin.
  if to_regprocedure('public.record_game_result(uuid,text,bigint,bigint)') is null
     and to_regprocedure('public.record_game_result(uuid,text,integer,integer)') is null then
    raise warning 'record_game_result bulunamadı: sıralama defterine yazılamıyor.';
    return -1;
  end if;

  insert into public.horse_ledger_rounds (round_id)
  values (p_round)
  on conflict (round_id) do nothing;

  if not found then
    return 0;
  end if;

  if to_regprocedure('public.record_game_result(uuid,text,bigint,bigint)') is not null then
    perform public.record_game_result(t.player_id, 'horse', t.bet, t.payout)
      from (
        select b.player_id,
               sum(b.amount)::bigint as bet,
               sum(b.payout)::bigint as payout
          from public.horse_bets b
         where b.round_id = p_round
           and b.status in ('won', 'lost')
         group by b.player_id
      ) t;
    get diagnostics v_rows = row_count;
  else
    perform public.record_game_result(
              t.player_id,
              'horse',
              least(t.bet, 2147483647::bigint)::integer,
              least(t.payout, 2147483647::bigint)::integer
            )
      from (
        select b.player_id,
               sum(b.amount)::bigint as bet,
               sum(b.payout)::bigint as payout
          from public.horse_bets b
         where b.round_id = p_round
           and b.status in ('won', 'lost')
         group by b.player_id
      ) t;
    get diagnostics v_rows = row_count;
  end if;

  update public.horse_ledger_rounds
     set rows_written = v_rows
   where round_id = p_round;

  return v_rows;
exception
  when others then
    -- Defter yazımı turu/ödemeyi ASLA düşürmesin.
    raise warning 'horse_record_ledger(%) başarısız: %', p_round, sqlerrm;
    return -1;
end;
$$;

revoke all on function public.horse_record_ledger(uuid) from public;

/** Bahisler sonuçlandığı ANDA defteri yazar (fonksiyon sürümünden bağımsız). */
create or replace function public.horse_bets_ledger_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round uuid;
begin
  -- Yalnız **sonuçlanmış** satırlar (bahis → kazandı/kaybetti) deftere girer.
  -- NOT: PostgreSQL geçiş tablolarıyla "UPDATE OF kolon" listesini birlikte
  -- kabul etmez; bu yüzden tetikleyici kolon listesiz kurulur, filtre burada.
  for v_round in
    select distinct n.round_id
      from new_rows n
     where n.status in ('won', 'lost')
  loop
    -- Defter yazımı turu/ödemeyi ASLA düşürmesin.
    begin
      perform public.horse_record_ledger(v_round);
    exception
      when others then
        raise warning 'horse_bets_ledger(%) atlandı: %', v_round, sqlerrm;
    end;
  end loop;
  return null;
end;
$$;

drop trigger if exists horse_bets_ledger on public.horse_bets;
create trigger horse_bets_ledger
  after update on public.horse_bets
  referencing new table as new_rows
  for each statement
  execute function public.horse_bets_ledger_trg();

-- ─── 3. Tur döngüsü ────────────────────────────────────────────────────────

/**
 * Fazları ilerletir. Herhangi bir istemci çağırabilir; advisory lock sayesinde
 * aynı anda yalnız bir çağrı durumu değiştirir.
 *
 * Gövde `horse_advance_core` içindedir; istemcinin çağırdığı `horse_advance`
 * ise **hata vermeyen** sarmalayıcıdır: ödeme/defter tarafında beklenmedik bir
 * sorun olsa bile `horse_state()` (oyun ekranı) çalışmaya devam eder.
 */
create or replace function public.horse_advance_core()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.horse_rounds%rowtype;
  v_order int[];
  v_times jsonb;
  v_ms bigint;
  v_winner int;
  v_bigint_crystals boolean := false;
  i int;
begin
  perform pg_advisory_xact_lock(872341);

  select * into r
    from public.horse_rounds
   where settled = false
   order by created_at desc
   limit 1;

  -- Hiç açık tur yok: 20 saniyelik bahis turu aç.
  if not found then
    insert into public.horse_rounds (phase, betting_ends_at)
    values ('betting', now() + interval '20 seconds');
    return;
  end if;

  -- Bahis süresi doldu: kazananı belirle, yarışı başlat.
  if r.phase = 'betting' and now() >= r.betting_ends_at then
    -- Kazanan **1/oran** ağırlığıyla seçilir (exponential race):
    -- 2× at ~%42, 50× at ~%1,7 olasılıkla kazanır. Böylece ortalama ödeme
    -- bahis başına ~1× olur ve gerçek kristal ekonomisi şişmez.
    select g
      into v_winner
      from (
        select g, -ln(random()) * public.horse_odds(g) as sort_key
          from generate_series(1, 6) as g
      ) s
     order by s.sort_key
     limit 1;

    -- Bitiş sırası: kazanan başta, kalanlar rastgele.
    select array_agg(g order by case when g = v_winner then 0 else 1 end, random())
      into v_order
      from generate_series(1, 6) as g;

    v_ms := 10400;
    v_times := '{}'::jsonb;

    for i in 1..6 loop
      if i > 1 then
        v_ms := v_ms + 400 + floor(random() * 700)::bigint;
      end if;
      v_times := v_times || jsonb_build_object(v_order[i]::text, v_ms);
    end loop;

    insert into public.horse_round_secrets (round_id, finish_order, finish_times)
    values (r.id, v_order, v_times)
    on conflict (round_id) do nothing;

    update public.horse_rounds
       set phase = 'racing',
           race_ends_at = r.betting_ends_at
                          + make_interval(secs => ((v_ms + 1000)::double precision) / 1000.0)
     where id = r.id;
    return;
  end if;

  -- Yarış bitti: ödemeleri gerçek cüzdana yap, sonuç fazına geç.
  if r.phase = 'racing' and now() >= r.race_ends_at then
    select finish_order into v_order
      from public.horse_round_secrets
     where round_id = r.id;

    if v_order is null then
      -- Beklenmedik durum: gizli kayıt yoksa rastgele bir sıra üret.
      select array_agg(g order by random())
        into v_order
        from generate_series(1, 6) as g;
    end if;

    v_winner := v_order[1];

    update public.horse_bets b
       set status = case when b.horse = v_winner then 'won' else 'lost' end,
           payout = case
                      when b.horse = v_winner
                        then b.amount * public.horse_odds(b.horse)
                      else 0
                    end
     where b.round_id = r.id
       and b.status = 'pending';

    -- **Kazanç cüzdana**: kolon bigint ise üst sınır yok; integer ise (eski
    -- kurulum) 2.147.483.647'de kırpılır — hiçbir durumda hata vermez.
    select coalesce(bool_or(c.data_type = 'bigint'), false)
      into v_bigint_crystals
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name = 'profiles'
       and c.column_name = 'crystals';

    if v_bigint_crystals then
      update public.profiles p
         set crystals = p.crystals + t.total
        from (
          select player_id, sum(payout)::bigint as total
            from public.horse_bets
           where round_id = r.id
             and payout > 0
           group by player_id
        ) t
       where p.id = t.player_id;
    else
      update public.profiles p
         set crystals = least(2147483647::bigint, p.crystals::bigint + t.total)::integer
        from (
          select player_id, sum(payout)::bigint as total
            from public.horse_bets
           where round_id = r.id
             and payout > 0
           group by player_id
        ) t
       where p.id = t.player_id;
    end if;

    -- **Şans oyunları sıralaması** (son 24 saatte en çok kazananlar): turu
    -- deftere yazan ortak fonksiyon `horse_record_ledger`. Tur işareti
    -- sayesinde tetikleyici zaten yazmışsa burada ikinci kez yazılmaz.
    perform public.horse_record_ledger(r.id);

    update public.horse_rounds
       set phase = 'result',
           winner = v_winner,
           result_ends_at = now() + interval '5 seconds'
     where id = r.id;
    return;
  end if;

  -- Sonuç süresi doldu: turu kapat, yenisini aç.
  if r.phase = 'result' and now() >= r.result_ends_at then
    update public.horse_rounds set settled = true where id = r.id;

    insert into public.horse_rounds (phase, betting_ends_at)
    values ('betting', now() + interval '20 seconds');
    return;
  end if;
end;
$$;

-- Çekirdek gövde istemciye kapalı; yalnız sarmalayıcı çağrılabilir.
revoke all on function public.horse_advance_core() from public;
revoke all on function public.horse_advance_core() from anon, authenticated;

/** Hata vermeyen sarmalayıcı: oyun ekranını (state yoklamasını) kilitlemez. */
create or replace function public.horse_advance()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.horse_advance_core();
  exception
    when others then
      raise warning 'horse_advance atlandı: %', sqlerrm;
  end;
end;
$$;

-- ─── 4. İstemci API'si ─────────────────────────────────────────────────────

/** Oyuncunun gerçek cüzdanı + açık tur + son 10 sonuç. */
create or replace function public.horse_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  r public.horse_rounds%rowtype;
  s public.horse_round_secrets%rowtype;
  v_has_secret boolean := false;
  v_round jsonb;
  v_history jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    -- Uygulamaya kayıt olmadan oynanamaz: kristal bakiyesi profiles'ta.
    raise exception 'PROFILE_MISSING';
  end if;

  perform public.horse_advance();

  select * into r
    from public.horse_rounds
   where settled = false
   order by created_at desc
   limit 1;

  if r.id is null then
    raise exception 'NO_ROUND';
  end if;

  select * into s from public.horse_round_secrets where round_id = r.id;
  v_has_secret := found;

  v_round := jsonb_build_object(
    'id', r.id,
    -- **Tur numarası**: sunucudaki toplam tur sayısı. Uygulama kapanıp
    -- açılsa da sıfırlanmaz (eskiden istemci her açılışta 1'den başlıyordu).
    'number', (select count(*) from public.horse_rounds),
    'phase', r.phase,
    'bettingEndsAt', public.horse_ms(r.betting_ends_at),
    'raceEndsAt', public.horse_ms(r.race_ends_at),
    'resultEndsAt', public.horse_ms(r.result_ends_at),

    'myBets', coalesce((
      select jsonb_agg(
               jsonb_build_object('horse', b.horse, 'amount', b.amount)
               order by b.created_at
             )
        from public.horse_bets b
       where b.round_id = r.id
         and b.player_id = v_uid
    ), '[]'::jsonb),

    'totalBet', coalesce((
      select sum(b.amount)
        from public.horse_bets b
       where b.round_id = r.id and b.player_id = v_uid
    ), 0),

    'myPayout', coalesce((
      select sum(b.payout)
        from public.horse_bets b
       where b.round_id = r.id and b.player_id = v_uid
    ), 0),

    'playerCount', (
      select count(distinct b.player_id)
        from public.horse_bets b
       where b.round_id = r.id
    ),

    'totalStaked', coalesce((
      select sum(b.amount)
        from public.horse_bets b
       where b.round_id = r.id
    ), 0),

    'winnersCount', (
      select count(distinct b.player_id)
        from public.horse_bets b
       where b.round_id = r.id and b.status = 'won'
    ),

    -- **Bu tur oynayanlar**: oyun içinde avatarları (çerçeveleriyle) görünür.
    -- En son bahis atan başta; en fazla 8 kişi (alan dar).
    'players', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', t.player_id,
                 'nickname', t.username,
                 'avatar', t.avatar_url,
                 'frame', t.frame_json
               )
               order by t.last_bet desc
             )
        from (
          select b.player_id,
                 p.username,
                 p.avatar_url,
                 (to_jsonb(p) -> 'frame') as frame_json,
                 max(b.created_at) as last_bet
            from public.horse_bets b
            join public.profiles p on p.id = b.player_id
           where b.round_id = r.id
           group by b.player_id, p.username, p.avatar_url, frame_json
           order by last_bet desc
           limit 8
        ) t
    ), '[]'::jsonb),

    -- Sıra ve süreler yalnız bahisler kapandıktan sonra açılır.
    'winner', case when r.phase <> 'betting' then r.winner end,
    'order', case
               when r.phase <> 'betting' and v_has_secret
                 then to_jsonb(s.finish_order)
             end,
    'times', case
               when r.phase <> 'betting' and v_has_secret
                 then s.finish_times
             end,

    -- **İlk 3 oyuncu** (UEFA'daki gibi). Oyuncu başına TEK satır: aynı kişi
    -- kazanan ata birden çok bahis yaptıysa ödemeler toplanır (eskiden aynı
    -- isim 3 kez görünüyordu).
    'leaderboard', case
      when r.phase = 'result' then coalesce((
        select jsonb_agg(row_data order by rank)
          from (
            select jsonb_build_object(
                     'id', t.player_id,
                     'nickname', t.username,
                     'avatar', t.avatar_url,
                     -- Takılı **çerçeve** (profildeki `frame` jsonb): sonuç
                     -- podyumunda avatarın çevresinde çizilir.
                     'frame', t.frame_json,
                     'horse', t.horse,
                     'bets', t.bets,
                     'amount', t.amount,
                     'payout', t.payout
                   ) as row_data,
                   row_number() over (order by t.payout desc, t.amount desc) as rank
              from (
                select b.player_id,
                       p.username,
                       p.avatar_url,
                       (to_jsonb(p) -> 'frame') as frame_json,
                       min(b.horse)  as horse,
                       count(*)      as bets,
                       sum(b.amount) as amount,
                       sum(b.payout) as payout
                  from public.horse_bets b
                  join public.profiles p on p.id = b.player_id
                 where b.round_id = r.id
                   and b.status = 'won'
                 group by b.player_id, p.username, p.avatar_url, frame_json
              ) t
          ) ranked
         where rank <= 3
      ), '[]'::jsonb)
    end
  );

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', h.id,
             'winner', h.winner,
             'at', public.horse_ms(h.result_ends_at)
           )
           order by h.created_at desc
         ), '[]'::jsonb)
    into v_history
    from (
      select id, winner, result_ends_at, created_at
        from public.horse_rounds
       where settled = true and winner is not null
       order by created_at desc
       limit 10
    ) h;

  return jsonb_build_object(
    'serverTime', public.horse_ms(now()),
    'player', jsonb_build_object(
      'nickname', v_profile.username,
      'balance', v_profile.crystals
    ),
    'round', v_round,
    'history', v_history
  );
end;
$$;

/** Bahis koyar; tutar **gerçek kristal bakiyesinden** düşer. */
create or replace function public.horse_place_bet(p_horse int, p_amount bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r public.horse_rounds%rowtype;
  v_balance bigint;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_horse is null or p_horse < 1 or p_horse > 6 then
    raise exception 'BAD_HORSE';
  end if;

  -- Tek bahis üst sınırı: yanlışlıkla/aşırı istekle cüzdanı boşaltmayı önler.
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'BAD_AMOUNT';
  end if;

  perform public.horse_advance();

  select * into r
    from public.horse_rounds
   where settled = false
   order by created_at desc
   limit 1;

  if r.id is null or r.phase <> 'betting' or now() >= r.betting_ends_at then
    raise exception 'PHASE_CLOSED';
  end if;

  -- Satırı kilitle: aynı anda iki bahis bakiyeyi iki kez düşemez.
  select crystals into v_balance
    from public.profiles
   where id = v_uid
   for update;

  if v_balance is null then
    raise exception 'PROFILE_MISSING';
  end if;

  if v_balance < p_amount then
    raise exception 'BALANCE';
  end if;

  update public.profiles
     set crystals = crystals - p_amount
   where id = v_uid;

  insert into public.horse_bets (round_id, player_id, horse, amount)
  values (r.id, v_uid, p_horse, p_amount);

  return public.horse_state();
end;
$$;

-- ─── 5. RLS ve yetkiler ────────────────────────────────────────────────────

alter table public.horse_rounds enable row level security;
alter table public.horse_round_secrets enable row level security;
alter table public.horse_bets enable row level security;

drop policy if exists "horse_rounds read" on public.horse_rounds;
create policy "horse_rounds read"
  on public.horse_rounds
  for select
  to authenticated
  using (true);

drop policy if exists "horse_bets self read" on public.horse_bets;
create policy "horse_bets self read"
  on public.horse_bets
  for select
  to authenticated
  using (player_id = auth.uid());

-- Gizli sonuç tablosu: politika yok + doğrudan erişim kapalı.
revoke all on public.horse_round_secrets from anon, authenticated;

grant select on public.horse_rounds to authenticated;
grant select on public.horse_bets to authenticated;

revoke all on function public.horse_advance() from public;
revoke all on function public.horse_state() from public;
revoke all on function public.horse_place_bet(int, bigint) from public;

grant execute on function public.horse_state() to authenticated;
grant execute on function public.horse_place_bet(int, bigint) to authenticated;

-- ─── 6. Realtime ───────────────────────────────────────────────────────────

do $$
begin
  alter publication supabase_realtime add table public.horse_rounds;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

-- ─── 7. Şans Oyunları gizleme (admin aç/kapat) ─────────────────────────────
-- Oyun merkezindeki diğer oyunlarla aynı anahtarla yönetilir
-- (`supabase_sans_oyunu_gizleme.sql`). Tablo yoksa bu blok hiçbir şey yapmaz:
-- oyun yine çalışır, yalnız admin tarafından gizlenemez.

do $$
begin
  if to_regclass('public.luck_game_visibility') is not null then
    insert into public.luck_game_visibility (game)
    values ('horse')
    on conflict (game) do nothing;
  end if;
end $$;
