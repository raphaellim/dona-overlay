
-- 사운드 수동 선택 필드 추가
alter table donations add column if not exists manual_sound_key text default '';
alter table donations add column if not exists manual_sound_title text default '';
