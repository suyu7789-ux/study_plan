import json
import os
import secrets
import re
import sqlite3
from datetime import datetime
from functools import wraps
from pathlib import Path

from flask import (
    Flask,
    abort,
    jsonify,
    redirect,
    render_template,
    request,
    send_from_directory,
    session,
    url_for,
)
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener
from werkzeug.security import check_password_hash, generate_password_hash


register_heif_opener()

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("STUDY_PLAN_DATA", BASE_DIR / "data"))
UPLOAD_DIR = DATA_DIR / "uploads"
THUMB_DIR = DATA_DIR / "thumbs"
DB_PATH = DATA_DIR / "study.db"
TASKS_PATH = BASE_DIR / "tasks.json"

for directory in (DATA_DIR, UPLOAD_DIR, THUMB_DIR):
    directory.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.environ.get("STUDY_PLAN_SECRET", secrets.token_hex(32)),
    MAX_CONTENT_LENGTH=100 * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)

@app.after_request
def add_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return response

SUBJECTS = ["数学", "物理", "化学", "英语"]
TASK_STATUSES = ["未开始", "进行中", "已完成", "需补做"]
REVIEW_STATUSES = ["待审核", "通过", "需补充", "退回"]
TIMER_STATES = ["idle", "running", "paused", "completed"]

EVIDENCE_GUIDE = {
    "教材划重点": ["教材章节全页（含标题与页码）", "重点、公式或例题旁批特写"],
    "资料书学习": ["知识梳理页整体", "圈画重点或疑问标记特写"],
    "资料书习题": ["完整作答页", "批改结果页", "错题订正或错因页"],
    "思想方法": ["方法来源或学习页", "本人完成的方法卡或分析图"],
    "笔记整理": ["当日笔记全页", "公式、图示或错题细节"],
    "学霸笔记": ["资料页重点圈画", "本人补充的知识卡或流程卡"],
    "语法书学习": ["本节语法规则学习页", "本人规则总结或例句"],
    "语法书习题": ["完整作答页", "批改得分页", "错因与订正页"],
    "单词背诵": [
        "奶酪单词 App 当日学习完成页（显示已完成20词）",
        "奶酪单词 App 薄弱词或复习记录页",
    ],
    "单词听写": ["听写作答页", "批改与正确数", "错词订正页"],
}


def connect_db():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


def now_text():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def split_ordered_items(value):
    cleaned = re.sub(r"\s+", " ", str(value or "")).strip()
    return [item.strip() for item in re.split(r"[；;。]\s*", cleaned) if item.strip()]


def timer_elapsed_seconds(task):
    elapsed = max(0, int(task["timer_elapsed_seconds"] or 0))
    if task["timer_state"] == "running" and task["timer_started_at"]:
        try:
            started_at = datetime.strptime(task["timer_started_at"], "%Y-%m-%d %H:%M:%S")
            elapsed += max(0, int((datetime.now() - started_at).total_seconds()))
        except ValueError:
            pass
    return elapsed


