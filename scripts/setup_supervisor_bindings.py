import paramiko

def setup_bindings():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect("121.41.77.238", username="root", password="@Suyu7789", timeout=15)

    py_script = """
import sqlite3

conn = sqlite3.connect('/opt/study-plan/data/study.db')
conn.row_factory = sqlite3.Row

# 确保 suyu 账号拥有 can_manage_users 权限
conn.execute("UPDATE users SET can_manage_users = 1 WHERE username = 'suyu'")

# 将 xsy、xcx 等学生默认绑定到 suyu 监督人（若为空）
conn.execute("UPDATE users SET supervisor_username = 'suyu' WHERE role = 'student' AND (supervisor_username IS NULL OR supervisor_username = '')")

conn.commit()

users = conn.execute("SELECT username, role, display_name, supervisor_username, can_manage_users FROM users").fetchall()
print("当前用户配置与监督绑定关系:")
for u in users:
    print(dict(u))
"""
    sftp = ssh.open_sftp()
    with sftp.open("/tmp/setup_bindings.py", "w") as f:
        f.write(py_script)
    sftp.close()

    stdin, stdout, stderr = ssh.exec_command("/opt/study-plan/venv/bin/python3 /tmp/setup_bindings.py")
    print("STDOUT:\n", stdout.read().decode("utf-8"))
    print("STDERR:\n", stderr.read().decode("utf-8"))
    ssh.close()

if __name__ == "__main__":
    setup_bindings()
