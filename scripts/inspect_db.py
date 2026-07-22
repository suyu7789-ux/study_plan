import paramiko

def inspect_db():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect("121.41.77.238", username="root", password="@Suyu7789", timeout=15)

    commands = [
        "/opt/study-plan/venv/bin/python3 -c \"import sqlite3; conn = sqlite3.connect('/opt/study-plan/data/study.db'); conn.row_factory = sqlite3.Row; print('USERS:', [dict(r) for r in conn.execute('SELECT username, role, display_name FROM users').fetchall()]); print('COMPLETED TASKS BY USER:', [dict(r) for r in conn.execute('SELECT username, count(*) as count FROM tasks WHERE status != \\'未开始\\' GROUP BY username').fetchall()]); print('IMAGES BY USER:', [dict(r) for r in conn.execute('SELECT username, count(*) as count FROM images GROUP BY username').fetchall()]);\"",
        "git log -n 1 --oneline"
    ]

    for cmd in commands:
        print(f"=== Executing: {cmd} ===")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        out = stdout.read().decode("utf-8")
        err = stderr.read().decode("utf-8")
        if out:
            print("STDOUT:\n", out)
        if err:
            print("STDERR:\n", err)

    ssh.close()

if __name__ == "__main__":
    inspect_db()
