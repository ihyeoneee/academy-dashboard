/* ============================================================
   store.js — data model, persistence (server-side JSON file
   under data/store.json so the whole project folder — code +
   data — can be copied or synced to another computer), CSV import
   ============================================================ */

const CLASS_IDS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7"];

function defaultData() {
  const classes = CLASS_IDS.map((id, i) => ({ id, name: `${i + 1}반` }));
  const students = {};
  const attendance = {};
  const homework = {};
  const grades = {};
  CLASS_IDS.forEach((id) => {
    students[id] = [];
    attendance[id] = [];
    homework[id] = [];
    grades[id] = [];
  });
  return { version: 1, classes, students, attendance, homework, grades };
}

const Store = (() => {
  let data = defaultData();
  let saveTimer = null;
  let saveFailed = false;

  // resolved once the initial fetch from data/store.json (via the local
  // dev server) completes; app.js waits on this before first render
  const ready = (async () => {
    try {
      const res = await fetch("/api/data");
      if (res.ok) {
        const parsed = await res.json();
        data = { ...defaultData(), ...parsed };
      }
    } catch (e) {
      console.error("서버에서 데이터를 불러오지 못했습니다. 초기 상태로 시작합니다.", e);
    }
  })();

  function flush() {
    fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
      .then(() => {
        if (saveFailed) {
          saveFailed = false;
          document.dispatchEvent(new CustomEvent("store:save-ok"));
        }
      })
      .catch((e) => {
        console.error("저장 실패:", e);
        saveFailed = true;
        document.dispatchEvent(new CustomEvent("store:save-error"));
      });
  }

  // batches rapid successive writes (e.g. CSV import loops) into one request
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 250);
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  return {
    ready,
    get all() {
      return data;
    },
    getClass(classId) {
      return data.classes.find((c) => c.id === classId);
    },
    renameClass(classId, name) {
      const c = this.getClass(classId);
      if (c) {
        c.name = name;
        save();
      }
    },
    students(classId) {
      return data.students[classId];
    },
    addStudent(classId, student) {
      const row = {
        id: uid(),
        name: "",
        studentPhone: "",
        parentPhone: "",
        parentRelation: "",
        status: "재원",
        ...student,
      };
      data.students[classId].push(row);
      save();
      return row;
    },
    updateStudent(classId, studentId, patch) {
      const row = data.students[classId].find((s) => s.id === studentId);
      if (row) {
        Object.assign(row, patch);
        save();
      }
    },
    removeStudent(classId, studentId) {
      data.students[classId] = data.students[classId].filter((s) => s.id !== studentId);
      // cascade-clean related records so orphans don't linger
      data.attendance[classId] = data.attendance[classId].filter((r) => r.studentId !== studentId);
      data.homework[classId] = data.homework[classId].filter((r) => r.studentId !== studentId);
      data.grades[classId] = data.grades[classId].filter((r) => r.studentId !== studentId);
      save();
    },
    findStudentByName(classId, name) {
      const target = (name || "").trim();
      return data.students[classId].find((s) => s.name.trim() === target);
    },

    attendance(classId) {
      return data.attendance[classId];
    },
    setAttendance(classId, studentId, date, status) {
      const list = data.attendance[classId];
      let row = list.find((r) => r.studentId === studentId && r.date === date);
      if (!row) {
        row = { id: uid(), studentId, date, status };
        list.push(row);
      } else {
        row.status = status;
      }
      save();
    },

    homework(classId) {
      return data.homework[classId];
    },
    setHomework(classId, studentId, date, status, note) {
      const list = data.homework[classId];
      let row = list.find((r) => r.studentId === studentId && r.date === date);
      if (!row) {
        row = { id: uid(), studentId, date, status, note: note || "" };
        list.push(row);
      } else {
        row.status = status;
        row.note = note || "";
      }
      save();
    },

    grades(classId) {
      return data.grades[classId];
    },
    addGrade(classId, grade) {
      const row = { id: uid(), date: "", subject: "", testName: "", score: 0, maxScore: 100, ...grade };
      data.grades[classId].push(row);
      save();
      return row;
    },
    removeGrade(classId, gradeId) {
      data.grades[classId] = data.grades[classId].filter((g) => g.id !== gradeId);
      save();
    },

    importRows(classId, rows) {
      // rows: [{type, ...fields}] already classified; returns a report
      const report = { students: 0, attendance: 0, homework: 0, grades: 0, unmatched: [] };
      rows.forEach((r) => {
        if (r.type === "student") {
          let s = this.findStudentByName(classId, r.name);
          if (!s) s = this.addStudent(classId, { name: r.name });
          this.updateStudent(classId, s.id, {
            studentPhone: r.studentPhone || s.studentPhone,
            parentPhone: r.parentPhone || s.parentPhone,
            parentRelation: r.parentRelation || s.parentRelation,
            status: r.status || s.status,
          });
          report.students++;
        } else if (r.type === "attendance") {
          const s = this.findStudentByName(classId, r.name);
          if (!s) {
            report.unmatched.push(`[출결] ${r.name} (${r.date})`);
            return;
          }
          this.setAttendance(classId, s.id, r.date, r.status);
          report.attendance++;
        } else if (r.type === "homework") {
          const s = this.findStudentByName(classId, r.name);
          if (!s) {
            report.unmatched.push(`[숙제] ${r.name} (${r.date})`);
            return;
          }
          this.setHomework(classId, s.id, r.date, r.status, r.note);
          report.homework++;
        } else if (r.type === "grade") {
          const s = this.findStudentByName(classId, r.name);
          if (!s) {
            report.unmatched.push(`[성적] ${r.name} (${r.date})`);
            return;
          }
          this.addGrade(classId, {
            studentId: s.id,
            date: r.date,
            subject: r.subject,
            testName: r.testName,
            score: Number(r.score) || 0,
            maxScore: Number(r.maxScore) || 100,
          });
          report.grades++;
        }
      });
      return report;
    },

    exportJSON() {
      return JSON.stringify(data, null, 2);
    },
    resetAll() {
      data = defaultData();
      save();
    },
    async restoreFromJSON(text) {
      const parsed = JSON.parse(text);
      data = { ...defaultData(), ...parsed };
      clearTimeout(saveTimer);
      await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    },
  };
})();

