import {readPersistentState, writePersistentState} from "../../lib/dashboard-state.js";
import {handleOptions, kakaoOptions, readJson, sendJson, sendSolapiMessages} from "../../lib/solapi.js";

const digits = value => String(value || "").replace(/[^0-9]/g, "");

const KO = {
  present: "\uCD9C\uC11D",
  leave: "\uD558\uC6D0",
  late: "\uC9C0\uAC01",
  absent: "\uACB0\uC11D",
  makeup: "\uBCF4\uAC15",
  student: "\uD559\uC0DD",
  academy: "\uBC8C\uAD50\uBBF8\uB798\uC5D4\uC601\uC5B4",
  none: "\uC5C6\uC74C",
  fail: "\uC2E4\uD328",
  sms: "\uBB38\uC790",
  kakao: "\uCE74\uCE74\uC624",
  test: "\uD14C\uC2A4\uD2B8"
};

const STATUS_LABELS = {
  present: KO.present,
  leave: KO.leave,
  late: KO.late,
  absent: KO.absent,
  makeup: KO.makeup
};

const STATUS_ALIASES = new Map([
  ["present", KO.present],
  ["leave", KO.leave],
  ["late", KO.late],
  ["absent", KO.absent],
  ["makeup", KO.makeup],
  [KO.present, KO.present],
  [KO.leave, KO.leave],
  [KO.late, KO.late],
  [KO.absent, KO.absent],
  [KO.makeup, KO.makeup]
]);

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
  return `\uC548\uB155\uD558\uC138\uC694. ${KO.academy}\uC785\uB2C8\uB2E4.\n\n${studentName} ${KO.student} ${dateText} ${status} \uCC98\uB9AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.\n\uCD9C\uACB0\uC2DC\uAC04: ${timeText}\n\n\uC624\uB298\uB3C4 \uC548\uC804\uD558\uAC8C \uAD00\uB9AC\uD558\uACA0\uC2B5\uB2C8\uB2E4. \uAC10\uC0AC\uD569\uB2C8\uB2E4.`;
}

async function notifyParent(student, status, timeText, dateText) {
  const parentPhone = digits(student.phone || student.parentPhone || student.guardianPhone || student.studentPhone);
  if (parentPhone.length < 10) {
    return {sent: false, channel: KO.none, status: "\uBCF4\uD638\uC790 \uC5F0\uB77D\uCC98 \uC5C6\uC74C"};
  }

  const studentName = student.name || KO.student;
  const body = attendanceMessage(studentName, status, timeText, dateText);
  const variables = {
    "#{\uD559\uC0DD\uBA85}": studentName,
    "#{\uCD9C\uACB0\uC0C1\uD0DC}": status,
    "#{\uCD9C\uACB0\uC2DC\uAC04}": timeText,
    "#{\uB0A0\uC9DC}": dateText,
    "#{\uB0B4\uC6A9}": `${dateText} ${timeText} ${studentName} ${status} \uCC98\uB9AC`,
    "#{\uBCF4\uAC15\uC548\uB0B4}": "\uD544\uC694\uD55C \uACBD\uC6B0 \uD559\uC6D0\uC5D0\uC11C \uBCC4\uB3C4\uB85C \uC548\uB0B4\uB4DC\uB9AC\uACA0\uC2B5\uB2C8\uB2E4."
  };

  try {
    const kind = status === KO.leave ? "leave" : "attendance";
    const result = await sendSolapiMessages(parentPhone, body, kakaoOptions(kind, variables));
    return {sent: true, channel: KO.kakao, status: "\uCE74\uCE74\uC624 \uC811\uC218", result};
  } catch (kakaoError) {
    try {
      const result = await sendSolapiMessages(parentPhone, body);
      return {
        sent: true,
        channel: KO.sms,
        status: "\uBB38\uC790 \uB300\uCCB4\uC811\uC218",
        kakaoError: kakaoError.message,
        result
      };
    } catch (smsError) {
      return {
        sent: false,
        channel: KO.fail,
        status: "\uBC1C\uC1A1\uC2E4\uD328",
        error: smsError.message,
        kakaoError: kakaoError.message
      };
    }
  }
}

