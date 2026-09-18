# 학생 출결 체크 및 안드로이드 문자 연결

## 운영 주소

- 학생용: `/student-attendance`
- 관리자용: `/attendance-admin`

## Vercel 필수 환경변수

- `ATTENDANCE_ADMIN_PASSWORD`: 출결 관리자 화면 로그인 비밀번호
- `ATTENDANCE_SMS_SECRET`: 문자 연결 URL 서명용 긴 임의 문자열
- `SUPABASE_URL`: 기존 대시보드 영구 저장소 주소
- `SUPABASE_SERVICE_ROLE_KEY`: 기존 대시보드 서버 전용 키

환경변수는 Production, Preview에 등록한 뒤 재배포합니다. 실제 값은 HTML, JavaScript, Git 저장소에 넣지 않습니다.

## 저장되는 항목

기존 `academy_dashboard_state.state` JSON 안에 다음 항목을 추가해 저장합니다.

- 학생: `studentPhoneLast4`
- 출결 기록: `id`, `studentId`, `name`, `date`, `time`, `status`, `statusCode`, `smsStatus`, `parentSent`, `memo`, `createdAt`, `updatedAt`
- 문자 설정: `attendanceSettings.academyName`, `attendanceSettings.useEmoji`, `attendanceSettings.templates`

기존 학생, 수납, 결제, 숙제, 일정 데이터는 그대로 유지됩니다.

## 문자 앱 연결

출결 저장이 성공한 뒤 서버 서명 URL을 통해 `sms:번호?body=문구`로 이동합니다. 최종 전송은 안드로이드 기본 문자 앱에서 사용자가 직접 누릅니다. 웹에서는 실제 발송 성공으로 표시하지 않고 `문자 앱 열기 완료`, `문자 보내지 않음`, `학부모 번호 없음`만 기록합니다.
