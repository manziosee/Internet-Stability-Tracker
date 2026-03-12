#!/bin/bash
# Quick Backend Deployment Script for Fly.io

set -e

echo "🚀 Deploying Backend to Fly.io"
echo "==============================="
echo ""

# Check if flyctl is installed
if ! command -v flyctl &> /dev/null; then
    echo "❌ Error: flyctl is not installed"
    echo ""
    echo "Install it with:"
    echo "  macOS:   brew install flyctl"
    echo "  Linux:   curl -L https://fly.io/install.sh | sh"
    echo "  Windows: iwr https://fly.io/install.ps1 -useb | iex"
    exit 1
fi

# Check if logged in
if ! flyctl auth whoami &> /dev/null; then
    echo "❌ Error: Not logged in to Fly.io"
    echo ""
    echo "Login with: fly auth login"
    exit 1
fi

echo "✓ flyctl installed and authenticated"
echo ""

# Confirm deployment
read -p "Deploy to production? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 0
fi

echo ""
echo "📦 Building and deploying..."
echo ""

# Deploy with remote build and extended timeout
flyctl deploy \
    --app backend-cold-butterfly-9535 \
    --remote-only \
    --wait-timeout 300

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🔗 URLs:"
echo "  API:     https://backend-cold-butterfly-9535.fly.dev/api"
echo "  Docs:    https://backend-cold-butterfly-9535.fly.dev/docs"
echo "  Health:  https://backend-cold-butterfly-9535.fly.dev/health"
echo ""
echo "📊 Check status:"
echo "  fly status"
echo "  fly logs"
echo ""
