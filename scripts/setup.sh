#!/bin/bash
# ============================================================
# School OS — Development Environment Setup
# Checks for and installs: Node.js 24 LTS, pnpm, Git, Stripe CLI
# ============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

success() { echo -e "${GREEN}✓${NC} $1"; }
warn()    { echo -e "${YELLOW}⚠${NC} $1"; }
fail()    { echo -e "${RED}✗${NC} $1"; }

echo ""
echo "============================================"
echo "  School OS — Dev Environment Setup"
echo "============================================"
echo ""

# ------------------------------------------------------------
# Check for Homebrew (required for installs on macOS)
# ------------------------------------------------------------
if ! command -v brew &> /dev/null; then
    warn "Homebrew not found. Installing..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    success "Homebrew installed"
else
    success "Homebrew found"
fi

# ------------------------------------------------------------
# Check for Git
# ------------------------------------------------------------
if ! command -v git &> /dev/null; then
    warn "Git not found. Installing..."
    brew install git
    success "Git installed"
else
    GIT_VERSION=$(git --version | awk '{print $3}')
    success "Git found (v${GIT_VERSION})"
fi

# ------------------------------------------------------------
# Check for Node.js 24 LTS
# ------------------------------------------------------------
install_node() {
    if command -v nvm &> /dev/null; then
        warn "Installing Node.js 24 via nvm..."
        nvm install 24
        nvm use 24
        nvm alias default 24
    elif command -v fnm &> /dev/null; then
        warn "Installing Node.js 24 via fnm..."
        fnm install 24
        fnm use 24
        fnm default 24
    else
        warn "No Node version manager found. Installing nvm first..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        nvm install 24
        nvm use 24
        nvm alias default 24
    fi
    success "Node.js 24 installed"
}

if command -v node &> /dev/null; then
    NODE_MAJOR=$(node -v | cut -d'.' -f1 | tr -d 'v')
    if [ "$NODE_MAJOR" -ge 24 ]; then
        success "Node.js found ($(node -v))"
    else
        warn "Node.js found ($(node -v)) but need v24+."
        install_node
    fi
else
    warn "Node.js not found."
    install_node
fi

# ------------------------------------------------------------
# Check for pnpm
# ------------------------------------------------------------
if ! command -v pnpm &> /dev/null; then
    warn "pnpm not found. Installing..."
    npm install -g pnpm
    success "pnpm installed ($(pnpm -v))"
else
    success "pnpm found (v$(pnpm -v))"
fi

# ------------------------------------------------------------
# Check for Stripe CLI
# ------------------------------------------------------------
if ! command -v stripe &> /dev/null; then
    warn "Stripe CLI not found. Installing..."
    brew install stripe/stripe-cli/stripe
    success "Stripe CLI installed"
else
    success "Stripe CLI found"
fi

# ------------------------------------------------------------
# Check for Docker
# ------------------------------------------------------------
if ! command -v docker &> /dev/null; then
    fail "Docker not found. Please install Docker Desktop manually:"
    echo "  https://www.docker.com/products/docker-desktop/"
    echo ""
else
    success "Docker found ($(docker --version | awk '{print $3}' | tr -d ','))"
    if docker info &> /dev/null; then
        success "Docker daemon is running"
    else
        warn "Docker is installed but the daemon is not running. Start Docker Desktop."
    fi
fi

# ------------------------------------------------------------
# Summary
# ------------------------------------------------------------
echo ""
echo "============================================"
echo "  Setup Complete"
echo "============================================"
echo ""
echo "  Next steps:"
echo "  1. cp .env.example .env"
echo "  2. Fill in secrets in .env"
echo "  3. docker compose up -d"
echo "  4. pnpm install"
echo ""
