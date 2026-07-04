#!/bin/bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
# ResearchBuilder — VPS Deploy Script
# Tested on: Ubuntu 22.04 / 24.04, Debian 12
#
# Usage:
#   1. Copy this repo to your VPS
#   2. Edit variables below
#   3. Run: sudo bash deploy/setup-vps.sh
# ═══════════════════════════════════════════════════════════════════════════════

# ── CONFIG — EDIT THESE ──────────────────────────────────────────────────────
DOMAIN="api.yourdomain.com"          # API subdomain
DEPLOY_USER="deploy"                  # Linux user to run the app
APP_DIR="/opt/researchbuilder"        # Install directory
DB_NAME="researchbuilder"
DB_USER="researchbuilder"
DB_PASS="CHANGE_THIS_PASSWORD"        # Change this!
EMAIL="you@yourdomain.com"            # For Let's Encrypt SSL
# ─────────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# Check root
[[ $EUID -ne 0 ]] && err "Run as root: sudo bash deploy/setup-vps.sh"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ResearchBuilder — VPS Setup"
echo "═══════════════════════════════════════════════════"
echo ""

# ── 1. System packages ──────────────────────────────────────────────────────
log "Updating system packages..."
apt update -qq && apt upgrade -y -qq

log "Installing dependencies..."
apt install -y -qq \
    python3 python3-venv python3-pip \
    postgresql postgresql-contrib \
    nginx certbot python3-certbot-nginx \
    git curl ufw

# ── 2. Create deploy user ───────────────────────────────────────────────────
if ! id "$DEPLOY_USER" &>/dev/null; then
    log "Creating user: $DEPLOY_USER"
    useradd -m -s /bin/bash "$DEPLOY_USER"
else
    log "User $DEPLOY_USER already exists"
fi

# ── 3. Setup PostgreSQL ─────────────────────────────────────────────────────
log "Setting up PostgreSQL..."
systemctl enable postgresql
systemctl start postgresql

# Create DB user and database
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
log "PostgreSQL ready: $DB_NAME"

# ── 4. Setup application ────────────────────────────────────────────────────
log "Setting up application directory..."
mkdir -p "$APP_DIR"

# Copy project files (if running from repo)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$SCRIPT_DIR/api/index.py" ]]; then
    log "Copying project files..."
    cp -r "$SCRIPT_DIR/api" "$APP_DIR/"
    cp "$SCRIPT_DIR/pyproject.toml" "$APP_DIR/"
    cp "$SCRIPT_DIR/uv.lock" "$APP_DIR/" 2>/dev/null || true
fi

# Create output directory
mkdir -p "$APP_DIR/api/output/runs"

# ── 5. Python virtual environment ───────────────────────────────────────────
log "Setting up Python environment..."
python3 -m venv "$APP_DIR/.venv"

# Install uv for fast dependency management
"$APP_DIR/.venv/bin/pip" install uv -q

# Install dependencies
cd "$APP_DIR"
"$APP_DIR/.venv/bin/uv" pip install -r <("$APP_DIR/.venv/bin/pip" install --dry-run -r /dev/null 2>/dev/null || true)

# Install from pyproject.toml
if [[ -f "$APP_DIR/pyproject.toml" ]]; then
    "$APP_DIR/.venv/bin/uv" pip install -e "$APP_DIR" 2>/dev/null || \
    "$APP_DIR/.venv/bin/pip" install -e "$APP_DIR"
fi

# Ensure psycopg2 is installed
"$APP_DIR/.venv/bin/pip" install psycopg2-binary -q
log "Python environment ready"

# ── 6. Environment file ─────────────────────────────────────────────────────
ENV_FILE="$APP_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    cat > "$ENV_FILE" << EOF
SECRET_KEY=$SECRET
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME
GROQ_API_KEY=PASTE_YOUR_KEY_HERE
TAVILY_API_KEY=PASTE_YOUR_KEY_HERE
GROQ_MODEL=llama-3.3-70b-versatile
OUTPUT_DIR=$APP_DIR/api/output
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
EOF
    chmod 600 "$ENV_FILE"
    warn "Edit API keys in $ENV_FILE before starting!"
else
    log ".env already exists, skipping"
fi

# ── 7. Set ownership ────────────────────────────────────────────────────────
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"

# ── 8. Systemd service ──────────────────────────────────────────────────────
log "Installing systemd service..."
cp "$SCRIPT_DIR/deploy/researchbuilder.service" /etc/systemd/system/ 2>/dev/null || \
cat > /etc/systemd/system/researchbuilder.service << 'EOF'
[Unit]
Description=ResearchBuilder API
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=/opt/researchbuilder/api
ExecStart=/opt/researchbuilder/.venv/bin/uvicorn index:app --host 127.0.0.1 --port 8000 --workers 1 --timeout-keep-alive 300
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
EnvironmentFile=/opt/researchbuilder/.env
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable researchbuilder
log "Systemd service installed"

# ── 9. Nginx ────────────────────────────────────────────────────────────────
log "Configuring Nginx..."
cat > /etc/nginx/sites-available/researchbuilder << EOF
limit_req_zone \$binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone \$binary_remote_addr zone=auth_limit:10m rate=3r/s;

server {
    listen 80;
    server_name $DOMAIN;

    client_max_body_size 25M;

    location ~ ^/api/auth/ {
        limit_req zone=auth_limit burst=5 nodelay;
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 10s;
    }

    location = / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
    }
}
EOF

ln -sf /etc/nginx/sites-available/researchbuilder /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
log "Nginx configured for $DOMAIN"

# ── 10. Firewall ────────────────────────────────────────────────────────────
log "Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
log "Firewall active (SSH + HTTP/HTTPS)"

# ── 11. SSL Certificate ─────────────────────────────────────────────────────
warn "Run SSL setup after DNS is pointed to this server:"
echo "  sudo certbot --nginx -d $DOMAIN --email $EMAIL --agree-tos --non-interactive"

# ── 12. Crontab — cleanup old files ─────────────────────────────────────────
CRON_CMD="0 3 * * * find $APP_DIR/api/output/runs -mtime +7 -name '*.json' -delete && find $APP_DIR/api/output/runs -mtime +7 -name '*.docx' -delete"
(crontab -u "$DEPLOY_USER" -l 2>/dev/null | grep -v "output/runs" ; echo "$CRON_CMD") | crontab -u "$DEPLOY_USER" -
log "Crontab: auto-cleanup files older than 7 days"

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo "  Setup complete!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Edit API keys:"
echo "     sudo nano $ENV_FILE"
echo ""
echo "  2. Point DNS A record:"
echo "     $DOMAIN → $(curl -s ifconfig.me || echo 'YOUR_SERVER_IP')"
echo ""
echo "  3. Setup SSL:"
echo "     sudo certbot --nginx -d $DOMAIN --email $EMAIL --agree-tos"
echo ""
echo "  4. Start the service:"
echo "     sudo systemctl start researchbuilder"
echo ""
echo "  5. Check status:"
echo "     sudo systemctl status researchbuilder"
echo "     sudo journalctl -u researchbuilder -f"
echo ""
echo "  6. Deploy frontend to Vercel:"
echo "     Set NEXT_PUBLIC_API_URL=https://$DOMAIN"
echo ""
