#!/usr/bin/env bash

# ==============================================================================
# deploy-k8s.sh
# Platform-agnostic Kubernetes Deployment CLI for LedgerLab
# Usage: ./deploy-k8s.sh [all|migrate|ledger-api|reporting-api|web|status] [--build]
# ==============================================================================

set -eo pipefail

NAMESPACE="ledgerlab"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

for arg in "$@"; do
  if [ "$arg" = "-h" ] || [ "$arg" = "--help" ]; then
    echo "Usage: ./deploy-k8s.sh [all|backend|migrate|ledger-api|reporting-api|web|status|build-push] [--build]"
    echo ""
    echo "Commands:"
    echo "  all           Run DB migrations and deploy all services (ledger-api, reporting-api, web)"
    echo "  backend       Run DB migrations and deploy backend services (ledger-api, reporting-api)"
    echo "  migrate       Run database migration job"
    echo "  ledger-api    Deploy/rollout ledger-api service"
    echo "  reporting-api Deploy/rollout reporting-api service"
    echo "  web           Deploy/rollout web frontend"
    echo "  status        Show status of pods, services, ingresses, and jobs"
    echo "  build-push    Build all Docker images and push to GHCR"
    echo ""
    echo "Options:"
    echo "  --build       Build & push Docker images before deploying"
    exit 0
  fi
done

# Check kubectl prerequisite
if ! command -v kubectl &>/dev/null; then
  echo "❌ Error: 'kubectl' command not found in PATH."
  echo "   Please install kubectl and ensure your cluster credentials are configured."
  exit 1
fi

# Verify cluster connectivity
if ! kubectl cluster-info &>/dev/null; then
  echo "❌ Error: Cannot connect to Kubernetes cluster using current context."
  echo "   Please verify your KUBECONFIG or cluster network connection."
  exit 1
fi

# Parse arguments
APP=""
DO_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --build)
      DO_BUILD=true
      ;;
    build|build-push)
      APP="build-push"
      ;;
    all|backend|migrate|ledger-api|reporting-api|web|status)
      APP="$arg"
      ;;
    -h|--help)
      echo "Usage: ./deploy-k8s.sh [all|backend|migrate|ledger-api|reporting-api|web|status|build-push] [--build]"
      echo ""
      echo "Commands:"
      echo "  all           Run DB migrations and deploy all services (ledger-api, reporting-api, web)
  backend       Run DB migrations and deploy backend services (ledger-api, reporting-api)"
      echo "  migrate       Run database migration job"
      echo "  ledger-api    Deploy/rollout ledger-api service"
      echo "  reporting-api Deploy/rollout reporting-api service"
      echo "  web           Deploy/rollout web frontend"
      echo "  status        Show status of pods, services, ingresses, and jobs"
      echo "  build-push    Build all Docker images and push to GHCR"
      echo ""
      echo "Options:"
      echo "  --build       Build & push Docker images before deploying"
      exit 0
      ;;
    *)
      echo "❌ Error: Unknown argument '$arg'."
      echo "Run './deploy-k8s.sh --help' for usage."
      exit 1
      ;;
  esac
done

APP="${APP:-all}"

