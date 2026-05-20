-- 수동 사운드 선택 필드 추가
alter table donations add column if not exists manual_sound_file text default '';
alter table donations add column if not exists manual_sound_title text default '';