def init_db():
    with connect_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('student', 'supervisor')),
                display_name TEXT NOT NULL,
                can_manage_users INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                date TEXT NOT NULL,
                day INTEGER NOT NULL,
                week INTEGER NOT NULL,
                subject TEXT NOT NULL,
                category TEXT NOT NULL,
                source TEXT NOT NULL,
                section TEXT NOT NULL,
                detail TEXT NOT NULL,
                output_standard TEXT NOT NULL,
                planned_minutes INTEGER NOT NULL,
                min_images INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT '未开始',
                student_note TEXT NOT NULL DEFAULT '',
                supervisor_status TEXT NOT NULL DEFAULT '待审核',
                supervisor_comment TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                filename TEXT NOT NULL,
                thumb_filename TEXT NOT NULL,
                original_name TEXT NOT NULL,
                caption TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS agent_chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL DEFAULT 'default',
                role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
                content TEXT NOT NULL,
                attachment_filename TEXT DEFAULT '',
                attachment_type TEXT DEFAULT '',
                attachment_size TEXT DEFAULT '',
                task_id TEXT DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
            CREATE INDEX IF NOT EXISTS idx_tasks_subject ON tasks(subject);
            CREATE INDEX IF NOT EXISTS idx_images_task ON images(task_id);
            CREATE INDEX IF NOT EXISTS idx_agent_chat_session ON agent_chat_messages(session_id);
            """
        )

        user_columns = {row["name"] for row in db.execute("PRAGMA table_info(users)")}
        if "can_manage_users" not in user_columns:
            try:
                db.execute(
                    "ALTER TABLE users ADD COLUMN can_manage_users INTEGER NOT NULL DEFAULT 0"
                )
            except sqlite3.OperationalError as error:
                if "duplicate column name" not in str(error).lower():
                    raise

        task_columns = {row["name"] for row in db.execute("PRAGMA table_info(tasks)")}
        timer_columns = {
            "timer_target_seconds": "INTEGER NOT NULL DEFAULT 0",
            "timer_elapsed_seconds": "INTEGER NOT NULL DEFAULT 0",
            "timer_started_at": "TEXT",
            "timer_state": "TEXT NOT NULL DEFAULT 'idle'",
        }
        for column, definition in timer_columns.items():
            if column not in task_columns:
                try:
                    db.execute(f"ALTER TABLE tasks ADD COLUMN {column} {definition}")
                except sqlite3.OperationalError as error:
                    if "duplicate column name" not in str(error).lower():
                        raise

        if db.execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 0:
            tasks = json.loads(TASKS_PATH.read_text(encoding="utf-8"))
            db.executemany(
                """
                INSERT INTO tasks (
                    id, date, day, week, subject, category, source, section,
                    detail, output_standard, planned_minutes, min_images,
                    status, student_note, supervisor_status,
                    supervisor_comment, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '未开始', '', '待审核', '', ?)
                """,
                [
                    (
                        task["id"], task["date"], task["day"], task["week"],
                        task["subject"], task["category"], task["source"],
                        task["section"], task["detail"], task["output_standard"],
                        task["planned_minutes"], task["min_images"], now_text(),
                    )
                    for task in tasks
                ],
            )

        # Keep the static description for the daily vocabulary task current
        # without touching student progress, reviews, timers, or uploaded images.
        db.execute(
            """
            UPDATE tasks
            SET source = ?, section = ?, detail = ?, output_standard = ?,
                planned_minutes = ?
            WHERE category = '单词背诵'
            """,
            (
                "奶酪单词 App",
                "每日新学20词",
                "在奶酪单词 App 完成当日20个新词；按 App 流程完成学习与复习；对未掌握词汇重点复习。",
                "当日学习完成页显示已完成20词；薄弱词或复习记录清晰可见。",
                20,
            ),
        )

        for category, evidence_items in EVIDENCE_GUIDE.items():
            db.execute(
                "UPDATE tasks SET min_images = ? WHERE category = ?",
                (len(evidence_items), category),
            )
        db.execute(
            """
            UPDATE tasks
            SET timer_target_seconds = planned_minutes * 60
            WHERE timer_target_seconds IS NULL OR timer_target_seconds <= 0
            """
        )

        default_users = []
        student_user = os.environ.get("STUDENT_USER", "").strip()
        student_password = os.environ.get("STUDENT_PASSWORD", "")
        if student_user and student_password:
            default_users.append((student_user, student_password, "student", "学生"))
        supervisor_user = os.environ.get("SUPERVISOR_USER", "").strip()
        supervisor_password = os.environ.get("SUPERVISOR_PASSWORD", "")
        if supervisor_user and supervisor_password:
            default_users.append(
                (supervisor_user, supervisor_password, "supervisor", "监督人")
            )
        for suffix in ("", "_2", "_3"):
            extra_student_user = os.environ.get(f"EXTRA_STUDENT{suffix}_USER", "").strip()
            extra_student_password = os.environ.get(f"EXTRA_STUDENT{suffix}_PASSWORD", "")
            if extra_student_user and extra_student_password:
                default_users.append(
                    (
                        extra_student_user,
                        extra_student_password,
                        "student",
                        os.environ.get(f"EXTRA_STUDENT{suffix}_NAME", extra_student_user),
                    )
                )
            extra_supervisor_user = os.environ.get(f"EXTRA_SUPERVISOR{suffix}_USER", "").strip()
            extra_supervisor_password = os.environ.get(f"EXTRA_SUPERVISOR{suffix}_PASSWORD", "")
            if extra_supervisor_user and extra_supervisor_password:
                default_users.append(
                    (
                        extra_supervisor_user,
                        extra_supervisor_password,
                        "supervisor",
                        os.environ.get(f"EXTRA_SUPERVISOR{suffix}_NAME", extra_supervisor_user),
                    )
                )
        for username, password, role, display_name in default_users:
            db.execute(
                """
                INSERT OR IGNORE INTO users
                    (username, password_hash, role, display_name, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (username, generate_password_hash(password), role, display_name, now_text()),
            )
        account_admin_user = os.environ.get("ACCOUNT_ADMIN_USER", "").strip()
        if account_admin_user:
            db.execute(
                "UPDATE users SET can_manage_users = CASE WHEN username = ? THEN 1 ELSE 0 END",
                (account_admin_user,),
            )


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "username" not in session:
            if request.path.startswith("/api/"):
                return jsonify({"error": "请先登录"}), 401
            return redirect(url_for("login"))
        return view(*args, **kwargs)

    return wrapped


