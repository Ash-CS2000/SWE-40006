# Staging environment

Staging runs the **same Docker image** as production (pulled from Docker Hub by commit SHA, never rebuilt) on the same EC2 instance, but fully separated from production:

| | Production | Staging |
|---|---|---|
| Config folder | `/opt/taskflow/` | `/opt/taskflow-staging/` |
| Database container / volume | `taskflow-db` / `taskflow-pgdata` | `taskflow-staging-db` / `taskflow-staging-pgdata` |
| App container | `taskflow-app` | `taskflow-staging-app` |
| Docker network | `taskflow-network` | `taskflow-staging-network` |
| Public port | `80` | `8080` |

Pipeline: `test-build-publish` → `deploy-staging` → production `deploy`.

## 1. Open port 8080

In the EC2 security group, add an inbound rule: Custom TCP, port `8080`, source `0.0.0.0/0`.

## 2. Set up staging on the server (once)

Docker and the Docker Hub login must already be done on the instance (same as production). Copy this folder's two scripts to the server, connect with Session Manager, then:

```bash
sudo -i
cd /path/to/files
bash setup-staging.sh
install -m 700 deploy-staging.sh /opt/taskflow-staging/deploy.sh
```

Re-run the `install` line whenever `deploy-staging.sh` changes in the repo.

## 3. Deploy by hand once

```bash
/opt/taskflow-staging/deploy.sh COMMIT_SHA
```

Use the full 40-character SHA of an image already on Docker Hub. Then open `http://PUBLIC_IP:8080/login` and `http://PUBLIC_IP:8080/health`.

## 4. Connect GitHub Actions

Add a repository variable (Settings → Secrets and variables → Actions → Variables):

| Variable | Value |
|---|---|
| `STAGING_URL` | `http://PUBLIC_IP:8080` (no trailing slash) |

`AWS_REGION`, `AWS_DEPLOY_ROLE_ARN` and `EC2_INSTANCE_ID` are shared with production. No IAM changes are needed: staging uses the same deployment role and instance.

The production `deploy` job must use `needs: deploy-staging` so it only runs after staging passes.

## Notes

- The smoke test creates a test user and task in the **staging** database on every run. Never point it at production.
- If the instance is stopped and started, its public IP changes unless it has an Elastic IP. Update `STAGING_URL` if so.
- Staging and production share the instance's CPU and memory, so CloudWatch metrics include both.
