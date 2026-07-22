import paramiko

def inspect():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect("121.41.77.238", username="root", password="@Suyu7789", timeout=15)

    remote_script = """
import sqlite3
conn = sqlite3.connect('/opt/study-plan/data/study.db')
conn.row_factory = sqlite3.Row
rows = conn.execute("SELECT id, username, status, student_note, supervisor_status FROM tasks WHERE status != '未开始' LIMIT 10").fetchall()
print('COMPLETED TASKS:')
for r in rows:
    print(dict(r))
images = conn.execute("SELECT * FROM images LIMIT 10").fetchall()
print('IMAGES:', [dict(r) for r in images])
"""
    sftp = ssh.open_sftp()
    with sftp.open("/tmp/check_db.py", "w") as f:
        f.write(remote_script)
    sftp.close()

    stdin, stdout, stderr = ssh.exec_command("/opt/study-plan/venv/bin/python3 /tmp/check_db.py")
    print("STDOUT:\n", stdout.read().decode("utf-8"))
    print("STDERR:\n", stderr.read().decode("utf-8"))
    ssh.close()

if __name__ == "__main__":
    inspect()
