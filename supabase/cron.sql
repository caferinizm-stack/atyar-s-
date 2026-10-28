-- RETRA · AT YARIŞI — 7/24 TUR DÖNGÜSÜ (TEK DOSYA, TAMAMEN SQL)
-- =====================================================================
--
-- NE YAPAR?
--   1. `pg_cron` kurulu mu, sunucuda mevcut mu → **SQL ile söyler**.
--   2. Kurulu değilse **SQL ile açmayı dener**
--      (`create extension pg_cron with schema pg_catalog`).
--   3. Açıksa `horse_advance()` görevini **5 saniyede bir** zamanlar.
--   4. Sonucu `NOTICE` olarak yazar (kurulu / açıldı / açılamadı).
--
-- NEDEN GEREKLİ?
--   Oyun açıkken istemci saniyede bir `horse_state()` çağırır ve turlar
--   ilerler. Uygulama **tamamen kapalıyken** de turların dönmesi için sunucu
--   tarafında bir zamanlayıcı gerekir; bu dosya onu kurar.
--
-- NASIL ÇALIŞTIRILIR?
--   Supabase ▸ SQL Editor ▸ bu dosyanın tamamı ▸ Run.
--   Tek sefer yeterlidir; tekrar çalıştırmak görevi çoğaltmaz.
--
-- KONTROL
--   select jobname, schedule, active from cron.job;              -- görev listesi
--   select * from cron.job_run_details order by start_time desc limit 5;
--
-- KALDIRMA
--   select cron.unschedule('horse_advance_5s');

-- ─── 1. DURUM ───────────────────────────────────────────────────────────────
-- Sonuç: `true | true`  → pg_cron kurulu ve hazır.
--        `false | true` → sunucuda var, bu projede kapalı (2. adım açar).
--        `false | false`→ Supabase projesinde pg_cron yok (destek gerekir).
select
  exists (select 1 from pg_extension where extname = 'pg_cron') as pg_cron_kurulu,
  exists (select 1 from pg_available_extensions where name = 'pg_cron') as sunucuda_mevcut;

-- ─── 2. KURULU DEĞİLSE AÇMAYI DENE ──────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron zaten açık.';
    return;
  end if;

  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron bu projede mevcut değil; turlar yalnız oyun açıkken ilerler.';
    return;
  end if;

  begin
    execute 'create extension pg_cron with schema pg_catalog';
    raise notice 'pg_cron açıldı.';
  exception
    when others then
      raise notice 'pg_cron SQL ile açılamadı (%); Dashboard ▸ Database ▸ Extensions ▸ pg_cron ile açıp bu dosyayı tekrar çalıştır.', sqlerrm;
      return;
  end;

  -- Görev tablolarına erişim (bazı kurulumlarda gerekir; hata olsa da devam).
  begin
    execute 'grant usage on schema cron to postgres';
    execute 'grant all privileges on all tables in schema cron to postgres';
  exception
    when others then null;
  end;
end $$;

-- ─── 3. GÖREVİ ZAMANLA ──────────────────────────────────────────────────────
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'cron.job bulunamadı: zamanlanacak görev yok. Oyun turları istemci çağrısıyla ilerleyecek.';
    return;
  end if;

  -- Aynı isimde eski görev varsa kaldır (tekrar çalıştırmada çoğalmasın).
  execute $q$
    select cron.unschedule(jobid)
      from cron.job
     where jobname = 'horse_advance_5s'
  $q$;

  execute $q$
    select cron.schedule(
      'horse_advance_5s',
      '5 seconds',
      'select public.horse_advance()'
    )
  $q$;

  raise notice 'At yarışı tur döngüsü 5 saniyede bir çalışacak.';
end $$;

-- ─── 4. SON KONTROL ─────────────────────────────────────────────────────────
do $$
declare
  v_jobs int := 0;
begin
  if to_regclass('cron.job') is null then
    return;
  end if;

  execute $q$
    select count(*) from cron.job where jobname = 'horse_advance_5s'
  $q$ into v_jobs;

  if v_jobs > 0 then
    raise notice 'Doğrulama: horse_advance_5s görevi kayıtlı (%).', v_jobs;
  else
    raise notice 'Doğrulama: görev kaydedilemedi.';
  end if;
end $$;
