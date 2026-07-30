import {readPersistentState, writePersistentState} from "../_dashboard-state.js";
import {handleOptions, kakaoOptions, readJson, sendJson, sendSolapiMessages} from "../_solapi.js";

const digits = value => String(value || "").replace(/[^0-9]/g, "");
const koreanDate = () => new Date().toLocaleDateString("en-CA", {timeZone: "Asia/Seoul"});
const koreanTime = () => new Date().toLocaleTimeString("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

function attendanceMessage(studentName, status, timeText, dateText) {
  return `안녕하세요. 벌교미래엔영어입니다.\n\n${studentName} 학생 ${dateText} ${status} 처리되었습니다.\n출결시간: ${timeText}\n\n오늘도 안전하게 관리하겠습니다. 감사합니다.`;
}

async function notifyParent(student, status, timeText, dateText) {
  const parentPhone = digits(student.phone);
  if (parentPhone.length < 10) {
    return {sent: false, channel: "없음", status: "보호자 연락처 없음"};
  }

  const body = attendanceMessage(student.name || "학생", status, timeText, dateText);
  const variables = {
    "#{학생명}": student.name || "학생",
    "#{출결상태}": status,
    "#{출결시간}": timeText,
    "#{날짜}": dateText
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
      const combined = `${kakaoError.message || ""} ${smsError.message || ""}`;
      const status = combined.includes("Vercel 환경변수") ? "Vercel SOLAPI 설정 필요" : "발송실패";
      return {sent: false, channel: "??", status, error: smsError.message, kakaoError: kakaoError.message};
    }
  }
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
    const rawStatus = String(data.statusCode || data.status || "출석").trim();
    const status = {
      present: "출석",
      leave: "하원",
      late: "지각",
      absent: "결석",
      makeup: "보강"
    }[rawStatus] || rawStatus;

    if (last4.length !== 4) {
      return sendJson(res, 400, {ok: false, error: "휴대폰 번호 뒷자리 4자리를 입력해주세요."});
    }
    if (!["출석", "하원", "지각", "결석", "보강"].includes(status)) {
      return sendJson(res, 400, {ok: false, error: "출석, 하원, 지각, 결석, 보강 중 하나를 선택해주세요."});
    }

    const state = await readPersistentState();
    const students = Array.isArray(state.students) ? state.students : [];
    const matches = students.filter(student => {
      const studentPhone = digits(student.studentPhone || student.phone);
      return studentPhone.slice(-4) === last4;
    });

    if (!matches.length) {
      return sendJson(res, 404, {ok: false, error: "해당 뒷자리와 일치하는 학생을 찾지 못했습니다."});
    }

    if (matches.length > 1 && !selectedStudentId) {
      const choices = matches.map(student => ({
        id: student.id,
        studentId: student.id,
        name: student.name,
        classGroup: student.classGroup || student.grade || "",
        school: student.school || ""
      }));
      return sendJson(res, 200, {
        ok: true,
        needSelect: true,
        needsSelection: true,
        choices,
        result: {
          needsSelection: true,
          last4,
          status,
          choices
        }
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
    const notification = already
      ? {sent: false, channel: "생략", status: "중복 출결, 발송 생략"}
      : await notifyParent(student, status, time, date);

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

    const result = {
      studentId: student.id,
      name: student.name,
      status,
      date,
      time: already ? (student.attendanceTime || time) : time,
      already,
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