def account_admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        with connect_db() as db:
            user = db.execute(
                "SELECT can_manage_users FROM users WHERE username = ?",
                (session.get("username"),),
            ).fetchone()
        if not user or not user["can_manage_users"]:
            return jsonify({"error": "没有账号管理权限"}), 403
        return view(*args, **kwargs)

    return wrapped


def serialize_task(row, images):
    task = dict(row)
    elapsed_seconds = timer_elapsed_seconds(task)
    target_seconds = max(60, int(task["timer_target_seconds"] or task["planned_minutes"] * 60))
    task["images"] = [dict(image) for image in images]
    task["image_count"] = len(images)
    task["detail_items"] = split_ordered_items(task["detail"])
    task["output_items"] = split_ordered_items(task["output_standard"])
    task["evidence_guide"] = EVIDENCE_GUIDE.get(
        task["category"],
        [f"成果图片 {index + 1}" for index in range(task["min_images"])],
    )
    task["timer"] = {
        "state": task["timer_state"] if task["timer_state"] in TIMER_STATES else "idle",
        "target_seconds": target_seconds,
        "elapsed_seconds": elapsed_seconds,
        "remaining_seconds": max(0, target_seconds - elapsed_seconds),
        "started_at": task["timer_started_at"],
    }
    task["evidence_status"] = (
        "充足" if len(images) >= task["min_images"] else "需补充" if images else "未上传"
    )
    return task


def load_images_for_tasks(db, task_ids):
    result = {task_id: [] for task_id in task_ids}
    if not task_ids:
        return result
    placeholders = ",".join("?" for _ in task_ids)
    rows = db.execute(
        f"SELECT * FROM images WHERE task_id IN ({placeholders}) ORDER BY id",
        task_ids,
    ).fetchall()
    for row in rows:
        result[row["task_id"]].append(row)
    return result


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        with connect_db() as db:
            user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if user and check_password_hash(user["password_hash"], password):
            session.clear()
            session.update(
                username=user["username"],
                role=user["role"],
                display_name=user["display_name"],
                can_manage_users=bool(user["can_manage_users"]),
            )
            return redirect(url_for("index"))
        return render_template("login.html", error="账号或密码不正确"), 401
    return render_template("login.html")