/* ---------------- CSV parsing ---------------- */

function parseCSV(text) {
  // strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (ch === "\r") {
        // ignore, \n handles line break
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function csvRowsToObjects(rows) {
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = (r[i] || "").trim()));
    return obj;
  });
}

// classify a parsed CSV (array of row objects) into normalized import rows
function classifyCSV(objects) {
  if (objects.length === 0) return { type: null, rows: [] };
  const headers = new Set(Object.keys(objects[0]));

  if (headers.has("학생연락처") || headers.has("학부모연락처")) {
    return {
      type: "students",
      rows: objects.map((o) => ({
        type: "student",
        name: o["이름"],
        studentPhone: o["학생연락처"],
        parentPhone: o["학부모연락처"],
        parentRelation: o["학부모관계"],
        status: o["상태"],
      })),
    };
  }
  if (headers.has("메모") && headers.has("상태")) {
    return {
      type: "homework",
      rows: objects.map((o) => ({
        type: "homework",
        name: o["이름"],
        date: o["날짜"],
        status: o["상태"],
        note: o["메모"],
      })),
    };
  }
  if (headers.has("점수") || headers.has("만점")) {
    return {
      type: "grades",
      rows: objects.map((o) => ({
        type: "grade",
        name: o["이름"],
        date: o["날짜"],
        subject: o["과목"],
        testName: o["시험명"],
        score: o["점수"],
        maxScore: o["만점"],
      })),
    };
  }
  if (headers.has("상태") && headers.has("날짜")) {
    return {
      type: "attendance",
      rows: objects.map((o) => ({
        type: "attendance",
        name: o["이름"],
        date: o["날짜"],
        status: o["상태"],
      })),
    };
  }
  return { type: null, rows: [] };
}