function normalizeStatus(data) {
  const raw = String(data.statusCode || data.status || "present").trim();
  return STATUS_ALIASES.get(raw) || raw;
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    return sendJson(res, 405, {ok: false, error: "POST \uC694\uCCAD\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."});
  }

  try {
    const data = await readJson(req);
    const last4 = digits(data.last4).slice(-4);
    const selectedStudentId = String(data.selectedStudentId || data.studentId || "");
    const status = normalizeStatus(data);
    const dryRun = Boolean(data.dryRun);

    if (last4.length !== 4) {
      return sendJson(res, 400, {ok: false, error: "\uD734\uB300\uD3F0 \uBC88\uD638 \uB4B7\uC790\uB9AC 4\uC790\uB9AC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694."});
    }
    if (!STATUS_SET.has(status)) {
      return sendJson(res, 400, {ok: false, error: "\uCD9C\uC11D, \uD558\uC6D0, \uC9C0\uAC01, \uACB0\uC11D, \uBCF4\uAC15 \uC911 \uD558\uB098\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694."});
    }

    const state = await readPersistentState();
    const students = Array.isArray(state.students) ? state.students : [];
    const matches = students.filter(student =>
      phoneCandidates(student).some(phone => phone.slice(-4) === last4)
    );

    if (!matches.length) {
      return sendJson(res, 404, {
        ok: false,
        error: `\uB4B7\uC790\uB9AC ${last4}\uC640 \uC77C\uCE58\uD558\uB294 \uD559\uC0DD\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uD559\uC0DD\uAD00\uB9AC\uC5D0\uC11C \uD559\uC0DD \uC774\uB984\uACFC \uC5F0\uB77D\uCC98\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.`,
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
      return sendJson(res, 404, {ok: false, error: "\uC120\uD0DD\uD55C \uD559\uC0DD \uC815\uBCF4\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4."});
    }

    const date = koreanDate();
    const time = koreanTime();
    const already = student.attendanceDate === date && student.attendance === status;
    const notification = dryRun
      ? {sent: false, channel: KO.test, status: "\uD559\uC0DD \uD655\uC778 \uD14C\uC2A4\uD2B8"}
      : await notifyParent(student, status, time, date);

    if (!dryRun) {
      const updatedStudents = students.map(item => {
        if (String(item.id) !== String(student.id)) return item;
        return {
          ...item,
          attendance: status,
          attendanceDate: date,
          attendanceTime: time,
          reason: "\uD559\uC0DD \uC9C1\uC811 \uCD9C\uACB0",
          parentSent: notification.status
        };
      });

      const attendanceRecords = Array.isArray(state.attendanceRecords) ? [...state.attendanceRecords] : [];
      attendanceRecords.unshift({
        date,
        time,
        studentId: student.id,
        name: student.name,
        status,
        reason: "\uD559\uC0DD \uC9C1\uC811 \uCD9C\uACB0",
        parentSent: notification.status,
        memo: "\uD734\uB300\uD3F0 \uB4B7\uC790\uB9AC \uCD9C\uACB0"
      });

      await writePersistentState({...state, students: updatedStudents, attendanceRecords});
    }

    const result = {
      studentId: student.id,
      name: student.name,
      status,
      date,
      time,
      already,
      dryRun,
      notification
    };

    return sendJson(res, 200, {
      ok: true,
      message: `${student.name} ${KO.student} ${status} \uCC98\uB9AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`,
      student: {id: student.id, name: student.name, status, time},
      notification,
      result
    });
  } catch (error) {
    return sendJson(res, 500, {ok: false, error: error.message || "\uCD9C\uACB0 \uCC98\uB9AC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4."});
  }
}
