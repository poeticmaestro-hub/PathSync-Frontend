
import { useCallback, useEffect, useState, type FormEvent } from "react";
import "./App.css";

type Course = {
  id: number;
  courseCode: string;
  title: string;
  creditHours: number;
};

type CourseForm = {
  courseCode: string;
  title: string;
  creditHours: string;
};

type StudentValidationResponse = {
  valid: boolean;
  message: string;
};

const API_URL = "http://localhost:8083/api/courses";
const STUDENT_API_URL = "http://localhost:8083/api/students";

const EMPTY_FORM: CourseForm = {
  courseCode: "",
  title: "",
  creditHours: "3",
};

const navigation = [
  { icon: "▦", label: "Overview", active: true },
  { icon: "◫", label: "My courses", active: false },
  { icon: "◎", label: "Degree progress", active: false },
  { icon: "◷", label: "GPA planner", active: false },
];

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function App() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [form, setForm] = useState<CourseForm>(EMPTY_FORM);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Student entry: IDs are validated against records stored in PostgreSQL.
  const [studentId, setStudentId] = useState("");
  const [hasEntered, setHasEntered] = useState(false);
  const [idError, setIdError] = useState("");

  const loadCourses = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setLoadError("");

    try {
      const response = await fetch(API_URL, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Could not load courses (${response.status}).`);
      }

      const data: unknown = await response.json();

      if (!Array.isArray(data)) {
        throw new Error("The course service returned an unexpected response.");
      }

      setCourses(data as Course[]);
      return true;
    } catch (error) {
      setLoadError(
        getErrorMessage(error, "Unable to connect to the course service."),
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasEntered) {
      void loadCourses();
    }
  }, [hasEntered, loadCourses]);

  // Validate the entered student ID against the backend.
  const handleStudentIdSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setIdError("");

    const normalizedStudentId = studentId.trim().toUpperCase();

    if (!normalizedStudentId) {
      setIdError("Please enter your student ID.");
      return;
    }

    try {
      const response = await fetch(
        `${STUDENT_API_URL}/validate?studentId=${encodeURIComponent(
          normalizedStudentId,
        )}`,
        {
          headers: { Accept: "application/json" },
        },
      );

      if (response.status === 404) {
        setIdError(
          "That student ID wasn't recognized. Please check it and try again.",
        );
        return;
      }

      if (!response.ok) {
        throw new Error(
          `Student validation failed (${response.status}).`,
        );
      }

      const result: StudentValidationResponse = await response.json();

      if (!result.valid) {
        setIdError(
          "That student ID wasn't recognized. Please check it and try again.",
        );
        return;
      }

      setStudentId(normalizedStudentId);
      setHasEntered(true);
    } catch {
      setIdError(
        "We couldn't connect to student validation. Please make sure the PathSync backend is running and try again.",
      );
    }
  };

  const openAddForm = () => {
    setEditingCourse(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setNotice("");
    setIsFormOpen(true);
  };

  const openEditForm = (course: Course) => {
    setEditingCourse(course);
    setForm({
      courseCode: course.courseCode,
      title: course.title,
      creditHours: String(course.creditHours),
    });
    setFormError("");
    setNotice("");
    setIsFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;

    setIsFormOpen(false);
    setEditingCourse(null);
    setForm(EMPTY_FORM);
    setFormError("");
  };

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setNotice("");

    const courseCode = form.courseCode.trim().toUpperCase();
    const title = form.title.trim();
    const creditHours = Number(form.creditHours);

    if (!courseCode || !title) {
      setFormError("Enter both a course code and a course title.");
      return;
    }

    if (courseCode.length > 20) {
      setFormError("Course codes cannot exceed 20 characters.");
      return;
    }

    if (title.length > 120) {
      setFormError("Course titles cannot exceed 120 characters.");
      return;
    }

    if (
      !Number.isInteger(creditHours) ||
      creditHours < 1 ||
      creditHours > 6
    ) {
      setFormError("Credit hours must be a whole number from 1 to 6.");
      return;
    }

    setSaving(true);

    try {
      const isEditing = editingCourse !== null;
      const url = isEditing
        ? `${API_URL}/${editingCourse.id}`
        : API_URL;

      const response = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          courseCode,
          title,
          creditHours,
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(
          message || `The server rejected the request (${response.status}).`,
        );
      }

      const refreshed = await loadCourses();

      setIsFormOpen(false);
      setEditingCourse(null);
      setForm(EMPTY_FORM);

      if (refreshed) {
        setNotice(
          isEditing
            ? "Course updated successfully."
            : "Course added successfully.",
        );
      } else {
        setNotice(
          "The change was saved, but the course list could not refresh. Try again.",
        );
      }
    } catch (error) {
      setFormError(
        getErrorMessage(error, "The course could not be saved."),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (course: Course) => {
    const confirmed = window.confirm(
      `Delete ${course.courseCode}: ${course.title}?\n\nThis permanently removes the course from the database.`,
    );

    if (!confirmed) return;

    setDeletingId(course.id);
    setNotice("");
    setLoadError("");

    try {
      const response = await fetch(`${API_URL}/${course.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(
          message ||
            `The server could not delete this course (${response.status}).`,
        );
      }

      const refreshed = await loadCourses();

      setNotice(
        refreshed
          ? `${course.courseCode} was deleted.`
          : `${course.courseCode} was deleted, but the course list could not refresh. Try again.`,
      );
    } catch (error) {
      setNotice(
        `Delete failed: ${getErrorMessage(
          error,
          "The course could not be deleted.",
        )}`,
      );
    } finally {
      setDeletingId(null);
    }
  };

  const totalCourseCredits = courses.reduce(
    (total, course) => total + (Number(course.creditHours) || 0),
    0,
  );

  if (!hasEntered) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "32px 20px",
          boxSizing: "border-box",
          background:
            "radial-gradient(circle at 15% 10%, rgba(99, 102, 241, 0.22), transparent 35%), linear-gradient(135deg, #0b1224 0%, #111c35 55%, #182544 100%)",
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          color: "#172033",
        }}
      >
        <section
          aria-labelledby="student-entry-title"
          style={{
            width: "100%",
            maxWidth: "460px",
            padding: "clamp(28px, 6vw, 48px)",
            boxSizing: "border-box",
            border: "1px solid rgba(255,255,255,0.72)",
            borderRadius: "24px",
            background: "rgba(255,255,255,0.97)",
            boxShadow: "0 28px 90px rgba(0,0,0,0.28)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "38px",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                display: "grid",
                placeItems: "center",
                width: "48px",
                height: "48px",
                borderRadius: "15px",
                background: "linear-gradient(135deg, #6366f1, #818cf8)",
                color: "#fff",
                fontSize: "25px",
                fontWeight: 800,
                boxShadow: "0 8px 20px rgba(99,102,241,0.25)",
              }}
            >
              P
            </div>

            <div>
              <div
                style={{
                  fontSize: "25px",
                  lineHeight: 1.1,
                  fontWeight: 800,
                  letterSpacing: "-1px",
                  color: "#121a2e",
                }}
              >
                pathsync
              </div>
              <div
                style={{
                  marginTop: "5px",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "1.7px",
                  color: "#7b8499",
                }}
              >
                YOUR ACADEMIC COMPASS
              </div>
            </div>
          </div>

          <div
            style={{
              marginBottom: "10px",
              color: "#6366f1",
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "1.8px",
            }}
          >
            WELCOME TO YOUR WORKSPACE
          </div>

          <h1
            id="student-entry-title"
            style={{
              margin: "0 0 12px",
              fontSize: "clamp(28px, 5vw, 36px)",
              lineHeight: 1.15,
              letterSpacing: "-1.3px",
              color: "#151d32",
            }}
          >
            Your journey, in focus.
          </h1>

          <p
            style={{
              margin: "0 0 30px",
              color: "#68738a",
              fontSize: "15px",
              lineHeight: 1.7,
            }}
          >
            Enter your student ID to continue to your academic dashboard.
          </p>

          <form onSubmit={handleStudentIdSubmit}>
            <label
              htmlFor="student-id"
              style={{
                display: "block",
                marginBottom: "9px",
                fontSize: "13px",
                fontWeight: 700,
                color: "#27324a",
              }}
            >
              Student ID
            </label>

            <input
              id="student-id"
              name="studentId"
              type="text"
              autoComplete="off"
              autoFocus
              required
              value={studentId}
              onChange={(event) => {
                setStudentId(event.target.value);
                if (idError) setIdError("");
              }}
              placeholder="Enter your student ID"
              aria-invalid={Boolean(idError)}
              aria-describedby={
                idError ? "student-id-error" : "student-id-help"
              }
              style={{
                width: "100%",
                boxSizing: "border-box",
                minHeight: "52px",
                padding: "0 15px",
                border: idError ? "1px solid #dc2626" : "1px solid #d9deea",
                borderRadius: "12px",
                outline: "none",
                background: "#fff",
                color: "#172033",
                fontSize: "15px",
              }}
            />

            {idError ? (
              <p
                id="student-id-error"
                role="alert"
                style={{
                  margin: "9px 0 0",
                  color: "#b91c1c",
                  fontSize: "13px",
                  lineHeight: 1.5,
                }}
              >
                {idError}
              </p>
            ) : (
              <p
                id="student-id-help"
                style={{
                  margin: "9px 0 0",
                  color: "#8a93a7",
                  fontSize: "12px",
                }}
              >
                Enter a student ID registered in PathSync.
              </p>
            )}

            <button
              type="submit"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                width: "100%",
                minHeight: "52px",
                marginTop: "24px",
                padding: "0 18px",
                border: 0,
                borderRadius: "12px",
                background: "linear-gradient(100deg, #5855e7, #7774f5)",
                boxShadow: "0 10px 22px rgba(99,102,241,0.22)",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 750,
                cursor: "pointer",
              }}
            >
              Continue to dashboard <span aria-hidden="true">→</span>
            </button>
          </form>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginTop: "28px",
              paddingTop: "18px",
              borderTop: "1px solid #edf0f6",
              color: "#8a93a7",
              fontSize: "11px",
              lineHeight: 1.6,
            }}
          >
            <span
              aria-hidden="true"
              style={{ color: "#6366f1", fontSize: "16px" }}
            >
              ✦
            </span>
            This is a demonstration entry screen, not secure authentication.
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="PathSync home">
          <span className="brand-mark">P</span>
          <span>
            <strong>pathsync</strong>
            <small>YOUR ACADEMIC COMPASS</small>
          </span>
        </a>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="navigation" aria-label="Main navigation">
          {navigation.map((item) => (
            <a
              key={item.label}
              href={`#${item.label.toLowerCase().replaceAll(" ", "-")}`}
              className={`nav-item ${item.active ? "active" : ""}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.active && <span className="active-indicator" />}
            </a>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-spark">✳</span>
            <strong>Your next chapter starts here.</strong>
            <p>Small steps today. Big possibilities tomorrow.</p>
          </div>

          <div className="profile">
            <div className="avatar">S</div>
            <div className="profile-copy">
              <strong>Student workspace</strong>
              <span>Academic planner</span>
            </div>
            <span className="profile-menu">···</span>
          </div>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>Overview</strong>
          </div>
          <div className="topbar-right">
            <span className="term-pill">
              <span className="status-dot" />
              Academic workspace
            </span>
            <button className="icon-button" aria-label="Notifications">
              ♧
            </button>
          </div>
        </header>

        <section className="welcome-section">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-line" />
              YOUR JOURNEY, IN FOCUS
            </div>
            <h1>
              Make your next move<span>.</span>
            </h1>
            <p className="welcome-copy">
              Your goals deserve a plan. Let’s make every credit count.
            </p>
          </div>

          <button
            className="primary-button"
            onClick={() =>
              document.getElementById("course-planner")?.scrollIntoView({
                behavior: "smooth",
              })
            }
          >
            <span>＋</span> Explore your plan
          </button>
        </section>

        <section className="stats-grid" aria-label="Academic overview">
          <article className="stat-card degree-card">
            <div className="stat-heading">
              <span>Degree progress</span>
              <span className="stat-icon purple-icon">↗</span>
            </div>

            <div className="degree-stat">
              <div>
                <strong className="stat-number">
                  68<span>%</span>
                </strong>
                <p className="stat-caption">Demo degree progress</p>
              </div>

              <div
                className="progress-ring"
                role="img"
                aria-label="Illustrative demo progress of 68 percent"
              >
                <div className="ring-center">
                  <strong>68%</strong>
                  <span>demo</span>
                </div>
              </div>
            </div>

            <div className="progress-track">
              <div className="progress-fill" style={{ width: "68%" }} />
            </div>

            <div className="stat-footer">
              <span>Demo credits earned</span>
              <strong>
                41 <span>/ 60</span>
              </strong>
            </div>
          </article>

          <article className="stat-card">
            <div className="stat-heading">
              <span>Current GPA</span>
              <span className="stat-icon blue-icon">✳</span>
            </div>

            <div className="stat-number gpa-number">3.28</div>
            <p className="stat-caption">
              Illustrative GPA, not yet calculated
            </p>

            <div className="mini-chart" aria-label="Illustrative GPA trend">
              {[32, 46, 39, 58, 51, 69, 62, 83, 74, 94, 80, 100].map(
                (height, index) => (
                  <span
                    key={index}
                    style={{ height: `${height}%` }}
                    className={
                      index === 11
                        ? "chart-bar chart-bar-current"
                        : "chart-bar"
                    }
                  />
                ),
              )}
            </div>

            <div className="stat-footer">
              <span>Academic focus</span>
              <strong className="neutral-label">Keep building</strong>
            </div>
          </article>

          <article className="stat-card">
            <div className="stat-heading">
              <span>Saved course credits</span>
              <span className="stat-icon amber-icon">⌁</span>
            </div>

            <div className="stat-number">
              {loading ? "…" : totalCourseCredits}
              <span className="number-unit"> credits</span>
            </div>

            <p className="stat-caption">
              Combined credits across saved courses
            </p>

            <div className="credit-visual">
              {Array.from({ length: 6 }, (_, index) => (
                <div
                  key={index}
                  className={`credit-block ${
                    index < Math.min(totalCourseCredits, 6) ? "filled" : ""
                  }`}
                />
              ))}
            </div>

            <div className="stat-footer">
              <span>Saved courses</span>
              <strong>{loading ? "Loading…" : courses.length}</strong>
            </div>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel courses-panel" id="course-planner">
            <div className="panel-header">
              <div>
                <div className="eyebrow">YOUR ACADEMIC ROADMAP</div>
                <h2>Course planner</h2>
                <p>Manage your courses in one place.</p>
              </div>

              <button
                className="text-button"
                onClick={() =>
                  document.getElementById("course-list")?.scrollIntoView({
                    behavior: "smooth",
                  })
                }
              >
                View courses <span>↗</span>
              </button>
            </div>

            {notice && (
              <div className="pathsync-notice" role="status">
                <span>✓</span> {notice}
                <button
                  type="button"
                  aria-label="Dismiss message"
                  onClick={() => setNotice("")}
                >
                  ×
                </button>
              </div>
            )}

            {loadError && (
              <div className="pathsync-error" role="alert">
                <span>{loadError}</span>
                <button type="button" onClick={() => void loadCourses()}>
                  Retry
                </button>
              </div>
            )}

            <div className="course-list" id="course-list">
              {loading && (
                <div className="course-empty" role="status">
                  Loading your courses…
                </div>
              )}

              {!loading && !loadError && courses.length === 0 && (
                <div className="course-empty">
                  <strong>
                    Your course list is ready for its first entry.
                  </strong>
                  <span>
                    Add a course to start building your academic plan.
                  </span>
                </div>
              )}

              {!loading &&
                courses.map((course, index) => {
                  const tones = ["violet", "blue", "amber"];

                  return (
                    <div className="course-row" key={course.id}>
                      <div
                        className={`course-number ${
                          tones[index % tones.length]
                        }`}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </div>

                      <div className="course-details">
                        <strong>{course.title}</strong>
                        <span>
                          {course.courseCode}
                          <span className="course-dot"> · </span>
                          {course.creditHours} credit hours
                        </span>
                      </div>

                      <span className="course-status">
                        <span className="status-dot" />
                        Saved course
                      </span>

                      <div className="course-actions">
                        <button
                          type="button"
                          className="course-action-button"
                          aria-label={`Edit ${course.courseCode}`}
                          title="Edit course"
                          onClick={() => openEditForm(course)}
                        >
                          ✎
                        </button>

                        <button
                          type="button"
                          className="course-action-button delete-action"
                          aria-label={`Delete ${course.courseCode}`}
                          title="Delete course"
                          disabled={deletingId === course.id}
                          onClick={() => void handleDelete(course)}
                        >
                          {deletingId === course.id ? "…" : "×"}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            <button
              className="add-course-button"
              onClick={openAddForm}
              disabled={loading}
            >
              <span>＋</span> Add a course
            </button>
          </article>

          <aside className="panel focus-panel">
            <div className="focus-top">
              <span className="focus-icon">✳</span>
              <span className="focus-label">YOUR NEXT MILESTONE</span>
            </div>

            <h2>One step closer.</h2>
            <p className="focus-description">
              Every course completed is progress you can build on. Keep your
              plan aligned with your degree requirements.
            </p>

            <div className="milestone-box">
              <span className="milestone-label">DATABASE SNAPSHOT</span>
              <strong>
                {loading
                  ? "Loading…"
                  : `${courses.length} ${
                      courses.length === 1 ? "course" : "courses"
                    }`}
              </strong>

              <div className="milestone-track">
                <div
                  style={{
                    width: `${Math.min(courses.length, 10) * 10}%`,
                  }}
                />
              </div>

              <div className="milestone-foot">
                <span>{totalCourseCredits} saved credit hours</span>
                <span>Live API data</span>
              </div>
            </div>

            <div className="focus-note">
              <span>✦</span>
              <p>
                Progress isn't about perfection. It's about knowing your next
                move.
              </p>
            </div>
          </aside>
        </section>

        <footer className="dashboard-footer">
          <span>
            <span className="footer-mark">P</span> PATHSYNC{" "}
            <span className="footer-divider">/</span> YOUR FUTURE, IN FOCUS.
          </span>
          <span>
            COURSES CONNECTED · GPA AND DEGREE METRICS ARE DEMO DATA
          </span>
        </footer>
      </main>

      {isFormOpen && (
        <div
          className="course-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
        >
          <section
            className="course-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="course-modal-title"
          >
            <div className="course-modal-header">
              <div>
                <div className="eyebrow">COURSE MANAGEMENT</div>
                <h2 id="course-modal-title">
                  {editingCourse ? "Edit course" : "Add a course"}
                </h2>
                <p>
                  {editingCourse
                    ? "Update the course details below."
                    : "Add a course to your saved academic plan."}
                </p>
              </div>

              <button
                type="button"
                className="course-modal-close"
                aria-label="Close form"
                disabled={saving}
                onClick={closeForm}
              >
                ×
              </button>
            </div>

            <form className="course-form" onSubmit={handleFormSubmit}>
              <label htmlFor="course-code">Course code</label>
              <input
                id="course-code"
                name="courseCode"
                value={form.courseCode}
                onChange={(event) =>
                  setForm({ ...form, courseCode: event.target.value })
                }
                placeholder="e.g. COSC 1436"
                maxLength={20}
                required
              />

              <label htmlFor="course-title">Course title</label>
              <input
                id="course-title"
                name="title"
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                placeholder="e.g. Programming Fundamentals I"
                maxLength={120}
                required
              />

              <label htmlFor="credit-hours">Credit hours</label>
              <select
                id="credit-hours"
                name="creditHours"
                value={form.creditHours}
                onChange={(event) =>
                  setForm({ ...form, creditHours: event.target.value })
                }
                required
              >
                {[1, 2, 3, 4, 5, 6].map((hours) => (
                  <option key={hours} value={hours}>
                    {hours} {hours === 1 ? "credit hour" : "credit hours"}
                  </option>
                ))}
              </select>

              {formError && (
                <div className="course-form-error" role="alert">
                  {formError}
                </div>
              )}

              <div className="course-form-actions">
                <button
                  type="button"
                  className="course-cancel-button"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="course-save-button"
                  disabled={saving}
                >
                  {saving
                    ? "Saving…"
                    : editingCourse
                      ? "Save changes"
                      : "Add course"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;

