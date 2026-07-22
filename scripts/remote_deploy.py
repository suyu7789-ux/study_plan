import paramiko

def deploy():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect("121.41.77.238", username="root", password="@Suyu7789", timeout=15)

    commands = [
        "git config --global --add safe.directory /opt/study-plan",
        "cd /opt/study-plan && git remote remove origin 2>/dev/null || true",
        "cd /opt/study-plan && git remote add origin https://github.com/suyu7789-ux/study_plan.git",
        "cd /opt/study-plan && git fetch origin main && git reset --hard origin/main",
        "chown -R studyplan:studyplan /opt/study-plan",
        "grep -q 'OPENAI_API_KEY' /etc/study-plan.env || (echo '' >> /etc/study-plan.env && echo 'OPENAI_API_KEY=sk-973f5108772f471757aec4d22615ff8a641f570f8a3a8bc88c13b8fb5d7e28fa' >> /etc/study-plan.env && echo 'OPENAI_BASE_URL=https://leleapi.top/v1' >> /etc/study-plan.env)",
        "cd /opt/study-plan && /opt/study-plan/venv/bin/python3 -m unittest discover -s tests -p 'test_*.py' -v",
        "systemctl restart study-plan.service",
        "systemctl status study-plan.service --no-pager",
        "curl -s http://127.0.0.1:8000/health"
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
    deploy()
