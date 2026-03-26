# CTT Backend Production Setup

## 1) Server packages
```bash
sudo apt update
sudo apt install -y nginx
sudo npm install -g pm2
```

## 2) App install
```bash
cd /opt
sudo git clone <your-repo-url> ctt-backend
cd /opt/ctt-backend
npm install
```

## 3) PM2 process
```bash
sudo mkdir -p /var/log/ctt-backend
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Note: `ecosystem.config.cjs` expects app path `/opt/ctt-backend`.

## 4) Nginx reverse proxy
```bash
sudo cp deploy/nginx/ctt-backend.conf /etc/nginx/sites-available/ctt-backend
sudo ln -sf /etc/nginx/sites-available/ctt-backend /etc/nginx/sites-enabled/ctt-backend
sudo nginx -t
sudo systemctl reload nginx
```

## 5) Health checks
```bash
curl -sS http://127.0.0.1/health
curl -sS http://127.0.0.1/api/fetch-status
curl -sS https://vibeshype.com/health
curl -sS https://vibeshype.com/api/fetch-status
```

## 6) Log rotation (recommended)
Create `/etc/logrotate.d/ctt-backend`:
```conf
/var/log/ctt-backend/*.log {
  daily
  rotate 14
  missingok
  notifempty
  compress
  delaycompress
  copytruncate
}
```

## 7) Operational commands
```bash
pm2 status
pm2 logs ctt-backend --lines 200
pm2 restart ctt-backend
pm2 stop ctt-backend
```
