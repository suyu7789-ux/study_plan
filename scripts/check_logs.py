import paramiko

def check_logs():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect("121.41.77.238", username="root", password="@Suyu7789", timeout=15)

    commands = [
        "systemctl status study-plan.service --no-pager",
        "systemctl status nginx.service --no-pager",
        "journalctl -u study-plan.service -n 50 --no-pager",
        "tail -n 50 /var/log/nginx/error.log",
        "curl -i http://127.0.0.1:8000/login"
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
    check_logs()
