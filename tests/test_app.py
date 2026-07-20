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
        self.assertIn("/static/app.css?v=32", html)
        self.assertIn("/static/app.js?v=32", html)
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
        self.assertEqual(supervisor.get("/api/users").status_code, 403)


if __name__ == "__main__":
    unittest.main()
