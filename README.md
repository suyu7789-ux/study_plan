# 长夏学程

高中暑期学习计划 Web 系统，使用 Flask、SQLite、Gunicorn、Nginx 和原生 JavaScript/CSS 构建。

## 功能

- 42 天、四学科、840 项分类任务
- 学生任务状态、学习记录和持久化计时器
- 多图成果上传、缩略图、原图查看与删除
- 监督者审核状态和评语
- 指定管理员创建学生及监督者账号
- 桌面、平板和手机响应式界面

## 本地运行

```bash
python3 -m venv .venv
.venv/bin/pip install -r app/requirements.txt
cp .env.example .env
```

加载 `.env` 中的环境变量后运行：

```bash
.venv/bin/python app/app.py
```

默认访问地址为 `http://127.0.0.1:8000/`。首次启动时，仅会为同时配置了用户名和密码的环境变量创建账号。

## 测试

```bash
.venv/bin/python -m unittest -v tests/test_app.py
.venv/bin/python -m py_compile app/app.py
node --check app/static/app.js
node --check app/static/login.js
```

如需从原始 Excel 工作簿重新提取任务：

```bash
.venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/extract_tasks.py /path/to/study-plan.xlsx
```

## 数据安全

SQLite 数据库、上传图片、缩略图、备份、环境变量文件和部署压缩包均被 `.gitignore` 排除，不应提交到 Git。

生产部署前应先运行 `study-plan-backup.service`。部署配置示例位于 `deploy/`。
