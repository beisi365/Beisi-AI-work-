-- ============================================================
-- 云端排班种子：5 位老师示例排班（仅在 teacher_schedules 为空时执行）
-- 未来 14 天中每位老师的「周二、周四」各排一节晚间课，共约 30 条
-- 幂等：id 主键去重，重复跑不会重复插入
-- 执行位置：Supabase 控制台 → SQL Editor → 整段粘贴执行
-- ============================================================

do $$
declare
  tids   text[] := array['t1','t2','t3','t4','t5'];
  titles text[] := array['AI写作工坊', '提示词工程实战', '多模态创作工坊', '品牌策略研讨', '课程统筹例会'];
  locs   text[] := array['301 教室', '302 教室', '303 教室', '304 教室', '运营会议室'];
  tid    text;
  ttl    text;
  loc    text;
  d      date;
  i      int;
  cnt    int := 0;
begin
  for i in 1..array_length(tids, 1) loop
    tid  := tids[i];
    ttl  := titles[i];
    loc  := locs[i];
    for d in (select generate_series(current_date, current_date + 13, '1 day'::interval)::date) loop
      -- 排课：仅周二(2)、周四(4)
      if extract(dow from d) in (2, 4) then
        insert into public.teacher_schedules
          (id, teacher_id, schedule_date, start_time, end_time, title, location, note, created_at, updated_at, created_by)
        values
          ('sch_' || tid || '_' || to_char(d, 'YYYYMMDD'),
           tid, d, '19:00', '21:00', ttl, loc,
           '示例排班（云端种子，可编辑/删除）',
           extract(epoch from now())::bigint * 1000,
           extract(epoch from now())::bigint * 1000,
           'seed')
        on conflict (id) do nothing;
        cnt := cnt + 1;
      end if;
    end loop;
  end loop;
  raise notice '已生成/更新 % 条示例排班（已存在的会跳过）', cnt;
end $$;

-- 校验：每老师应各 4 条
select teacher_id, count(*) as n
from public.teacher_schedules
group by teacher_id
order by teacher_id;
