import {readPersistentState, writePersistentState} from "../_dashboard-state.js";
import {handleOptions, kakaoOptions, readJson, sendJson, sendSolapiMessages} from "../_solapi.js";

const digits = value => String(value || "").replace(/[^0-9]/g, "");

const STATUS_LABELS = {
  present: "출석",
  leave: "하원",
  late: "지각",
  absent: "결석",
  makeup: "보강"
};

const STATUS_SET = new Set(Object.values(STATUS_LABELS));

const koreanDate = () => new Date().toLocaleDateString("en-CA", {timeZone: "Asia/Seoul"});
const koreanTime = () => new Date().toLocaleTimeString("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

function phoneCandidates(student) {
  return [
    student.studentPhone,
    student.phone,
    student.parentPhone,
    student.guardianPhone,
    student.mobile,
    student.contact
  ].map(digits).filter(value => value.length >= 4);
}

function attendanceMessage(studentName, status, timeText, dateText) {
  return `안녕하세요. 벌교미래엔영어입니다.\n\n${studentName} 학생 ${dateText} ${status} 처리되었습니다.\n출결시간: ${timeText}\n\n오늘도 안전하게 관리하겠습니다. 감사합니다.`;
}

async function notifyParent(student, status, timeText, dateText) {
  const parentPhone = digits(student.phone || student.parentPhone || student.guardianPhone || student.studentPhone);
  if (parentPhone.length < 10) {
    return {sent: false, channel: "없음", status: "보호자 연락처 없음"};
  }

  const senderPhone = digits(process.env.SOLAPI_FROM || "");
  if (senderPhone && senderPhone === parentPhone) {
    return {
      sent: false,
      channel: "",
      status: "발신번호와 수신번호 동일",
      error: "SOLAPI 발신번호와 보호자 수신번호가 같습니다. 같은 번호로는 실제 도착 테스트가 실패할 수 있습니다."
    };
  }

  const body = attendanceMessage(student.name || "학생", status, timeText, dateText);
  const variables = {
    "#{학생명}": student.name || "학생",
    "#{출결상태}": status,
    "#{출결시간}": timeText,
    "#{날짜}": dateText,
    "#{내용}": `${dateText} ${timeText} 학생 휴대폰 출결체크 자동 기록`,
    "#{보강안내}": "필요한 경우 학원에서 별도로 안내드리겠습니다."
  };

  try {
    const kind = status === "하원" ? "leave" : "attendance";
    const result = await sendSolapiMessages(parentPhone, body, kakaoOptions(kind, variables));
    return {sent: true, channel: "카카오", status: "카카오 접수", result};
  } catch (kakaoError) {
    try {
      const result = await sendSolapiMessages(parentPhone, body);
      return {sent: true, channel: "문자", status: "문자 대체접수", kakaoError: kakaoError.message, result};
    } catch (smsError) {
      return {
        sent: false,
        channel: "실패",
        status: "발송실패",
        error: smsError.message,
        kakaoError: kakaoError.message
      };
    }
  }
}

function normalizeStatus(data) {
  const raw = String(data.statusCode || data.status || "present").trim();
  return STATUS_LABELS[raw] || raw;
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    return sendJson(res, 405, {ok: false, error: "POST 요청만 사용할 수 있습니다."});
  }

  try {
    const data = await readJson(req);
    const last4 = digits(data.last4).slice(-4);
    const selectedStudentId = String(data.selectedStudentId || data.studentId || "");
    const status = normalizeStatus(data);
    const dryRun = Boolean(data.dryRun);

    if (last4.length !== 4) {
      return sendJson(res, 400, {ok: false, error: "휴대폰 번호 뒷자리 4자리를 입력해 주세요."});
    }
    if (!STATUS_SET.has(status)) {
      return sendJson(res, 400, {ok: false, error: "출석, 하원, 지각, 결석, 보강 중 하나를 선택해 주세요."});
    }

    const state = await readPersistentState();
    const students = Array.isArray(state.students) ? state.students : [];
    const matches = students.filter(student =>
      phoneCandidates(student).some(phone => phone.slice(-4) === last4)
    );

    if (!matches.length) {
      return sendJson(res, 404, {
        ok: false,
        error: `뒷자리 ${last4}와 일치하는 학생을 찾지 못했습니다. 대시보드 학생관리에서 학생 휴대폰 또는 학부모 연락처를 확인해 주세요.`,
        result: {last4, searchedStudents: students.length}
      });
    }

    if (matches.length > 1 && !selectedStudentId) {
      const choices = matches.map(student => ({
        id: student.id,
        studentId: student.id,
        name: student.name,
        classGroup: student.classGroup || student.grade || "",
        school: student.school || "",
        phoneLast4: phoneCandidates(student)[0]?.slice(-4) || last4
      }));
      return sendJson(res, 200, {
        ok: true,
        needSelect: true,
        needsSelection: true,
        choices,
        result: {needsSelection: true, last4, status, choices}
      });
    }

    const student = selectedStudentId
      ? matches.find(item => String(item.id) === selectedStudentId)
      : matches[0];

    if (!student) {
      return sendJson(res, 404, {ok: false, error: "선택한 학생 정보를 찾지 못했습니다."});
    }

    const date = koreanDate();
    const time = koreanTime();
    const already = student.attendanceDate === date && student.attendance === status;
    const notification = dryRun || already
      ? {sent: false, channel: dryRun ? "테스트" : "생략", status: dryRun ? "학생 확인 테스트" : "중복 출결, 발송 생략"}
      : await notifyParent(student, status, time, date);

    if (!dryRun) {
      const updatedStudents = students.map(item => {
        if (String(item.id) !== String(student.id)) return item;
        return {
          ...item,
          attendance: status,
          attendanceDate: date,
          attendanceTime: already ? (item.attendanceTime || time) : time,
          reason: "학생 직접 출결",
          parentSent: notification.status
        };
      });

      const attendanceRecords = Array.isArray(state.attendanceRecords) ? [...state.attendanceRecords] : [];
      if (!already) {
        attendanceRecords.unshift({
          date,
          time,
          studentId: student.id,
          name: student.name,
          status,
          reason: "학생 직접 출결",
          parentSent: notification.status,
          memo: "휴대폰 뒷자리 출결"
        });
      }

      await writePersistentState({...state, students: updatedStudents, attendanceRecords});
    }

    const result = {
      studentId: student.id,
      name: student.name,
      status,
      date,
      time: already ? (student.attendanceTime || time) : time,
      already,
      dryRun,
      notification
    };

    return sendJson(res, 200, {
      ok: true,
      message: `${student.name} 학생 ${status} 처리되었습니다.`,
      student: {id: student.id, name: student.name, status, time: result.time},
      notification,
      result
    });
  } catch (error) {
    return sendJson(res, 500, {ok: false, error: error.message || "출결 처리에 실패했습니다."});
  }
}
