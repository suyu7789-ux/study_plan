import io
import os
import shutil
import tempfile
import unittest
from pathlib import Path

from PIL import Image


TEST_DATA = Path(tempfile.gettempdir()) / "study-plan-web-tests"
shutil.rmtree(TEST_DATA, ignore_errors=True)
os.environ["STUDY_PLAN_DATA"] = str(TEST_DATA)
os.environ["STUDY_PLAN_SECRET"] = "test-secret"
os.environ["STUDENT_USER"] = "student"
os.environ["STUDENT_PASSWORD"] = "TestStudent2026!"
os.environ["SUPERVISOR_USER"] = "supervisor"
os.environ["SUPERVISOR_PASSWORD"] = "TestSupervisor2026!"
os.environ["EXTRA_SUPERVISOR_USER"] = "suyu"
os.environ["EXTRA_SUPERVISOR_PASSWORD"] = "TestAdmin2026!"
os.environ["ACCOUNT_ADMIN_USER"] = "suyu"

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
from app import app, connect_db, init_db  # noqa: E402


def image_file(color):
    output = io.BytesIO()
    Image.new("RGB", (640, 480), color).save(output, "JPEG")
    output.seek(0)
    return output


class StudyPlanAppTest(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)
        self.client = app.test_client()
        response = self.client.post(
            "/login",
            data={"username": "student", "password": "TestStudent2026!"},
        )
        self.assertEqual(response.status_code, 302)

    def test_account_admin_can_create_users(self):
        admin = app.test_client()
        response = admin.post(
            "/login", data={"username": "suyu", "password": "TestAdmin2026!"}
        )
        self.assertEqual(response.status_code, 302)

        users = admin.get("/api/users")
        self.assertEqual(users.status_code, 200)
        self.assertTrue(any(user["username"] == "suyu" for user in users.get_json()))

        student_response = admin.post(
            "/api/users",
            json={
                "username": "created_student",
                "display_name": "新学生",
                "password": "StudentPass2026!",
                "role": "student",
            },
        )
        self.assertEqual(student_response.status_code, 201)
        supervisor_response = admin.post(
            "/api/users",
            json={
                "username": "created_supervisor",
                "display_name": "新监督者",
                "password": "ReviewPass2026!",
                "role": "supervisor",
            },
        )
        self.assertEqual(supervisor_response.status_code, 201)
        self.assertFalse(supervisor_response.get_json()["user"]["can_manage_users"])

        duplicate = admin.post(
            "/api/users",
            json={
                "username": "created_student",
                "display_name": "重复账号",
                "password": "AnotherPass2026!",
                "role": "student",
            },
        )
        self.assertEqual(duplicate.status_code, 409)

        created_login = app.test_client().post(
            "/login",
            data={"username": "created_student", "password": "StudentPass2026!"},
        )
        self.assertEqual(created_login.status_code, 302)

    def test_task_flow_with_multiple_images(self):
        summary = self.client.get("/api/summary").get_json()
        self.assertEqual(summary["total"], 840)

        tasks = self.client.get("/api/tasks?date=2026-07-16").get_json()
        self.assertEqual(len(tasks), 20)
        self.assertTrue(all(task["min_images"] >= 2 for task in tasks))
        self.assertTrue(all(task["detail_items"] for task in tasks))
        self.assertTrue(all(task["output_items"] for task in tasks))
        task_id = tasks[0]["id"]

        response = self.client.patch(
            f"/api/tasks/{task_id}", json={"status": "已完成", "student_note": "已完成首日任务"}
        )
        self.assertEqual(response.status_code, 200)

        response = self.client.post(
            f"/api/tasks/{task_id}/images",
            data={
                "images": [
                    (image_file("red"), "textbook.jpg"),
                    (image_file("blue"), "notes.jpg"),
                ]
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)

        task = self.client.get(f"/api/tasks?date=2026-07-16&subject=数学").get_json()[0]
        self.assertEqual(task["image_count"], 2)
        self.assertEqual(task["evidence_status"], "充足")
        thumb_response = self.client.get(f"/media/thumb/{task['images'][0]['thumb_filename']}")
        self.assertEqual(thumb_response.status_code, 200)
        thumb_response.close()

        for image in task["images"]:
            self.assertEqual(self.client.delete(f"/api/images/{image['id']}").status_code, 200)

    def test_frontend_uses_canonical_versioned_assets(self):
        page = self.client.get("/")
        self.assertEqual(page.status_code, 200)
        html = page.get_data(as_text=True)
        self.assertIn("/static/app.css?v=43", html)
        self.assertIn("/static/app.js?v=43", html)
        self.assertIn('id="timerOrbitProgress"', html)
        self.assertIn('id="timerDialMarks"', html)
        self.assertIn('id="timerHourHand"', html)
        self.assertIn('id="btnSound"', html)
        self.assertIn('id="btnAmbient"', html)
        self.assertIn('id="btnTheme"', html)
        self.assertNotIn("app_v14", html)

        anonymous = app.test_client()
        login_html = anonymous.get("/login").get_data(as_text=True)
        self.assertIn("/static/app.css?v=32", login_html)
        self.assertNotIn('class="login-context"', login_html)
        self.assertIn("<span>登录</span>", login_html)
        self.assertNotIn("login_v12", login_html)

    def test_cheese_vocabulary_task_and_existing_progress_are_preserved(self):
        task = self.client.get(
            "/api/tasks?date=2026-07-16&subject=英语"
        ).get_json()[0]
        self.assertEqual(task["category"], "单词背诵")
        self.assertEqual(task["source"], "奶酪单词 App")
        self.assertEqual(task["section"], "每日新学20词")
        self.assertIn("当日20个新词", task["detail"])
        self.assertEqual(task["min_images"], 2)
        self.assertTrue(all("奶酪单词 App" in item for item in task["evidence_guide"]))

        self.client.patch(
            "/api/tasks/D01-E1",
            json={"status": "已完成", "student_note": "已在 App 完成"},
        )
        init_db()
        with connect_db() as db:
            saved = db.execute(
                "SELECT status, student_note FROM tasks WHERE id = 'D01-E1'"
            ).fetchone()
        self.assertEqual(saved["status"], "已完成")
        self.assertEqual(saved["student_note"], "已在 App 完成")

    def test_persistent_task_timer(self):
        response = self.client.post(
            "/api/tasks/D01-M1/timer",
            json={"action": "start", "duration_minutes": 30},
        )
        self.assertEqual(response.status_code, 200)
        timer = response.get_json()["task"]["timer"]
        self.assertEqual(timer["state"], "running")
        self.assertEqual(timer["target_seconds"], 1800)

        active = self.client.get("/api/timer/active").get_json()["task"]
        self.assertEqual(active["id"], "D01-M1")
        conflict = self.client.post(
            "/api/tasks/D01-M2/timer",
            json={"action": "start", "duration_minutes": 10},
        )
        self.assertEqual(conflict.status_code, 409)

        paused = self.client.post(
            "/api/tasks/D01-M1/timer", json={"action": "pause"}
        ).get_json()["task"]
        self.assertEqual(paused["timer"]["state"], "paused")
        resumed = self.client.post(
            "/api/tasks/D01-M1/timer", json={"action": "resume"}
        ).get_json()["task"]
        self.assertEqual(resumed["timer"]["state"], "running")
        finished = self.client.post(
            "/api/tasks/D01-M1/timer", json={"action": "finish"}
        ).get_json()["task"]
        self.assertEqual(finished["timer"]["state"], "completed")
        reset = self.client.post(
            "/api/tasks/D01-M1/timer", json={"action": "reset"}
        ).get_json()["task"]
        self.assertEqual(reset["timer"]["state"], "idle")

    def test_supervisor_review(self):
        supervisor = app.test_client()
        response = supervisor.post(
            "/login",
            data={"username": "supervisor", "password": "TestSupervisor2026!"},
        )
        self.assertEqual(response.status_code, 302)
        response = supervisor.patch(
            "/api/tasks/D01-M1",
            json={"supervisor_status": "通过", "supervisor_comment": "图片清晰"},
        )
        self.assertEqual(response.status_code, 200)
        task = supervisor.get("/api/tasks?date=2026-07-16&subject=数学").get_json()[0]
        self.assertEqual(task["supervisor_status"], "通过")
        response = supervisor.post(
            "/api/tasks/D01-M1/timer", json={"action": "start", "duration_minutes": 20}
        )
        self.assertEqual(response.status_code, 403)
    def test_agent_api_endpoints(self):
        # 1. 测试历史记录默认加载
        history_res = self.client.get("/api/agent/history?session_id=physics")
        self.assertEqual(history_res.status_code, 200)
        data = history_res.get_json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["session_id"], "physics")
        self.assertTrue(len(data["messages"]) > 0)

        # 2. 测试发送 Agent 问答消息
        chat_res = self.client.post(
            "/api/agent/chat",
            json={"message": "请问物理斜面公式怎么推导？", "session_id": "physics", "task_id": "D01-P1"}
        )
        self.assertEqual(chat_res.status_code, 200)
        chat_data = chat_res.get_json()
        self.assertTrue(chat_data["ok"])
        self.assertIn("reply", chat_data)
        self.assertTrue(len(chat_data["reply"]) > 0)

    def test_multi_student_task_isolation_and_supervisor_switching(self):
        # 1. student 完成任务 D01-M1
        self.client.patch("/api/tasks/D01-M1", json={"status": "已完成", "student_note": "学生A完成"})
        
        # 2. 创建新学生 student_b
        admin = app.test_client()
        admin.post("/login", data={"username": "suyu", "password": "TestAdmin2026!"})
        admin.post("/api/users", json={
            "username": "student_b",
            "display_name": "学生B",
            "password": "StudentPass2026!",
            "role": "student"
        })

        # 3. 验证 student_b 的 D01-M1 任务独立且仍然是 未开始
        client_b = app.test_client()
        client_b.post("/login", data={"username": "student_b", "password": "StudentPass2026!"})
        tasks_b = client_b.get("/api/tasks?date=2026-07-16&subject=数学").get_json()
        task_b_m1 = next(t for t in tasks_b if t["id"] == "D01-M1")
        self.assertEqual(task_b_m1["status"], "未开始")

        # 4. 监督者切换审阅不同学生
        supervisor = app.test_client()
        supervisor.post("/login", data={"username": "supervisor", "password": "TestSupervisor2026!"})
        students_res = supervisor.get("/api/supervisor/students").get_json()
        self.assertTrue(students_res["ok"])
        
        tasks_sup_a = supervisor.get("/api/tasks?date=2026-07-16&subject=数学&student=student").get_json()
        self.assertEqual(next(t for t in tasks_sup_a if t["id"] == "D01-M1")["status"], "已完成")

        tasks_sup_b = supervisor.get("/api/tasks?date=2026-07-16&subject=数学&student=student_b").get_json()
        self.assertEqual(next(t for t in tasks_sup_b if t["id"] == "D01-M1")["status"], "未开始")

    def test_agent_chat_user_isolation(self):
        # 1. student 发送消息
        self.client.post("/api/agent/chat", json={"message": "这是学生A的私密提问", "session_id": "physics"})

        # 2. 创建并登录 student_c
        admin = app.test_client()
        admin.post("/login", data={"username": "suyu", "password": "TestAdmin2026!"})
        admin.post("/api/users", json={
            "username": "student_c",
            "display_name": "学生C",
            "password": "StudentPass2026!",
            "role": "student"
        })
        client_c = app.test_client()
        client_c.post("/login", data={"username": "student_c", "password": "StudentPass2026!"})
        
        # 3. 检查 student_c 的 Agent 历史，确保看不到 student 的提问
        history_c = client_c.get("/api/agent/history?session_id=physics").get_json()
        messages_content = [m["content"] for m in history_c["messages"]]
        self.assertNotIn("这是学生A的私密提问", messages_content)

    def test_account_admin_can_edit_user_and_password(self):
        admin = app.test_client()
        admin.post("/login", data={"username": "suyu", "password": "TestAdmin2026!"})
        admin.post("/api/users", json={
            "username": "user_to_edit",
            "display_name": "待修改学生",
            "password": "OldStudentPassword2026!",
            "role": "student"
        })

        # 1. 修改 user_to_edit 的显示名称与新密码
        patch_res = admin.patch(
            "/api/users/user_to_edit",
            json={
                "display_name": "修改后的学生",
                "password": "NewStudentPassword2026!",
            },
        )
        self.assertEqual(patch_res.status_code, 200)

        # 2. 使用新密码登录 user_to_edit 校验
        client_new = app.test_client()
        login_res = client_new.post(
            "/login",
            data={"username": "user_to_edit", "password": "NewStudentPassword2026!"},
        )
        self.assertEqual(login_res.status_code, 302)


if __name__ == "__main__":
    unittest.main()

