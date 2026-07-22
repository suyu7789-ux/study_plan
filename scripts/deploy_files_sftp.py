import paramiko, os

def deploy_sftp():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect("121.41.77.238", username="root", password="@Suyu7789", timeout=15)

    sftp = ssh.open_sftp()
    local_base = "/Users/nljt/.gemini/antigravity/worktrees/study_plan/integrate-llm-agent-api"
    
    files_to_sync = [
        "app/app.py",
        "app/templates/index.html",
        "app/static/app.js",
        "app/static/app.css",
        "app/static/vendor/three.min.js"
    ]

    for rel_path in files_to_sync:
        local_path = os.path.join(local_base, rel_path)
        remote_path = os.path.join("/opt/study-plan", rel_path)
        print(f"Syncing {rel_path} -> {remote_path}")
        sftp.put(local_path, remote_path)
    
    sftp.close()

    commands = [
        "chown -R studyplan:studyplan /opt/study-plan",
        "systemctl restart study-plan.service",
        "systemctl status study-plan.service --no-pager"
    ]

    for cmd in commands:
        stdin, stdout, stderr = ssh.exec_command(cmd)
        print(f"=== {cmd} ===")
        print(stdout.read().decode("utf-8"))

    ssh.close()
    print("SFTP Direct Deployment Completed Successfully!")

if __name__ == "__main__":
    deploy_sftp()
