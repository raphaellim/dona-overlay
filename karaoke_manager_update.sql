-- karaoke manager update
-- settings.data JSON에 karaokeData를 저장하는 구조라 추가 테이블은 필요 없습니다.
-- 기존 v1_plus SQL을 실행했다면 별도 DB 컬럼 추가는 필요 없습니다.
-- 아래는 안전한 기본값 보강용입니다.

update settings
set data = jsonb_set(
  data,
  '{karaokeData}',
  coalesce(data #> '{karaokeData}', '{"title":"노래방 공지 알림판","ticker":"신청곡은 채팅으로 남겨주세요","users":[],"songs":[]}'::jsonb),
  true
)
where id = 1
  and data is not null;

notify pgrst, 'reload schema';
