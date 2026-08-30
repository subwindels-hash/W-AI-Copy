#!/bin/sh
# ============================================================================
# Build the portable cPanel deployment package.
#
#   ./build-deployment.sh [output-zip]
#
# Produces a ZIP that a hosting account can deploy with nothing but
# cPanel → File Manager, MySQL Databases and phpMyAdmin. The archive contains
# every runtime dependency (CodeIgniter 3.1.13 ships inside `system/`, there is
# no Composer or Node.js dependency) plus database/production.sql.
#
# Development-only files are deliberately excluded: Dockerfile, docker-compose
# files, composer.json, framework readmes, editor configs and stray log files.
#
# application/migrations/ IS shipped. Fresh installs never need it (they import
# database/production.sql, which already contains every object), but an account
# that is already live upgrades by importing the numbered migration files
# through phpMyAdmin — see "Upgrading an existing install" in
# CPANEL_DEPLOYMENT.md. The .htaccess in this package denies web access to
# *.sql, so shipping them costs nothing and keeps that path open.
#
# This script is for the developer packaging a release — deploying does not
# require a shell.
# ============================================================================
set -eu

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
OUT=${1:-"$SCRIPT_DIR/application-deployment.zip"}
STAGE=$(mktemp -d)
PKG="$STAGE/windels"

mkdir -p "$PKG"

# --- application code -------------------------------------------------------
cp -R "$SCRIPT_DIR/application" "$PKG/application"
cp -R "$SCRIPT_DIR/system"      "$PKG/system"
cp -R "$SCRIPT_DIR/assets"      "$PKG/assets"
cp -R "$SCRIPT_DIR/database"    "$PKG/database"

# --- public web root files --------------------------------------------------
cp "$SCRIPT_DIR/index.php"            "$PKG/"
cp "$SCRIPT_DIR/.htaccess"            "$PKG/"
cp "$SCRIPT_DIR/.env.example"         "$PKG/"
cp "$SCRIPT_DIR/index.html"           "$PKG/"
cp "$SCRIPT_DIR/offline.html"         "$PKG/"
cp "$SCRIPT_DIR/sw.js"                "$PKG/"
cp "$SCRIPT_DIR/manifest.webmanifest" "$PKG/"
cp "$SCRIPT_DIR/robots.txt"           "$PKG/"
cp "$SCRIPT_DIR/sitemap.xml"          "$PKG/"
cp "$SCRIPT_DIR/license.txt"          "$PKG/"
cp "$SCRIPT_DIR/favicon.svg"          "$PKG/"
cp "$SCRIPT_DIR/favicon-32.png"       "$PKG/"
cp "$SCRIPT_DIR/favicon-64.png"       "$PKG/"
cp -R "$SCRIPT_DIR/avatars"     "$PKG/avatars"
cp -R "$SCRIPT_DIR/brand"       "$PKG/brand"
cp -R "$SCRIPT_DIR/icons"       "$PKG/icons"
cp -R "$SCRIPT_DIR/og"          "$PKG/og"
cp -R "$SCRIPT_DIR/reviews"     "$PKG/reviews"
cp -R "$SCRIPT_DIR/screenshots" "$PKG/screenshots"

cp "$SCRIPT_DIR/CPANEL_DEPLOYMENT.md" "$PKG/"

# --- development-only files are not part of the package ---------------------
rm -f  "$PKG/application/logs/"*.php
rm -f  "$PKG/database/"*.sqlite

# --- writable directories (must exist so they can be chmod'ed in File Manager)
mkdir -p "$PKG/application/cache/sessions"
mkdir -p "$PKG/application/logs"
mkdir -p "$PKG/application/storage/uploads"
mkdir -p "$PKG/assets/uploads"
mkdir -p "$PKG/assets/logs/cache"
mkdir -p "$PKG/assets/logs/ratelimit"

for d in "$PKG/application/cache" "$PKG/application/cache/sessions" \
         "$PKG/application/logs" "$PKG/application/storage/uploads" \
         "$PKG/assets/uploads" "$PKG/assets/logs/cache" "$PKG/assets/logs/ratelimit"
do
  printf '<html><head><title>403 Forbidden</title></head><body>Directory access is forbidden.</body></html>\n' > "$d/index.html"
done

# --- package ----------------------------------------------------------------
rm -f "$OUT"
( cd "$PKG" && zip -qr "$OUT" . )

rm -rf "$STAGE"

echo "Created $OUT"
echo "Contents (top level):"
unzip -Z1 "$OUT" | awk -F/ 'NF==1 || $2=="" {print "  "$1}' | sort -u
