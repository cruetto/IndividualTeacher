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
  -> Quizzy Docker Compose web proxy on localhost:8080
  -> Frontend and backend containers
  -> Quizzy MongoDB container on the VM
```

The app runs on the Oracle VM in:

```text
/opt/northstar/apps/quizzy
```

The shared reverse proxy is not part of this repo. It runs from the northstar infra repo in:

```text
/opt/northstar/infra/proxy
```

## DNS

The domain is registered at Hostinger, but DNS is managed by Cloudflare.

Cloudflare has an `A` record:

```text
quizzy.attentionisallineed.xyz -> 130.61.33.233
```

The record can be Cloudflare proxied. Caddy still terminates HTTPS on the VM, and Cloudflare sits in front of it.

## Oracle VM

The VM is named `northstar`.

Important open ports:

```text
22/tcp  SSH
80/tcp  HTTP
443/tcp HTTPS
```

Docker and Docker Compose are installed on the VM.

## Repo Ownership

This repo owns the Quizzy app stack:

```text
backend
frontend
web    app-local Nginx proxy, container name quizzy-web-1 on the VM
mongo  app-local MongoDB
```

The northstar infra repo owns shared VM infrastructure:

```text
Caddy
shared Docker network
File Browser
status service
Minecraft
```

The video importer is a separate repo and is not deployed as part of the Quizzy web stack.

The Quizzy Compose stack uses two Docker networks:

```text
quizzy_internal  private app network for backend, frontend, mongo, and web
northstar_web    shared external network so Caddy can reach quizzy-web-1
```

## Caddy

Caddy is the public HTTPS entrypoint.

Location:

```text
/opt/northstar/infra/proxy
```

The real VM `Caddyfile` is intentionally not committed to git. It lives at:

```text
/opt/northstar/infra/proxy/Caddyfile
```

The infra repo keeps only a safe template:

```text
/opt/northstar/infra/proxy/Caddyfile.example
```

Expected Quizzy route:

```caddy
quizzy.attentionisallineed.xyz {
    reverse_proxy quizzy-web-1:80
}
```

Quizzy, CV, File Browser, and Caddy share the external Docker network:

```text
northstar_web
```

The Quizzy `web` service is the only Quizzy container attached to `northstar_web`. Backend, frontend, and MongoDB stay on the private app network.

Useful commands:

```bash
cd /opt/northstar/infra/proxy
docker compose ps
docker compose logs --tail=80 caddy
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile
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
mongo     MongoDB Atlas Local, bound to 127.0.0.1:27017 on the VM
web       Nginx app proxy, published as localhost:8080 on the VM
```

The `web` service belongs in this repo because it is app-specific routing for Quizzy:

```text
/      -> frontend
/api/  -> backend
```

Routing:

```text
/      -> frontend
/api/  -> backend
```

Useful commands:

```bash
cd /opt/northstar/apps/quizzy
docker network create northstar_web || true
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
docker compose restart mongo
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
/opt/northstar/apps/quizzy/frontend/.env
/opt/northstar/apps/quizzy/backend/.env
```

Frontend `.env` is used by the Vite build inside the frontend Docker image:

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
MONGODB_URI='mongodb://mongo:27017/Quizzes?directConnection=true'
```

If the frontend shows `Network Error`, check that `frontend/.env` has `VITE_API_BASE_URL` set before rebuilding the frontend image.

## MongoDB

MongoDB is hosted by the Quizzy Docker Compose stack on the VM. It is not exposed publicly; Compose binds it to `127.0.0.1:27017` for maintenance through SSH and the backend reaches it through the internal service name `mongo`.

The backend uses:

```text
Database: Quizzes
Collection: video_chunks
Vector index: video_embedding_index
```

Do not add a Cloudflare DNS record or Caddy route for MongoDB. Keep MongoDB private.

Atlas may still exist as a rollback or migration source, but production should use the VM-local URI in `backend/.env`.

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
docker network create northstar_web || true
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
cd /opt/northstar/infra/proxy
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile
docker compose logs --tail=50 caddy
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

## Other Apps

Other VM apps live in their own repos or in `northstar_infra`, depending on whether they are app-specific or shared infrastructure:

```text
cv.attentionisallineed.xyz  separate CV repo
n8n.attentionisallineed.xyz future app-specific repo or infra-managed service
```

Add a DNS record in Cloudflare, run the app in Docker, then add a Caddy route in the northstar infra repo.

Minecraft is different because it is not HTTP. It usually needs:

```text
25565/tcp
```

opened in Oracle and the VM firewall.
