import paramiko

def restore_images():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect("121.41.77.238", username="root", password="@Suyu7789", timeout=15)

    py_script = r"""
import sqlite3, os, re
from datetime import datetime

conn = sqlite3.connect('/opt/study-plan/data/study.db')
conn.row_factory = sqlite3.Row

data_dir = '/opt/study-plan/data'
all_files = []
for root, dirs, files in os.walk(data_dir):
    for f in files:
        if not f.startswith('.'):
            all_files.append((root, f))

print(f"数据目录下找到 {len(all_files)} 个文件")

# 获取已有学生列表
students = [r['username'] for r in conn.execute("SELECT username FROM users WHERE role = 'student'").fetchall()]

# 收集原图和缩略图
full_images = {}
thumb_images = {}

for root, filename in all_files:
    if filename.endswith('-thumb.jpg'):
        # 缩略图: D05-M1-28d010f54ed8d3561feb4f95f4c33a1f-thumb.jpg
        base = filename[:-10] # D05-M1-28d010f54ed8d3561feb4f95f4c33a1f
        thumb_images[base] = filename
    else:
        # 原图
        match = re.match(r'^([A-Z0-9]+-[A-Z0-9]+)-([a-f0-9]+)\.(jpg|jpeg|png|webp|gif|heic)$', filename, re.IGNORECASE)
        if match:
            task_id = match.group(1)
            ext = match.group(3)
            base = f"{task_id}-{match.group(2)}"
            full_images[base] = (task_id, filename, ext)

print(f"解析到原图: {len(full_images)} 个, 缩略图: {len(thumb_images)} 个")

restored_count = 0
for base, (task_id, filename, ext) in full_images.items():
    thumb_name = thumb_images.get(base, filename)
    for s in students:
        exists = conn.execute("SELECT 1 FROM images WHERE username = ? AND filename = ?", (s, filename)).fetchone()
        if not exists:
            conn.execute(
                '''
                INSERT INTO images (username, task_id, filename, thumb_filename, original_name, caption, created_at)
                VALUES (?, ?, ?, ?, ?, '', ?)
                ''',
                (s, task_id, filename, thumb_name, f"打卡凭证_{task_id}.{ext}", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
            )
            restored_count += 1

conn.commit()
print(f"成功从磁盘文件重构并恢复 {restored_count} 条打卡凭证图片关联！")
current_images = conn.execute("SELECT username, count(*) as count FROM images GROUP BY username").fetchall()
print("当前各账号图片统计:", [dict(r) for r in current_images])
"""

    sftp = ssh.open_sftp()
    with sftp.open("/tmp/restore_images.py", "w") as f:
        f.write(py_script)
    sftp.close()

    stdin, stdout, stderr = ssh.exec_command("/opt/study-plan/venv/bin/python3 /tmp/restore_images.py")
    print("STDOUT:\n", stdout.read().decode("utf-8"))
    print("STDERR:\n", stderr.read().decode("utf-8"))
    ssh.close()

if __name__ == "__main__":
    restore_images()
