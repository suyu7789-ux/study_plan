import paramiko

def fix_progress():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect("121.41.77.238", username="root", password="@Suyu7789", timeout=15)

    remote_script = """
import sqlite3

conn = sqlite3.connect('/opt/study-plan/data/study.db')
conn.row_factory = sqlite3.Row

# 获取所有从 student 建立的已有进度
rows = conn.execute("SELECT * FROM tasks WHERE username = 'student' AND (status != '未开始' OR student_note != '' OR supervisor_comment != '')").fetchall()
print(f"找到 {len(rows)} 条历史打卡记录")

# 将进度复载到 xsy 与其他已有学生账号
students = [r['username'] for r in conn.execute("SELECT username FROM users WHERE role = 'student'").fetchall()]
print(f"目标学生账号: {students}")

for s in students:
    for r in rows:
        conn.execute(
            '''
            UPDATE tasks
            SET status = ?, student_note = ?, supervisor_status = ?, supervisor_comment = ?, updated_at = ?
            WHERE username = ? AND id = ?
            ''',
            (r['status'], r['student_note'], r['supervisor_status'], r['supervisor_comment'], r['updated_at'], s, r['id'])
        )

# 如果 xsy 对应的 images 有记录，也补全 username
conn.execute("UPDATE images SET username = 'xsy' WHERE username = 'student'")

conn.commit()
print("历史进度已成功同步修复并绑定至 xsy 及所有学生账号！")
"""
    sftp = ssh.open_sftp()
    with sftp.open("/tmp/fix_progress.py", "w") as f:
        f.write(remote_script)
    sftp.close()

    stdin, stdout, stderr = ssh.exec_command("/opt/study-plan/venv/bin/python3 /tmp/fix_progress.py")
    print("STDOUT:\n", stdout.read().decode("utf-8"))
    print("STDERR:\n", stderr.read().decode("utf-8"))
    ssh.close()

if __name__ == "__main__":
    fix_progress()
