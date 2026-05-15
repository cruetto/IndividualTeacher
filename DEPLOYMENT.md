# Quizzy Deployment Notes

This document describes the production setup for the IndividualTeacher app at:

```text
https://quizzy.attentionisallineed.xyz
```

## Current Architecture

```text
Browser
  -> Cloudflare DNS
  -> Oracle VM northstar, public IP 130.61.33.233
  -> Caddy reverse proxy on ports 80/443
  -> Docker Compose app proxy on localhost:8080
  -> Frontend container and backend container
  -> MongoDB Atlas
```

The app runs on the Oracle VM in:

```text
/opt/northstar/apps/quizzy
```

The shared reverse proxy runs in:

```text
/opt/northstar/proxy
```

## DNS

The domain is registered at Hostinger, but DNS is managed by Cloudflare.

Cloudflare has an `A` record:

```text
quizzy.attentionisallineed.xyz -> 130.61.33.233
```

For Caddy-managed Let's Encrypt certificates, keep this record as `DNS only` unless the proxy setup is intentionally changed.

## Oracle VM

The VM is named `northstar`.

Important open ports:

```text
22/tcp  SSH
80/tcp  HTTP
443/tcp HTTPS
```

Docker and Docker Compose are installed on the VM.

## Caddy

Caddy is the public HTTPS entrypoint.

Location:

```text
/opt/northstar/proxy
```

Expected `Caddyfile`:

```caddy
quizzy.attentionisallineed.xyz {
    reverse_proxy host.docker.internal:8080
}
```

The Caddy Docker Compose file must include:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

This is needed because `localhost` inside the Caddy container means the Caddy container itself, not the VM host.

Useful commands:

```bash
cd /opt/northstar/proxy
docker compose ps
docker compose restart
docker logs northstar-caddy --tail=50
```

## App Containers

The app is deployed with Docker Compose from:

```text
/opt/northstar/apps/quizzy
```

Services:

```text
backend   Flask + Gunicorn, internal port 5000
frontend  React build served by Nginx, internal port 80
web       Nginx app proxy, published as localhost:8080 on the VM
```

Routing:

```text
/      -> frontend
/api/  -> backend
```

Useful commands:

```bash
cd /opt/northstar/apps/quizzy
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 web
docker compose up -d --build
```

## Docker Command Reference

Run app commands from:

```bash
cd /opt/northstar/apps/quizzy
```

Show running containers:

```bash
docker compose ps
docker ps
```

Start or update the full app:

```bash
docker compose up -d --build
```

Stop the app without deleting images or env files:

```bash
docker compose down
```

Restart one service:

```bash
docker compose restart backend
docker compose restart frontend
docker compose restart web
```

Rebuild only one image:

```bash
docker compose build backend
docker compose up -d backend
```

Check disk usage:

```bash
docker system df
```

## Environment Files

Do not commit real `.env` files.

Production env files live only on the VM:

```text
/opt/northstar/apps/quizzy/.env
/opt/northstar/apps/quizzy/backend/.env
```

Root `.env` is used by Docker Compose and the frontend build:

```env
VITE_GOOGLE_CLIENT_ID='your-google-client-id.apps.googleusercontent.com'
VITE_API_BASE_URL='https://quizzy.attentionisallineed.xyz'
```

Backend `.env` is used by Flask:

```env
ENVIRONMENT='production'
FLASK_SECRET_KEY='replace-with-a-long-random-secret'
FRONTEND_ORIGIN='https://quizzy.attentionisallineed.xyz'
GOOGLE_CLIENT_ID='your-google-client-id.apps.googleusercontent.com'
GROQ_API_KEY='your-groq-api-key'
MONGODB_URI='your-mongodb-atlas-uri'
```

If the frontend shows `Network Error`, check that `VITE_API_BASE_URL` was set before rebuilding the frontend image.

## MongoDB Atlas

MongoDB is hosted in Atlas, not on the VM.

Recommended Atlas network access:

```text
130.61.33.233/32  northstar oracle vm
```

Remove `0.0.0.0/0` after confirming the app still works from the Oracle VM.

Recommended database user:

```text
Role: readWrite
Database: Quizzes
```

The backend code uses:

```text
Database: Quizzes
```

Smoke test:

```bash
curl -i https://quizzy.attentionisallineed.xyz/api/quizzes?scope=public
```

Expected result: `200 OK` with JSON.

## Google OAuth

The Google OAuth client must include this authorized JavaScript origin:

```text
https://quizzy.attentionisallineed.xyz
```

For redirect URIs, keep local development entries and add:

```text
https://quizzy.attentionisallineed.xyz/api/auth/google/callback
```

If Google login shows `origin_mismatch`, the JavaScript origin is missing or has not propagated yet.

## Updating Production

After pushing changes to GitHub:

```bash
ssh -i ssh-key-2026-05-15.key ubuntu@130.61.33.233
cd /opt/northstar/apps/quizzy
git pull
docker compose up -d --build
docker compose ps
```

If only backend `.env` changed:

```bash
cd /opt/northstar/apps/quizzy
docker compose up -d --force-recreate backend
docker compose logs --tail=80 backend
```

If only Caddy changed:

```bash
cd /opt/northstar/proxy
docker compose restart
docker logs northstar-caddy --tail=50
```

## Health Checks

Frontend through app proxy:

```bash
curl -I http://localhost:8080
```

Backend through app proxy:

```bash
curl -i http://localhost:8080/api/quizzes?scope=public
```

Backend through public domain:

```bash
curl -i https://quizzy.attentionisallineed.xyz/api/quizzes?scope=public
```

`/api/` returning `404` is normal because the backend does not define a generic `/api/` route.

## Future Apps

Use the same pattern for more services:

```text
cv.attentionisallineed.xyz
n8n.attentionisallineed.xyz
```

Add a DNS record in Cloudflare, run the app in Docker, then add a Caddy route.

Minecraft is different because it is not HTTP. It usually needs:

```text
25565/tcp
```

opened in Oracle and the VM firewall.
