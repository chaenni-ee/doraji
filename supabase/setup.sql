-- 도라지타령 제출 기록 (Supabase SQL Editor에서 한 번 실행)
create table if not exists doraji_submissions (
  grade int not null check (grade between 1 and 6),
  class_no int not null check (class_no between 1 and 20),
  student_no int not null check (student_no between 1 and 40),
  name text not null check (char_length(name) <= 20),
  melody text not null check (char_length(melody) <= 120),
  all_filled boolean not null,
  step_rule boolean not null,
  perform text not null check (perform in ('단소', '노래', '단소+노래')),
  submitted_at timestamptz not null default now(),
  primary key (grade, class_no, student_no)
);
alter table doraji_submissions enable row level security;

create table if not exists doraji_settings (key text primary key, value text not null);
alter table doraji_settings enable row level security;

-- 학생 제출: 같은 학년·반·번호로 다시 내면 새 기록으로 바뀜
create or replace function doraji_submit(
  p_grade int, p_class int, p_no int, p_name text, p_melody text,
  p_all_filled boolean, p_step_rule boolean, p_perform text
) returns void language sql security definer set search_path = public as $$
  insert into doraji_submissions
    values (p_grade, p_class, p_no, p_name, p_melody, p_all_filled, p_step_rule, p_perform, now())
  on conflict (grade, class_no, student_no) do update set
    name = excluded.name, melody = excluded.melody, all_filled = excluded.all_filled,
    step_rule = excluded.step_rule, perform = excluded.perform, submitted_at = now();
$$;

-- 교사 조회: 비밀번호가 맞을 때만 그 반 기록을 돌려줌
create or replace function doraji_list(p_password text, p_grade int, p_class int)
returns setof doraji_submissions language plpgsql security definer set search_path = public as $$
begin
  if p_password is distinct from (select value from doraji_settings where key = 'teacher_password') then
    raise exception 'wrong password';
  end if;
  return query select * from doraji_submissions
    where grade = p_grade and class_no = p_class order by student_no;
end $$;

revoke all on function doraji_submit(int,int,int,text,text,boolean,boolean,text) from public;
revoke all on function doraji_list(text,int,int) from public;
grant execute on function doraji_submit(int,int,int,text,text,boolean,boolean,text) to anon;
grant execute on function doraji_list(text,int,int) to anon;

-- 교사 비밀번호 (따옴표 안만 바꾸세요)
insert into doraji_settings values ('teacher_password', '여기에_비밀번호')
  on conflict (key) do update set value = excluded.value;
