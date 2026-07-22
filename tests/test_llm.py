import io
import json
import os
import shutil
import tempfile
import unittest
from unittest.mock import MagicMock, patch
from pathlib import Path

TEST_DATA = Path(tempfile.gettempdir()) / "study-plan-llm-tests"
shutil.rmtree(TEST_DATA, ignore_errors=True)
os.environ["STUDY_PLAN_DATA"] = str(TEST_DATA)
os.environ["STUDY_PLAN_SECRET"] = "test-llm-secret"
os.environ["STUDENT_USER"] = "student"
os.environ["STUDENT_PASSWORD"] = "TestStudent2026!"

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))

from app import app, init_db
from llm_client import LLMClient


class LLMClientTestCase(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)
        self.client = app.test_client()
        self.client.post(
            "/login",
            data={"username": "student", "password": "TestStudent2026!"},
        )

    def test_llm_client_fallback_without_key(self):
        client = LLMClient(provider="fallback", api_key="")
        response = client.generate_response("物理斜面受力公式推导")
        self.assertIn("物理", response)
        self.assertIn("a = g(\\sin\\theta - \\mu\\cos\\theta)", response)

    def test_llm_client_system_prompt_builder(self):
        client = LLMClient()
        prompt = client.build_system_prompt("【关联任务】D06-P1 斜面体动力学")
        self.assertIn("CX-Agent", prompt)
        self.assertIn("斜面体动力学", prompt)
        self.assertIn("LaTeX", prompt)

    @patch("urllib.request.urlopen")
    def test_deepseek_openai_compatible_call(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "choices": [{
                "message": {
                    "content": "斜面受力合加速度公式为 \\(a = g(\\sin\\theta - \\mu\\cos\\theta)\\)"
                }
            }]
        }).encode("utf-8")
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        client = LLMClient(
            provider="deepseek",
            api_key="sk-test-key",
            base_url="https://api.deepseek.com",
            model="deepseek-chat"
        )
        reply = client.generate_response("斜面受力公式")
        self.assertIn("a = g(\\sin\\theta - \\mu\\cos\\theta)", reply)

    @patch("urllib.request.urlopen")
    def test_gemini_api_call(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "candidates": [{
                "content": {
                    "parts": [{"text": "Gemini 物理回答: 受力平衡"}]
                }
            }]
        }).encode("utf-8")
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        client = LLMClient(
            provider="gemini",
            api_key="gemini-test-key",
            model="gemini-1.5-flash"
        )
        reply = client.generate_response("物理提问")
        self.assertIn("Gemini 物理回答", reply)

    def test_agent_chat_api_fallback_integration(self):
        res = self.client.post(
            "/api/agent/chat",
            json={"message": "请问物理斜面公式推导", "session_id": "test_physics", "task_id": "D01-P1"}
        )
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["ok"])
        self.assertIn("reply", data)
        self.assertEqual(data["session_id"], "test_physics")

    def test_agent_chat_stream_api_endpoint(self):
        res = self.client.post(
            "/api/agent/chat/stream",
            json={"message": "请问导数切线方程怎么求？", "session_id": "test_math", "task_id": "D01-M1"}
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/event-stream", res.content_type)
        output_text = res.get_data(as_text=True)
        self.assertIn("data: ", output_text)
        self.assertIn('"done": true', output_text)


if __name__ == "__main__":
    unittest.main()