# ------------------------------------------------------------------------------
# 1. Load Environment Configuration
# ------------------------------------------------------------------------------
load_env() {
  local env_file=""
  if [ -f ".env.prod" ]; then
    env_file=".env.prod"
  elif [ -f ".env" ]; then
    env_file=".env"
  elif [ -f ".env.production" ]; then
    env_file=".env.production"
  fi

  if [ -n "$env_file" ]; then
    echo "📋 Loading environment configuration from $env_file..."
    while IFS='=' read -r key val || [ -n "$key" ]; do
      key="$(echo "$key" | tr -d '[:space:]')"
      [[ "$key" =~ ^#.*$ ]] && continue
      [ -z "$key" ] && continue
      val="${val%\"}"; val="${val#\"}"
      val="${val%\\'}"; val="${val#\\'}"
      export "$key=$val"
    done < "$env_file"
  else
    echo "ℹ️  No .env file found. Using default environment variables."
  fi

  # Defaults
  INTERNAL_API_TOKEN="${INTERNAL_API_TOKEN:-dev-internal-token}"
  LEDGER_API_DOMAIN="${LEDGER_API_DOMAIN:-ledger-api.gading.dev}"
  REPORTING_API_DOMAIN="${REPORTING_API_DOMAIN:-reporting-api.gading.dev}"
  WEB_DOMAIN="${WEB_DOMAIN:-ledgerlab.gading.dev}"
  CORS_ORIGINS="${CORS_ORIGINS:-https://${WEB_DOMAIN}}"
  DATABASE_URL="${DATABASE_URL:-postgres://ledgerlab:ledgerlab@10.18.1.103:5433/ledgerlab}"
  IMAGE_REGISTRY="${IMAGE_REGISTRY:-ghcr.io/gadingnst/ledgerlab-scaffold}"
  IMAGE_TAG="${IMAGE_TAG:-latest}"
}

# ------------------------------------------------------------------------------
# 2. Synchronize Namespace & Secrets
# ------------------------------------------------------------------------------
sync_secrets() {
  echo "🔐 Synchronizing namespace and secrets for '$NAMESPACE'..."
  kubectl apply -f deployment/k8s/namespace.yaml > /dev/null

  kubectl create secret generic ledgerlab-secrets     --namespace "$NAMESPACE"     --from-literal=DATABASE_URL="$DATABASE_URL"     --from-literal=INTERNAL_API_TOKEN="$INTERNAL_API_TOKEN"     --from-literal=CORS_ORIGINS="$CORS_ORIGINS"     --dry-run=client -o yaml | kubectl apply -f - > /dev/null
  echo "   ✅ Secrets synced."

  # If GHCR credentials provided, configure image pull secret
  if [ -n "${GHCR_TOKEN:-}" ] || [ -n "${GITHUB_TOKEN:-}" ]; then
    local token="${GHCR_TOKEN:-$GITHUB_TOKEN}"
    local user="${GHCR_USER:-${GITHUB_ACTOR:-gadingnst}}"
    echo "🔑 Configuring GHCR image pull secret 'ghcr-secret'..."
    kubectl create secret docker-registry ghcr-secret       --namespace "$NAMESPACE"       --docker-server=ghcr.io       --docker-username="$user"       --docker-password="$token"       --dry-run=client -o yaml | kubectl apply -f - > /dev/null
    
    kubectl patch serviceaccount default -n "$NAMESPACE" -p '{"imagePullSecrets": [{"name": "ghcr-secret"}]}' > /dev/null 2>&1 || true
    echo "   ✅ Registry secret linked to service account."
  fi
}

# ------------------------------------------------------------------------------
# Optional: Local Build & Push via Docker Buildx
# ------------------------------------------------------------------------------
build_and_push_images() {
  if ! command -v docker &>/dev/null; then
    echo "❌ Error: Docker is required to build and push images."
    exit 1
  fi

  echo "📦 Building and pushing images to $IMAGE_REGISTRY (tag: $IMAGE_TAG, platform: linux/amd64)..."
  docker buildx build --platform linux/amd64 --push -t "$IMAGE_REGISTRY/tools:$IMAGE_TAG" --target tools .
  docker buildx build --platform linux/amd64 --push -t "$IMAGE_REGISTRY/ledger-api:$IMAGE_TAG" --target ledger-api .
  docker buildx build --platform linux/amd64 --push -t "$IMAGE_REGISTRY/reporting-api:$IMAGE_TAG" --target reporting-api .
  docker buildx build --platform linux/amd64 --push -t "$IMAGE_REGISTRY/web:$IMAGE_TAG" --target web     --build-arg VITE_LEDGER_API_URL="https://$LEDGER_API_DOMAIN"     --build-arg VITE_REPORTING_API_URL="https://$REPORTING_API_DOMAIN" .
  echo "✅ All images built and pushed successfully."
}

# ------------------------------------------------------------------------------
# App Deployers
# ------------------------------------------------------------------------------
deploy_migrate() {
  echo ""
  echo "🔄 Running database migration job..."
  kubectl delete job ledgerlab-migrate -n "$NAMESPACE" --ignore-not-found > /dev/null 2>&1 || true
  kubectl apply -f deployment/k8s/migrate-job.yaml
  echo "   Waiting for migration job completion..."
  kubectl wait --for=condition=complete job/ledgerlab-migrate -n "$NAMESPACE" --timeout=300s
  echo "✅ Database migration complete."
}

deploy_ledger_api() {
  echo ""
  echo "🚀 Deploying ledger-api (target: https://${LEDGER_API_DOMAIN})..."
  kubectl apply -f deployment/k8s/ledger-api.yaml
  echo "   Waiting for ledger-api rollout..."
  kubectl rollout status deployment/ledger-api -n "$NAMESPACE" --timeout=300s
  echo "✅ ledger-api deployed successfully at https://${LEDGER_API_DOMAIN}"
}

deploy_reporting_api() {
  echo ""
  echo "🚀 Deploying reporting-api (target: https://${REPORTING_API_DOMAIN})..."
  kubectl apply -f deployment/k8s/reporting-api.yaml
  echo "   Waiting for reporting-api rollout..."
  kubectl rollout status deployment/reporting-api -n "$NAMESPACE" --timeout=300s
  echo "✅ reporting-api deployed successfully at https://${REPORTING_API_DOMAIN}"
}

deploy_web() {
  echo ""
  echo "🚀 Deploying web dashboard (target: https://${WEB_DOMAIN})..."
  kubectl apply -f deployment/k8s/web.yaml
  echo "   Waiting for web dashboard rollout..."
  kubectl rollout status deployment/web -n "$NAMESPACE" --timeout=300s
  echo "✅ web dashboard deployed successfully at https://${WEB_DOMAIN}"
}

show_status() {
  echo ""
  echo "📊 Cluster status for namespace '$NAMESPACE':"
  kubectl get pods,deployments,services,ingress,jobs -n "$NAMESPACE"
}

# ------------------------------------------------------------------------------
# Main Execution
# ------------------------------------------------------------------------------
load_env

if [ "$DO_BUILD" = "true" ] || [ "$APP" = "build-push" ]; then
  build_and_push_images
  [ "$APP" = "build-push" ] && exit 0
fi

sync_secrets

case "$APP" in
  "migrate")
    deploy_migrate
    ;;
  "ledger-api")
    deploy_ledger_api
    ;;
  "reporting-api")
    deploy_reporting_api
    ;;
  "web")
    deploy_web
    ;;
  "backend")
    deploy_migrate
    deploy_ledger_api
    deploy_reporting_api
    echo ""
    echo "🎉 LedgerLab backend stack deployed successfully!"
    echo "   Ledger API:    https://${LEDGER_API_DOMAIN}"
    echo "   Reporting API: https://${REPORTING_API_DOMAIN}"
    echo "   Frontend Web:  https://${WEB_DOMAIN} (Cloudflare Pages)"
    ;;
  "status")
    show_status
    ;;
  "all")
    deploy_migrate
    deploy_ledger_api
    deploy_reporting_api
    deploy_web
    echo ""
    echo "🎉 Full LedgerLab stack deployed successfully!"
    echo "   Dashboard:     https://${WEB_DOMAIN}"
    echo "   Ledger API:    https://${LEDGER_API_DOMAIN}"
    echo "   Reporting API: https://${REPORTING_API_DOMAIN}"
    ;;
esac
