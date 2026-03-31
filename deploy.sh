#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="/opt/bobou"
BACKEND_DIR="/opt/bobou/backend"
FRONTEND_DIR="/opt/bobou/frontend-src"

# AJUSTE AQUI
GIT_BRANCH="main"
BACKEND_SERVICE="bobou-backend"
NGINX_SERVICE="nginx"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

fail() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERRO: $*" >&2
  exit 1
}

require_dir() {
  local dir="$1"
  [[ -d "$dir" ]] || fail "Diretório não encontrado: $dir"
}

run_git_pull() {
  local repo_dir="$1"

  if [[ -d "$repo_dir/.git" ]]; then
    log "Atualizando repositório em $repo_dir"
    git -C "$repo_dir" fetch origin
    git -C "$repo_dir" checkout "$GIT_BRANCH"
    git -C "$repo_dir" pull --ff-only origin "$GIT_BRANCH"
    return
  fi

  fail "Não encontrei .git em $repo_dir. Ajuste o PROJECT_ROOT ou a estratégia de deploy."
}

restart_service_if_exists() {
  local service_name="$1"

  if systemctl list-unit-files | grep -q "^${service_name}\.service"; then
    log "Reiniciando serviço: $service_name"
    sudo systemctl restart "$service_name"
    sudo systemctl is-active --quiet "$service_name" || fail "Serviço $service_name não ficou ativo após restart"
  else
    fail "Serviço systemd não encontrado: ${service_name}.service"
  fi
}

reload_service_if_exists() {
  local service_name="$1"

  if systemctl list-unit-files | grep -q "^${service_name}\.service"; then
    log "Recarregando serviço: $service_name"
    sudo systemctl reload "$service_name"
  else
    log "Serviço ${service_name}.service não encontrado. Pulando reload."
  fi
}

deploy_backend() {
  require_dir "$BACKEND_DIR"

  log "Iniciando etapa do backend"

  cd "$BACKEND_DIR"

  [[ -f "requirements.txt" ]] || fail "requirements.txt não encontrado em $BACKEND_DIR"
  [[ -f ".venv/bin/activate" ]] || fail "Virtualenv não encontrado em $BACKEND_DIR/.venv"

  source "$BACKEND_DIR/.venv/bin/activate"

  log "Instalando dependências do backend"
  python -m pip install --upgrade pip
  pip install -r requirements.txt

  restart_service_if_exists "$BACKEND_SERVICE"

  log "Backend finalizado"
}

deploy_frontend() {
  require_dir "$FRONTEND_DIR"

  log "Iniciando etapa do frontend"

  cd "$FRONTEND_DIR"

  [[ -f "package.json" ]] || fail "package.json não encontrado em $FRONTEND_DIR"

  if [[ -f "package-lock.json" ]]; then
    log "Instalando dependências com npm ci"
    npm ci
  else
    log "package-lock.json não encontrado, usando npm install"
    npm install
  fi

  log "Gerando build do frontend"
  npm run build

  reload_service_if_exists "$NGINX_SERVICE"

  log "Frontend finalizado"
}

main() {
  require_dir "$PROJECT_ROOT"
  require_dir "$BACKEND_DIR"
  require_dir "$FRONTEND_DIR"

  log "=== INÍCIO DO DEPLOY ==="

  run_git_pull "$PROJECT_ROOT"
  deploy_backend
  deploy_frontend

  log "=== DEPLOY CONCLUÍDO COM SUCESSO ==="
}

main "$@"