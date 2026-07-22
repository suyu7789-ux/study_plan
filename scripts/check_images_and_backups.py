import paramiko

def check_images_and_backups():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect("121.41.77.238", username="root", password="@Suyu7789", timeout=15)

    py_script = """import sqlite3, glob, os

print("=== CHECKING /opt/study-plan/data/study.db ===")
conn = sqlite3.connect('/opt/study-plan/data/study.db')
conn.row_factory = sqlite3.Row
images = conn.execute("SELECT * FROM images").fetchall()
print("study.db images count:", len(images))
for r in images:
    print(dict(r))

tasks_with_notes = conn.execute("SELECT id, username, status, student_note, supervisor_comment FROM tasks WHERE student_note != '' OR supervisor_comment != ''").fetchall()
print("study.db tasks with notes count:", len(tasks_with_notes))
for r in tasks_with_notes:
    print(dict(r))

print("=== CHECKING BACKUP DATABASES IN /opt/study-plan ===")
backup_files = glob.glob("/opt/study-plan/**/*.db", recursive=True) + glob.glob("/opt/study-plan/**/*.sqlite*", recursive=True)
for b in set(backup_files):
    if b == '/opt/study-plan/data/study.db': continue
    print("--- Backup file:", b, "(", os.path.getsize(b), "bytes) ---")
    try:
        bconn = sqlite3.connect(b)
        bconn.row_factory = sqlite3.Row
        bimgs = bconn.execute("SELECT * FROM images").fetchall()
        print("  images in", b, ":", len(bimgs))
        for r in bimgs: print("   ", dict(r))
        btasks = bconn.execute("SELECT id, status, student_note, supervisor_comment FROM tasks WHERE student_note != '' OR supervisor_comment != ''").fetchall()
        print("  tasks with notes in", b, ":", len(btasks))
        for r in btasks: print("   ", dict(r))
    except Exception as e:
        print("  Error reading", b, ":", e)

print("=== CHECKING UPLOAD DIRECTORY /opt/study-plan/data ===")
if os.path.exists('/opt/study-plan/data'):
    for root, dirs, files in os.walk('/opt/study-plan/data'):
        print("Dir:", root, "Files:", files)
"""
    sftp = ssh.open_sftp()
    with sftp.open("/tmp/check_db_full.py", "w") as f:
        f.write(py_script)
    sftp.close()

    stdin, stdout, stderr = ssh.exec_command("/opt/study-plan/venv/bin/python3 /tmp/check_db_full.py")
    print("STDOUT:\n", stdout.read().decode("utf-8"))
    print("STDERR:\n", stderr.read().decode("utf-8"))
    ssh.close()

if __name__ == "__main__":
    check_images_and_backups()