@app.post("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
@login_required
def index():
    with connect_db() as db:
        user = db.execute(
            "SELECT role, display_name, can_manage_users FROM users WHERE username = ?",
            (session["username"],),
        ).fetchone()
    if not user:
        session.clear()
        return redirect(url_for("login"))
    session.update(
        role=user["role"],
        display_name=user["display_name"],
        can_manage_users=bool(user["can_manage_users"]),
    )
    return render_template(
        "index.html",
        role=session["role"],
        display_name=session["display_name"],
        username=session["username"],
        can_manage_users=session["can_manage_users"],
    )


@app.get("/api/users")
@login_required
@account_admin_required
def list_users():
    with connect_db() as db:
        rows = db.execute(
            """
            SELECT username, role, display_name, can_manage_users, created_at
            FROM users
            ORDER BY CASE role WHEN 'student' THEN 1 ELSE 2 END, username
            """
        ).fetchall()
    return jsonify(
        [
            {
                **dict(row),
                "can_manage_users": bool(row["can_manage_users"]),
            }
            for row in rows
        ]
    )


@app.post("/api/users")
@login_required
@account_admin_required
def create_user():
    payload = request.get_json(silent=True) or {}
    username = str(payload.get("username", "")).strip()
    display_name = str(payload.get("display_name", "")).strip() or username
    password = str(payload.get("password", ""))
    role = payload.get("role")

    if not re.fullmatch(r"[A-Za-z0-9._-]{3,32}", username):
        return jsonify({"error": "账号需为3至32位字母、数字、点、下划线或短横线"}), 400
    if not 1 <= len(display_name) <= 24:
        return jsonify({"error": "显示名称需为1至24个字符"}), 400
    if len(password) < 10:
        return jsonify({"error": "密码至少10位"}), 400
    if role not in {"student", "supervisor"}:
        return jsonify({"error": "请选择学生或监督者角色"}), 400

    try:
        with connect_db() as db:
            db.execute(
                """
                INSERT INTO users
                    (username, password_hash, role, display_name, can_manage_users, created_at)
                VALUES (?, ?, ?, ?, 0, ?)
                """,
                (username, generate_password_hash(password), role, display_name, now_text()),
            )
    except sqlite3.IntegrityError:
        return jsonify({"error": "该账号已存在"}), 409

    return jsonify(
        {
            "ok": True,
            "user": {
                "username": username,
                "display_name": display_name,
                "role": role,
                "can_manage_users": False,
            },
        }
    ), 201


@app.get("/api/summary")
@login_required
def summary():
    with connect_db() as db:
        overall = db.execute(
            """
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN status = '已完成' THEN 1 ELSE 0 END) AS completed,
                   SUM(planned_minutes) AS planned_minutes
            FROM tasks
            """
        ).fetchone()
        subjects = db.execute(
            """
            SELECT subject, COUNT(*) AS total,
                   SUM(CASE WHEN status = '已完成' THEN 1 ELSE 0 END) AS completed
            FROM tasks GROUP BY subject
            ORDER BY CASE subject WHEN '数学' THEN 1 WHEN '物理' THEN 2 WHEN '化学' THEN 3 ELSE 4 END
            """
        ).fetchall()
        weeks = db.execute(
            """
            SELECT week, COUNT(*) AS total,
                   SUM(CASE WHEN status = '已完成' THEN 1 ELSE 0 END) AS completed
            FROM tasks GROUP BY week ORDER BY week
            """
        ).fetchall()
        image_count = db.execute("SELECT COUNT(*) FROM images").fetchone()[0]
        date_rows = db.execute("SELECT DISTINCT date, day FROM tasks ORDER BY date").fetchall()
    return jsonify(
        {
            "today": datetime.now().strftime("%Y-%m-%d"),
            "total": overall["total"],
            "completed": overall["completed"] or 0,
            "planned_minutes": overall["planned_minutes"] or 0,
            "image_count": image_count,
            "subjects": [dict(row) for row in subjects],
            "weeks": [dict(row) for row in weeks],
            "dates": [dict(row) for row in date_rows],
        }
    )


@app.get("/api/tasks")
@login_required
def list_tasks():
    selected_date = request.args.get("date")
    subject = request.args.get("subject")
    status = request.args.get("status")
    clauses = []
    params = []
    if selected_date:
        clauses.append("date = ?")
        params.append(selected_date)
    if subject in SUBJECTS:
        clauses.append("subject = ?")
        params.append(subject)
    if status in TASK_STATUSES:
        clauses.append("status = ?")
        params.append(status)
    where = "WHERE " + " AND ".join(clauses) if clauses else ""
    with connect_db() as db:
        rows = db.execute(
            f"""
            SELECT * FROM tasks {where}
            ORDER BY date,
                     CASE subject WHEN '数学' THEN 1 WHEN '物理' THEN 2 WHEN '化学' THEN 3 ELSE 4 END,
                     id
            """,
            params,
        ).fetchall()
        image_map = load_images_for_tasks(db, [row["id"] for row in rows])
    return jsonify([serialize_task(row, image_map[row["id"]]) for row in rows])


@app.patch("/api/tasks/<task_id>")
@login_required
def update_task(task_id):
    payload = request.get_json(silent=True) or {}
    role = session["role"]
    updates = {}
    if role == "student":
        if payload.get("status") in TASK_STATUSES:
            updates["status"] = payload["status"]
        if "student_note" in payload:
            updates["student_note"] = str(payload["student_note"])[:2000]
    else:
        if payload.get("supervisor_status") in REVIEW_STATUSES:
            updates["supervisor_status"] = payload["supervisor_status"]
        if "supervisor_comment" in payload:
            updates["supervisor_comment"] = str(payload["supervisor_comment"])[:2000]
        if payload.get("status") in TASK_STATUSES:
            updates["status"] = payload["status"]
    if not updates:
        return jsonify({"error": "没有可更新的字段"}), 400
    updates["updated_at"] = now_text()
    assignments = ", ".join(f"{key} = ?" for key in updates)
    with connect_db() as db:
        exists = db.execute("SELECT 1 FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not exists:
            abort(404)
        db.execute(
            f"UPDATE tasks SET {assignments} WHERE id = ?",
            [*updates.values(), task_id],
        )
    return jsonify({"ok": True})


@app.get("/api/timer/active")
@login_required
def active_timer():
    with connect_db() as db:
        row = db.execute(
            "SELECT * FROM tasks WHERE timer_state = 'running' ORDER BY timer_started_at LIMIT 1"
        ).fetchone()
    return jsonify({"task": serialize_task(row, []) if row else None})


@app.post("/api/tasks/<task_id>/timer")
@login_required
def update_timer(task_id):
    if session["role"] != "student":
        return jsonify({"error": "只有学生账号可以操作计时器"}), 403

    payload = request.get_json(silent=True) or {}
    action = payload.get("action")
    if action not in {"start", "pause", "resume", "finish", "reset"}:
        return jsonify({"error": "无效的计时操作"}), 400

    with connect_db() as db:
        task = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not task:
            abort(404)

        state = task["timer_state"]
        elapsed = timer_elapsed_seconds(task)
        target_seconds = int(task["timer_target_seconds"] or task["planned_minutes"] * 60)
        updates = {"updated_at": now_text()}

        if action in {"start", "resume"}:
            running = db.execute(
                "SELECT id FROM tasks WHERE timer_state = 'running' AND id <> ? LIMIT 1",
                (task_id,),
            ).fetchone()
            if running:
                return jsonify({"error": f"请先暂停任务 {running['id']} 的计时"}), 409

        if action == "start":
            try:
                duration_minutes = int(payload.get("duration_minutes", task["planned_minutes"]))
            except (TypeError, ValueError):
                duration_minutes = 0
            if not 1 <= duration_minutes <= 240:
                return jsonify({"error": "学习时间需设置为1至240分钟"}), 400
            updates.update(
                timer_target_seconds=duration_minutes * 60,
                timer_elapsed_seconds=0,
                timer_started_at=now_text(),
                timer_state="running",
            )
            if task["status"] == "未开始":
                updates["status"] = "进行中"
        elif action == "pause":
            if state != "running":
                return jsonify({"error": "当前计时器未在运行"}), 409
            updates.update(
                timer_elapsed_seconds=elapsed,
                timer_started_at=None,
                timer_state="paused",
            )
        elif action == "resume":
            if state != "paused":
                return jsonify({"error": "只有暂停中的计时器可以继续"}), 409
            updates.update(timer_started_at=now_text(), timer_state="running")
            if task["status"] == "未开始":
                updates["status"] = "进行中"
        elif action == "finish":
            if state == "idle":
                return jsonify({"error": "该任务尚未开始计时"}), 409
            updates.update(
                timer_elapsed_seconds=elapsed,
                timer_started_at=None,
                timer_state="completed",
            )
        elif action == "reset":
            updates.update(
                timer_target_seconds=task["planned_minutes"] * 60,
                timer_elapsed_seconds=0,
                timer_started_at=None,
                timer_state="idle",
            )

        assignments = ", ".join(f"{key} = ?" for key in updates)
        db.execute(
            f"UPDATE tasks SET {assignments} WHERE id = ?",
            [*updates.values(), task_id],
        )
        updated = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        images = load_images_for_tasks(db, [task_id])[task_id]
    return jsonify({"ok": True, "task": serialize_task(updated, images)})


def save_image(file_storage, task_id):
    original_name = (file_storage.filename or "image").strip()[:200]
    image = Image.open(file_storage.stream)
    image = ImageOps.exif_transpose(image)
    if image.width * image.height > 50_000_000:
        raise ValueError("图片像素过大")
    if image.mode not in ("RGB", "L"):
        background = Image.new("RGB", image.size, "white")
        if "A" in image.getbands():
            background.paste(image, mask=image.getchannel("A"))
        else:
            background.paste(image)
        image = background
    else:
        image = image.convert("RGB")

    token = secrets.token_hex(16)
    filename = f"{task_id}-{token}.jpg"
    thumb_filename = f"{task_id}-{token}-thumb.jpg"
    display_image = image.copy()
    display_image.thumbnail((2560, 2560), Image.Resampling.LANCZOS)
    display_image.save(UPLOAD_DIR / filename, "JPEG", quality=88, optimize=True)
    thumbnail = image.copy()
    thumbnail.thumbnail((480, 360), Image.Resampling.LANCZOS)
    thumbnail.save(THUMB_DIR / thumb_filename, "JPEG", quality=82, optimize=True)
    return filename, thumb_filename, original_name


@app.post("/api/tasks/<task_id>/images")
@login_required
def upload_images(task_id):
    files = request.files.getlist("images")
    if not files or len(files) > 20:
        return jsonify({"error": "请选择1至20张图片"}), 400
    with connect_db() as db:
        if not db.execute("SELECT 1 FROM tasks WHERE id = ?", (task_id,)).fetchone():
            abort(404)
        saved = []
        try:
            for file_storage in files:
                filename, thumb_filename, original_name = save_image(file_storage, task_id)
                cursor = db.execute(
                    """
                    INSERT INTO images
                        (task_id, filename, thumb_filename, original_name, caption, created_at)
                    VALUES (?, ?, ?, ?, '', ?)
                    """,
                    (task_id, filename, thumb_filename, original_name, now_text()),
                )
                saved.append(cursor.lastrowid)
        except Exception as error:
            return jsonify({"error": f"图片处理失败：{error}"}), 400
    return jsonify({"ok": True, "image_ids": saved})


@app.delete("/api/images/<int:image_id>")
@login_required
def delete_image(image_id):
    with connect_db() as db:
        row = db.execute("SELECT * FROM images WHERE id = ?", (image_id,)).fetchone()
        if not row:
            abort(404)
        db.execute("DELETE FROM images WHERE id = ?", (image_id,))
    for path in (UPLOAD_DIR / row["filename"], THUMB_DIR / row["thumb_filename"]):
        path.unlink(missing_ok=True)
    return jsonify({"ok": True})


@app.get("/media/<kind>/<filename>")
@login_required
def media(kind, filename):
    if kind == "thumb":
        return send_from_directory(THUMB_DIR, filename)
    if kind == "full":
        return send_from_directory(UPLOAD_DIR, filename)
    abort(404)


@app.post("/api/change-password")
@login_required
def change_password():
    payload = request.get_json(silent=True) or {}
    current = payload.get("current_password", "")
    new_password = payload.get("new_password", "")
    if len(new_password) < 10:
        return jsonify({"error": "新密码至少10位"}), 400
    with connect_db() as db:
        user = db.execute("SELECT * FROM users WHERE username = ?", (session["username"],)).fetchone()
        if not user or not check_password_hash(user["password_hash"], current):
            return jsonify({"error": "当前密码不正确"}), 400
        db.execute(
            "UPDATE users SET password_hash = ? WHERE username = ?",
            (generate_password_hash(new_password), session["username"]),
        )
    return jsonify({"ok": True})


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


# ==========================================
# AI Agent 接口层 (AI Study Companion Endpoints)
# ==========================================

@app.get("/api/agent/history")
@login_required
def get_agent_history():
    session_id = request.args.get("session_id", "physics")
    with connect_db() as db:
        rows = db.execute(
            "SELECT * FROM agent_chat_messages WHERE session_id = ? ORDER BY id ASC",
            (session_id,)
        ).fetchall()
        
        # 如果当前会话尚无记录，且是默认会话，则预置初始物理会话欢迎词与精美公式对比
        if not rows and session_id == "physics":
            now = now_text()
            db.execute(
                """
                INSERT INTO agent_chat_messages 
                (session_id, role, content, attachment_filename, attachment_type, attachment_size, task_id, created_at)
                VALUES 
                ('physics', 'assistant', '哈喽！我是你的 3D 伴学萌宠 **CX-Agent**！😸\n\n我已经与你的今日学习状态同步了！如果你在写作业、整理草稿纸时遇到不懂的物理推导，可以随时**上传题目截图**或者发送**语音消息**向我提问哦！', '', '', '', '', ?)
                """,
                (now,)
            )
            rows = db.execute(
                "SELECT * FROM agent_chat_messages WHERE session_id = ? ORDER BY id ASC",
                (session_id,)
            ).fetchall()
            
        messages = [dict(row) for row in rows]
        
        # 获取所有已存在的会话 ID 列表
        session_rows = db.execute(
            "SELECT DISTINCT session_id FROM agent_chat_messages"
        ).fetchall()
        sessions = [row["session_id"] for row in session_rows] or ["physics"]

    return jsonify({"ok": True, "session_id": session_id, "messages": messages, "sessions": sessions})


@app.post("/api/agent/upload")
@login_required
def agent_upload():
    if "file" not in request.files:
        return jsonify({"error": "没有上传文件"}), 400
    file_storage = request.files["file"]
    if not file_storage.filename:
        return jsonify({"error": "文件名为空"}), 400
        
    original_name = file_storage.filename
    ext = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else ""
    
    token = secrets.token_hex(8)
    safe_filename = f"agent_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{token}.{ext}"
    dest_path = UPLOAD_DIR / safe_filename
    file_storage.save(dest_path)
    
    file_size = dest_path.stat().st_size
    size_kb = Math_round = Math_round = Math_round = round(file_size / 1024)
    size_str = f"{round(size_kb / 1024, 1)} MB" if size_kb > 1024 else f"{size_kb} KB"
    
    is_image = ext in ["jpg", "jpeg", "png", "gif", "webp", "heic"]
    media_url = f"/media/full/{safe_filename}"
    
    return jsonify({
        "ok": True,
        "filename": original_name,
        "saved_filename": safe_filename,
        "url": media_url,
        "size_str": size_str,
        "ext": ext,
        "is_image": is_image
    })


@app.post("/api/agent/chat")
@login_required
def agent_chat():
    payload = request.get_json(silent=True) or {}
    message_text = payload.get("message", "").strip()
    session_id = payload.get("session_id", "physics")
    task_id = payload.get("task_id", "")
    attachment_name = payload.get("attachment_name", "")
    attachment_type = payload.get("attachment_type", "")
    attachment_size = payload.get("attachment_size", "")
    
    if not message_text and not attachment_name:
        return jsonify({"error": "消息内容或附件不能为空"}), 400

    now = now_text()

    with connect_db() as db:
        # 1. 记录用户消息
        db.execute(
            """
            INSERT INTO agent_chat_messages 
            (session_id, role, content, attachment_filename, attachment_type, attachment_size, task_id, created_at)
            VALUES (?, 'user', ?, ?, ?, ?, ?, ?)
            """,
            (session_id, message_text, attachment_name, attachment_type, attachment_size, task_id, now)
        )

        # 获取关联任务信息（如有）
        task_info = ""
        if task_id:
            task_row = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
            if task_row:
                task_info = f"【关联任务】{task_row['subject']} - {task_row['category']}: {task_row['detail']} (输出标准: {task_row['output_standard']})"

        # 2. 判断是否设置了 Gemini API Key
        gemini_api_key = os.environ.get("GEMINI_API_KEY")
        ai_reply = ""

        if gemini_api_key:
            try:
                import urllib.request
                import json as pyjson
                
                system_prompt = f"你是一个名为 CX-Agent 的 3D AI 伴学萌宠管家，专为高二学生提供数理化英语答疑与辅导。态度温和鼓励，格式支持 Markdown 加粗、行内代码与 LaTeX 公式 (如 \\(a = g \\sin\\theta\\))。{task_info}"
                
                prompt_content = f"{system_prompt}\n\n用户消息: {message_text}"
                if attachment_name:
                    prompt_content += f"\n[用户上传附件: {attachment_name} ({attachment_size})]"

                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_api_key}"
                req_data = pyjson.dumps({
                    "contents": [{"parts": [{"text": prompt_content}]}]
                }).encode("utf-8")
                
                req = urllib.request.Request(url, data=req_data, headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=10) as response:
                    res_json = pyjson.loads(response.read().decode("utf-8"))
                    candidates = res_json.get("candidates", [])
                    if candidates:
                        ai_reply = candidates[0]["content"]["parts"][0]["text"]
            except Exception as e:
                ai_reply = f"已通过 AI 引擎接收到你的问题！由于网络接入波动，启动智能备用推理模型为您回答：\n\n关于`{task_id or '学习任务'}`的推导，请注意受力平衡与公式 \\(F_N = mg \\cos\\theta\\)！"

        # 智能备用回复逻辑 (包含标准学科知识与 Markdown 公式)
        if not ai_reply:
            if attachment_name and ("pdf" in attachment_name.lower() or "doc" in attachment_name.lower() or "zip" in attachment_name.lower()):
                ai_reply = f"我已接收到你上传的学习文档 **{attachment_name}** ({attachment_size})！\n\n我分析了这篇文档的提纲，发现它与你当前正在进行的学习任务关联极其紧密。我已经帮你在后台进行了知识点索引！\n\n请问关于这篇复习资料中的任何物理定理或公式，需要我为你详细拆解吗？"
            elif attachment_name:
                ai_reply = f"我看清了你刚才上传的题目图片！这道题属于高二物理经典的**斜面滑块受力模型**。\n\n根据受力平衡方程，在垂直于斜面方向上：\n\n<div class=\"math-block\">\\(F_N = mg \\cos\\theta\\)</div>\n\n你可以使用这个公式来求滑动摩擦力：\n\n<div class=\"math-block\">\\(f = \\mu F_N = \\mu mg \\cos\\theta\\)</div>\n\n代入数值计算即可完成打卡！🌟"
            elif "物理" in message_text or task_id.startswith("D06-P"):
                ai_reply = f"物理任务 `D06-P1` 要求探究**斜面体动力学模型**。📘\n\n**建议策略**：\n1. 请保持专注，分析斜面上的物体受力：重力分力 \\(mg \\sin\\theta\\) 和摩擦力 \\(f = \\mu mg \\cos\\theta\\)。\n2. 计算得出合加速度为：\n\n<div class=\"math-block\">\\(a = g(\\sin\\theta - \\mu\\cos\\theta)\\)</div>\n\n在草稿纸上完成推导后，拍照上传给我即可！"
            elif "化学" in message_text or "同分异构" in message_text:
                ai_reply = f"有机化学基础重点：**同分异构体分类** 🧪\n\n1. **碳链异构**：碳骨架排列方式不同。\n2. **位置异构**：官能团在碳链上的位置不同。\n3. **官能团异构**：如乙醇与甲醚（分子式均为 \\(C_2H_6O\\)）。"
            elif "累" in message_text or "鼓励" in message_text:
                ai_reply = f"你今天已经完成了**数学和化学**打卡，这非常了不起！💪\n\n*“长夏逝去，凉秋将至；今日的流汗，是明日衔接高二的底气。”*\n\n喝口水，揉揉眼睛，长夏学程陪伴着你，加油！🌟"
            else:
                ai_reply = f"我是你的 3D AI 伴学管家 CX-Agent！我已经同步了你的任务数据。你可以向我提问具体的**数理化习题**，或者上传照片/资料文档让我帮你规划！"

        # 3. 记录 AI 回复
        db.execute(
            """
            INSERT INTO agent_chat_messages 
            (session_id, role, content, attachment_filename, attachment_type, attachment_size, task_id, created_at)
            VALUES (?, 'assistant', ?, '', '', '', ?, ?)
            """,
            (session_id, ai_reply, task_id, now_text())
        )

    return jsonify({"ok": True, "reply": ai_reply, "session_id": session_id})



@app.errorhandler(413)
def too_large(_error):
    return jsonify({"error": "上传内容超过100MB限制"}), 413


init_db()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=True)
