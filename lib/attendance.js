import crypto from "node:crypto";

export const STATUS_LABELS = {
  present: "출석",
  late: "지각",
  absent: "결석",
  makeup: "보강",
  leave: "하원"
};

export const STUDENT_STATUS_CODES = new Set(["present", "late", "makeup", "leave"]);
export const ADMIN_STATUS_CODES = new Set(Object.keys(STATUS_LABELS));

export const digits = value => String(value || "").replace(/[^0-9]/g, "");

export function koreanParts(date = new Date()) {
  const dateParts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date).reduce((result, part) => ({...result, [part.type]: part.value}), {});
  const dateText = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
  const timeText = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: true
  }).format(date).replace(/(오전|오후) 0/, "$1 ");
  const displayDate = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "long", day: "numeric"
  }).format(date);
  return {date: dateText, time: timeText, displayDate, createdAt: date.toISOString()};
}

export function studentPhone(student = {}) {
  return digits(student.studentPhone || student.mobile || "");
}

export function parentPhone(student = {}) {
  return digits(student.phone || student.parentPhone || student.guardianPhone || "");
}

export function last4(student = {}) {
  return digits(student.studentPhoneLast4 || studentPhone(student)).slice(-4);
}

export function maskName(name = "학생") {
  const chars = Array.from(String(name).trim());
  if (chars.length <= 1) return `${chars[0] || "학"}○`;
  if (chars.length === 2) return `${chars[0]}○`;
  return `${chars[0]}${"○".repeat(chars.length - 2)}${chars.at(-1)}`;
}

export function publicStudent(student = {}) {
  return {
    id: String(student.id || ""),
    maskedName: maskName(student.name),
    school: student.school || "학교 미등록",
    grade: student.grade || student.classGroup || "학년 미등록"
  };
}

export function defaultAttendanceSettings() {
  return {
    academyName: "벌교미래엔영어",
    useEmoji: true,
    templates: {
      present: "안녕하세요, 학부모님.\n{name} 학생이 {date} {time}에 안전하게 등원하여 수업을 시작했습니다. 오늘도 즐겁고 알찬 수업이 될 수 있도록 세심하게 지도하겠습니다. 감사합니다. {emoji}",
      late: "안녕하세요, 학부모님.\n{name} 학생이 {date} {time}에 등원했습니다. 남은 수업에 잘 참여할 수 있도록 차분히 지도하겠습니다. 감사합니다.",
      absent: "안녕하세요, 학부모님.\n오늘 {name} 학생의 등원이 확인되지 않아 안내드립니다. 미리 전달해 주신 일정이 있다면 확인용 문자이므로 양해 부탁드립니다. 결석이나 등원 시간 변경 사항이 있으시면 편하게 말씀해 주세요. 감사합니다.",
      makeup: "안녕하세요, 학부모님.\n{name} 학생이 {date} {time}에 보강수업을 위해 등원했습니다. 부족했던 학습 내용을 꼼꼼하게 확인하고 보완하여 지도하겠습니다. 감사합니다. {emoji}",
      leave: "안녕하세요, 학부모님.\n{name} 학생이 오늘 수업을 잘 마치고 {date} {time}에 하원했습니다. 오늘도 성실하게 수업에 참여했습니다. 안전하게 귀가할 수 있도록 가정에서도 확인 부탁드립니다. 감사합니다."
    }
  };
}

export function normalizeSettings(settings = {}) {
  const defaults = defaultAttendanceSettings();
  return {
    ...defaults,
    ...settings,
    templates: {...defaults.templates, ...(settings.templates || {})}
  };
}

export function attendanceMessage(student, statusCode, parts, settings) {
  const safeSettings = normalizeSettings(settings);
  const template = safeSettings.templates[statusCode] || safeSettings.templates.present;
  const body = template
    .replaceAll("{name}", student.name || "학생")
    .replaceAll("{date}", parts.displayDate)
    .replaceAll("{time}", parts.time)
    .replaceAll("{status}", STATUS_LABELS[statusCode] || statusCode)
    .replaceAll("{emoji}", safeSettings.useEmoji ? "😊" : "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  return `[${safeSettings.academyName} 출결 안내]\n\n${body}`;
}

function smsSecret() {
  return String(process.env.ATTENDANCE_SMS_SECRET || process.env.ATTENDANCE_ADMIN_PASSWORD || process.env.SUPABASE_SERVICE_ROLE_KEY || "");
}

export function signSmsRecord(recordId) {
  const secret = smsSecret();
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update(String(recordId)).digest("hex");
}

export function validSmsSignature(recordId, signature) {
  const expected = signSmsRecord(recordId);
  if (!expected || !signature || expected.length !== String(signature).length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
}

export function requireAdmin(req) {
  const configured = String(process.env.ATTENDANCE_ADMIN_PASSWORD || "");
  const supplied = String(req.headers["x-attendance-admin-password"] || "");
  return Boolean(configured && supplied && configured === supplied);
}

export function recordId() {
  return crypto.randomUUID();
}
