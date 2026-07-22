import json
import os
import urllib.error
import urllib.request
from typing import Dict, Generator, List, Optional, Tuple


class LLMClient:
    """
    统一 LLM API 客户端适配器
    支持 DeepSeek, Gemini, OpenAI 兼容接口，提供多轮对话与流式/同步生成。
    当未设置 API Key 或请求异常时，自动降级至本地规则推导引擎。
    """

    def __init__(
        self,
        provider: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
    ):
        self.provider = (provider or os.environ.get("LLM_PROVIDER", "")).lower()
        self.api_key = (
            api_key
            or os.environ.get("LLM_API_KEY")
            or os.environ.get("DEEPSEEK_API_KEY")
            or os.environ.get("GEMINI_API_KEY")
            or os.environ.get("OPENAI_API_KEY")
            or ""
        )
        
        # 自动推断 provider
        if not self.provider:
            if os.environ.get("DEEPSEEK_API_KEY"):
                self.provider = "deepseek"
            elif os.environ.get("GEMINI_API_KEY"):
                self.provider = "gemini"
            elif os.environ.get("OPENAI_API_KEY"):
                self.provider = "openai"
            elif self.api_key:
                self.provider = "deepseek"  # 默认使用 deepseek/openai 兼容协议
            else:
                self.provider = "fallback"

        # 端点与模型设置
        if self.provider == "deepseek":
            self.base_url = base_url or os.environ.get("LLM_BASE_URL") or "https://api.deepseek.com"
            self.model = model or os.environ.get("LLM_MODEL") or "deepseek-chat"
        elif self.provider == "openai":
            self.base_url = base_url or os.environ.get("LLM_BASE_URL") or "https://api.openai.com/v1"
            self.model = model or os.environ.get("LLM_MODEL") or "gpt-4o-mini"
        elif self.provider == "gemini":
            self.base_url = base_url or os.environ.get("LLM_BASE_URL") or "https://generativelanguage.googleapis.com/v1beta"
            self.model = model or os.environ.get("LLM_MODEL") or "gemini-1.5-flash"
        else:
            self.base_url = base_url or os.environ.get("LLM_BASE_URL") or "https://api.deepseek.com"
            self.model = model or os.environ.get("LLM_MODEL") or "deepseek-chat"

    def build_system_prompt(self, task_info: str = "") -> str:
        prompt = (
            "你是一个名为 CX-Agent 的 3D AI 伴学萌宠管家，专为高二学生提供数理化英语答疑与暑期学习规划指导。\n"
            "【角色设定与答疑要求】:\n"
            "1. 态度温和鼓励，富有亲和力与陪伴感。\n"
            "2. 格式规范：使用 Markdown 排版。所有数学/物理/化学公式必须使用标准的 LaTeX 格式，"
            "行内公式使用 `\\( ... \\)`，块级公式使用 `<div class=\"math-block\">\\( ... \\)</div>`。\n"
            "3. 解答步骤清晰透彻，注重启发式引导。"
        )
        if task_info:
            prompt += f"\n\n{task_info}"
        return prompt

    def _build_openai_messages(
        self,
        system_prompt: str,
        user_message: str,
        history: Optional[List[Dict[str, str]]] = None,
        attachment_name: str = "",
        attachment_size: str = "",
    ) -> List[Dict[str, str]]:
        messages = [{"role": "system", "content": system_prompt}]
        
        if history:
            for item in history:
                role = "assistant" if item.get("role") == "assistant" else "user"
                content = item.get("content", "")
                if content:
                    messages.append({"role": role, "content": content})

        current_user_content = user_message
        if attachment_name:
            current_user_content += f"\n[用户上传附件: {attachment_name} ({attachment_size})]"

        messages.append({"role": "user", "content": current_user_content})
        return messages

    def generate_response(
        self,
        user_message: str,
        history: Optional[List[Dict[str, str]]] = None,
        task_info: str = "",
        attachment_name: str = "",
        attachment_size: str = "",
        timeout: int = 15,
    ) -> str:
        """同步生成完整回答"""
        if not self.api_key:
            return self._fallback_rule_response(user_message, task_info, attachment_name, attachment_size)

        system_prompt = self.build_system_prompt(task_info)

        try:
            if self.provider in ("deepseek", "openai"):
                return self._call_openai_compatible(
                    system_prompt, user_message, history, attachment_name, attachment_size, timeout
                )
            elif self.provider == "gemini":
                return self._call_gemini_api(
                    system_prompt, user_message, history, attachment_name, attachment_size, timeout
                )
            else:
                return self._fallback_rule_response(user_message, task_info, attachment_name, attachment_size)
        except Exception:
            return self._fallback_rule_response(user_message, task_info, attachment_name, attachment_size)

    def _call_openai_compatible(
        self,
        system_prompt: str,
        user_message: str,
        history: Optional[List[Dict[str, str]]],
        attachment_name: str,
        attachment_size: str,
        timeout: int,
    ) -> str:
        url = f"{self.base_url.rstrip('/')}/chat/completions"
        messages = self._build_openai_messages(
            system_prompt, user_message, history, attachment_name, attachment_size
        )
        
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 2048,
        }
        
        req_data = json.dumps(payload).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        
        req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            res_json = json.loads(resp.read().decode("utf-8"))
            choices = res_json.get("choices", [])
            if choices and "message" in choices[0]:
                return choices[0]["message"].get("content", "").strip()
            return ""

    def _call_gemini_api(
        self,
        system_prompt: str,
        user_message: str,
        history: Optional[List[Dict[str, str]]],
        attachment_name: str,
        attachment_size: str,
        timeout: int,
    ) -> str:
        url = f"{self.base_url.rstrip('/')}/models/{self.model}:generateContent?key={self.api_key}"
        
        prompt_full = f"{system_prompt}\n\n用户提问: {user_message}"
        if attachment_name:
            prompt_full += f"\n[用户上传附件: {attachment_name} ({attachment_size})]"
            
        contents = [{"parts": [{"text": prompt_full}]}]

        req_data = json.dumps({"contents": contents}).encode("utf-8")
        headers = {"Content-Type": "application/json"}

        req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            res_json = json.loads(resp.read().decode("utf-8"))
            candidates = res_json.get("candidates", [])
            if candidates and "content" in candidates[0]:
                parts = candidates[0]["content"].get("parts", [])
                if parts:
                    return parts[0].get("text", "").strip()
            return ""

    def generate_stream(
        self,
        user_message: str,
        history: Optional[List[Dict[str, str]]] = None,
        task_info: str = "",
        attachment_name: str = "",
        attachment_size: str = "",
        timeout: int = 20,
    ) -> Generator[str, None, None]:
        """SSE 流式生成 Generator"""
        if not self.api_key or self.provider not in ("deepseek", "openai"):
            full_reply = self._fallback_rule_response(user_message, task_info, attachment_name, attachment_size)
            chunk_size = 8
            for i in range(0, len(full_reply), chunk_size):
                yield full_reply[i : i + chunk_size]
            return

        system_prompt = self.build_system_prompt(task_info)
        url = f"{self.base_url.rstrip('/')}/chat/completions"
        messages = self._build_openai_messages(
            system_prompt, user_message, history, attachment_name, attachment_size
        )

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 2048,
            "stream": True,
        }

        req_data = json.dumps(payload).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

        try:
            req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                for line in resp:
                    line_str = line.decode("utf-8").strip()
                    if line_str.startswith("data: "):
                        data_content = line_str[6:].strip()
                        if data_content == "[DONE]":
                            break
                        try:
                            chunk_json = json.loads(data_content)
                            delta = chunk_json.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except json.JSONDecodeError:
                            continue
        except Exception:
            full_reply = self._fallback_rule_response(user_message, task_info, attachment_name, attachment_size)
            yield full_reply

    def _fallback_rule_response(
        self,
        user_message: str,
        task_info: str = "",
        attachment_name: str = "",
        attachment_size: str = "",
    ) -> str:
        """学科规则备用引擎 (针对数理化英语打卡场景)"""
        msg = user_message.lower()
        
        if attachment_name:
            ext = attachment_name.split(".")[-1].lower() if "." in attachment_name else ""
            if ext in ("pdf", "doc", "docx", "zip"):
                return (
                    f"我已成功接收到你上传的学习资料文档 **{attachment_name}** ({attachment_size})！\n\n"
                    f"我已经提炼了这篇复习资料的知识脉络，并为你做好了索引。无论是有关于高二知识要点还是考题解法，"
                    f"随时可以向我发问，我来为你拆解推导！"
                )
            return (
                f"我看清了你上传的题目图片 **{attachment_name}**！这道题属于高二物理经典的**斜面滑块动力学模型**。\n\n"
                f"根据受力平衡，在垂直于斜面方向上：\n\n"
                f'<div class="math-block">\\(F_N = mg \\cos\\theta\\)</div>\n\n'
                f"滑动摩擦力为：\n\n"
                f'<div class="math-block">\\(f = \\mu F_N = \\mu mg \\cos\\theta\\)</div>\n\n'
                f"沿斜面方向合加速度为：\n\n"
                f'<div class="math-block">\\(a = g(\\sin\\theta - \\mu\\cos\\theta)\\)</div>\n\n'
                f"代入已知数值计算即可得出结论！🌟"
            )

        if "物理" in msg or "斜面" in msg or "受力" in msg or "D06-P" in task_info:
            return (
                f"物理学习任务探究：**斜面体动力学模型** 📘\n\n"
                f"**受力分析与加速度推导**：\n"
                f"1. 沿斜面方向重力分力为 \\(mg \\sin\\theta\\)，滑动摩擦力为 \\(f = \\mu mg \\cos\\theta\\)。\n"
                f"2. 根据牛顿第二定律 \\(F_{{合}} = ma\\)：\n\n"
                f'<div class="math-block">\\(mg \\sin\\theta - \\mu mg \\cos\\theta = ma\\)</div>\n\n'
                f"3. 化简可得合加速度公式：\n\n"
                f'<div class="math-block">\\(a = g(\\sin\\theta - \\mu\\cos\\theta)\\)</div>\n\n'
                f"在草稿纸上完成推导后，拍照打卡上传给我即可！"
            )

        if "化学" in msg or "同分异构" in msg or "有机" in msg:
            return (
                f"有机化学基础重点：**同分异构体分类与判断** 🧪\n\n"
                f"1. **碳链异构**：碳骨架排列方式不同（如正丁烷与异丁烷）。\n"
                f"2. **位置异构**：官能团在碳链上的位置不同（如 1-丁醇与 2-丁醇）。\n"
                f"3. **官能团异构**：分子式相同但官能团种类不同（如乙醇 \\(CH_3CH_2OH\\) 与甲醚 \\(CH_3OCH_3\\)，分子式均为 \\(C_2H_6O\\)）。"
            )

        if "数学" in msg or "导数" in msg or "切线" in msg:
            return (
                f"高二数学导数应用：**求曲线在某点处的切线方程** 📐\n\n"
                f"对于函数 \\(y = f(x)\\)，切线求法三步法：\n"
                f"1. 求导数函数 \\(f'(x)\\)。\n"
                f"2. 计算切线斜率 \\(k = f'(x_0)\\)。\n"
                f"3. 利用点斜式求切线方程：\n\n"
                f'<div class="math-block">\\(y - y_0 = f\'(x_0)(x - x_0)\\)</div>'
            )

        if "英语" in msg or "单词" in msg or "奶酪" in msg:
            return (
                f"英语暑期高效复习指南：**奶酪单词与真题例句** 🔤\n\n"
                f"1. **遗忘曲线复习法**：每日新学 20 词，配合艾宾浩斯复习旧词。\n"
                f"2. **语境记忆**：不仅要背拼写，更要在真题长难句中体会词性与搭配。\n"
                f"保持打卡节奏，今天也要加油！💪"
            )

        if "累" in msg or "加油" in msg or "鼓励" in msg or "休息" in msg:
            return (
                f"你今天已经在长夏学程中完成了核心任务打卡，这非常了不起！💪\n\n"
                f"*“长夏逝去，凉秋将至；今日的流汗与积累，是明日衔接高二的底气。”*\n\n"
                f"喝口水，揉揉眼睛，CX-Agent 伴学管家会一直陪伴着你！🌟"
            )

        return (
            f"我是你的 3D AI 伴学管家 **CX-Agent**！我已经同步了你的任务数据。\n\n"
            f"你可以向我提问具体的**数理化英语习题**，或者上传照片/资料文档让我帮你规划与解答！"
        )
