#!/bin/bash

#═══════════════════════════════════════════════════════════════════════════════
#  NOXA Music - Full Stack Control Script
#═══════════════════════════════════════════════════════════════════════════════
#
#  🎵 NOXA Music - Personal Music Streaming
#  ───────────────────────────────────────────────────────────────────────────
#  A modern music streaming app with:
#  • Beautiful glassmorphic React UI
#  • Full music player with queue management
#  • Playlist creation and management
#  • Music import from Spotify, YouTube, and URLs
#  • Synced lyrics display
#  • Offline support (PWA)
#
#  📁 Directory Structure:
#  ───────────────────────────────────────────────────────────────────────────
#  NoxaMusic/
#  ├── backend/           → Node.js Express server + SQLite database
#  │   ├── src/           → Backend source code
#  │   ├── public/        → Built React frontend (production)
#  │   └── data/          → Database files
#  ├── React/             → React frontend source code (development)
#  │   ├── src/           → React components, pages, stores
#  │   └── dist/          → Production build output
#  └── noxamusic.sh       → This control script
#
#  🚀 Usage:
#  ───────────────────────────────────────────────────────────────────────────
#  ./noxamusic.sh start       Start backend server (production)
#  ./noxamusic.sh stop        Stop all servers
#  ./noxamusic.sh restart     Restart backend server
#  ./noxamusic.sh dev         Start React dev server (development)
#  ./noxamusic.sh build       Build React and deploy to backend
#  ./noxamusic.sh status      Check server status
#  ./noxamusic.sh logs        Show backend logs
#
#═══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
REACT_DIR="$SCRIPT_DIR/React"
PID_FILE="$SCRIPT_DIR/.noxamusic.pid"
LOG_FILE="$SCRIPT_DIR/backend.log"
BACKEND_PORT=3001
DEV_PORT=3000

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

print_banner() {
    echo ""
    echo -e "${MAGENTA}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${MAGENTA}║${NC}        ${CYAN}♪ ♫  NOXA Music  ♫ ♪${NC}                          ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[✓]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[!]${NC} $1"; }
print_error() { echo -e "${RED}[✗]${NC} $1"; }
print_step() { echo -e "${CYAN}[→]${NC} $1"; }

get_local_ip() {
    local ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [ -z "$ip" ]; then
        ip="localhost"
    fi
    echo "$ip"
}

# Kill any process on a specific port
kill_port() {
    local port=$1
    local pids=$(lsof -ti:$port 2>/dev/null)
    if [ ! -z "$pids" ]; then
        echo "$pids" | xargs kill -9 2>/dev/null
        return 0
    fi
    return 1
}

# Stop all NOXA-related processes
stop_all() {
    print_step "Stopping all NOXA Music processes..."
    
    # Kill by PID file
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null
            print_success "Killed backend process (PID: $pid)"
        fi
        rm -f "$PID_FILE"
    fi
    
    # Kill any node process running from our backend directory
    pkill -9 -f "node.*NoxaMusic/backend" 2>/dev/null
    
    # Kill anything on backend port
    if kill_port $BACKEND_PORT; then
        print_success "Freed port $BACKEND_PORT"
    fi
    
    # Kill vite dev server if running
    pkill -9 -f "vite.*NoxaMusic" 2>/dev/null
    if kill_port $DEV_PORT; then
        print_success "Freed port $DEV_PORT"
    fi
    
    sleep 2
    print_success "All processes stopped"
}

# Start the backend server
start_backend() {
    print_step "Starting NOXA Music backend..."
    
    # Check if backend directory exists
    if [ ! -d "$BACKEND_DIR" ]; then
        print_error "Backend directory not found: $BACKEND_DIR"
        return 1
    fi
    
    # Check if already running
    if lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_warning "Port $BACKEND_PORT is already in use"
        print_status "Stopping existing process..."
        kill_port $BACKEND_PORT
        sleep 2
    fi
    
    # Start backend
    cd "$BACKEND_DIR"
    # Rotate log if it's too big (>10MB)
    if [ -f "$LOG_FILE" ] && [ $(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE") -gt 10485760 ]; then
        mv "$LOG_FILE" "$LOG_FILE.old"
    fi
    # Add startup marker with timestamp
    echo "" >> "$LOG_FILE"
    echo "========================================" >> "$LOG_FILE"
    echo "🚀 SERVER STARTING: $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
    echo "========================================" >> "$LOG_FILE"
    nohup node src/index.js >> "$LOG_FILE" 2>&1 &
    local pid=$!
    echo $pid > "$PID_FILE"
    
    # Wait for server to start
    print_status "Waiting for server to start..."
    sleep 4
    
    # Check if it started successfully
    if lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_success "Backend started successfully (PID: $pid)"
        return 0
    else
        print_error "Backend failed to start. Check logs: $LOG_FILE"
        cat "$LOG_FILE" | tail -20
        rm -f "$PID_FILE"
        return 1
    fi
}

# Start React development server
start_dev() {
    print_step "Starting React development server..."
    
    if [ ! -d "$REACT_DIR" ]; then
        print_error "React directory not found: $REACT_DIR"
        return 1
    fi
    
    cd "$REACT_DIR"
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        print_status "Installing dependencies..."
        npm install
    fi
    
    # Start dev server
    print_status "Starting Vite dev server..."
    npm run dev -- --host &
    
    sleep 3
    print_success "React dev server started on port $DEV_PORT"
}

# Build React and deploy to backend
build_and_deploy() {
    print_step "Building React frontend..."
    
    if [ ! -d "$REACT_DIR" ]; then
        print_error "React directory not found: $REACT_DIR"
        return 1
    fi
    
    cd "$REACT_DIR"
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        print_status "Installing dependencies..."
        npm install
    fi
    
    # Build
    print_status "Running production build..."
    npm run build
    if [ $? -ne 0 ]; then
        print_error "Build failed!"
        return 1
    fi
    
    print_success "Build completed!"
    
    # Deploy to backend
    print_step "Deploying to backend..."
    
    # Backup old public if it exists
    if [ -d "$BACKEND_DIR/public" ] && [ ! -d "$BACKEND_DIR/public_old" ]; then
        mv "$BACKEND_DIR/public" "$BACKEND_DIR/public_old"
        print_status "Backed up old frontend to public_old"
    elif [ -d "$BACKEND_DIR/public" ]; then
        rm -rf "$BACKEND_DIR/public"
    fi
    
    # Copy new build
    cp -r "$REACT_DIR/dist" "$BACKEND_DIR/public"
    
    # Copy backend-specific assets if they exist in old public
    if [ -d "$BACKEND_DIR/public_old/images/playlists" ]; then
        mkdir -p "$BACKEND_DIR/public/images"
        cp -r "$BACKEND_DIR/public_old/images/playlists" "$BACKEND_DIR/public/images/"
        print_status "Copied playlist images"
    fi
    
    print_success "Deployed to backend/public"
    
    # Show build size
    local size=$(du -sh "$BACKEND_DIR/public" 2>/dev/null | cut -f1)
    print_status "Deployed size: $size"
    
    return 0
}

# Show status
show_status() {
    echo ""
    print_step "NOXA Music Status"
    echo ""
    
    local local_ip=$(get_local_ip)
    local backend_running=false
    local dev_running=false
    
    # Check backend
    if lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        backend_running=true
        local pid=$(lsof -ti:$BACKEND_PORT 2>/dev/null | head -1)
        print_success "Backend: Running (PID: $pid, Port: $BACKEND_PORT)"
    else
        print_warning "Backend: Not running"
    fi
    
    # Check dev server
    if lsof -Pi :$DEV_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        dev_running=true
        print_success "Dev Server: Running (Port: $DEV_PORT)"
    else
        print_status "Dev Server: Not running"
    fi
    
    # Check build
    if [ -d "$BACKEND_DIR/public" ] && [ -f "$BACKEND_DIR/public/index.html" ]; then
        local size=$(du -sh "$BACKEND_DIR/public" 2>/dev/null | cut -f1)
        print_success "Frontend Build: Deployed ($size)"
    else
        print_warning "Frontend Build: Not deployed"
    fi
    
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    
    if [ "$backend_running" = true ]; then
        echo -e "${GREEN}✓ NOXA Music is running!${NC}"
        echo ""
        echo -e "${CYAN}📱 Access:${NC}"
        echo -e "   ${BLUE}→${NC} Local:    ${GREEN}http://localhost:$BACKEND_PORT${NC}"
        echo -e "   ${BLUE}→${NC} Network:  ${GREEN}http://$local_ip:$BACKEND_PORT${NC}"
    else
        echo -e "${YELLOW}⚠ Backend is not running${NC}"
        echo ""
        echo -e "${CYAN}🚀 Start with:${NC} ${GREEN}./noxamusic.sh start${NC}"
    fi
    
    if [ "$dev_running" = true ]; then
        echo ""
        echo -e "${CYAN}🔧 Dev Server:${NC}"
        echo -e "   ${BLUE}→${NC} Local:    ${GREEN}http://localhost:$DEV_PORT${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Show logs
show_logs() {
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        print_error "Log file not found: $LOG_FILE"
    fi
}

# Print help
print_help() {
    print_banner
    echo -e "${CYAN}Usage:${NC}"
    echo -e "  ./noxamusic.sh ${GREEN}<command>${NC}"
    echo ""
    echo -e "${CYAN}Commands:${NC}"
    echo -e "  ${GREEN}start${NC}           Start backend server (production)"
    echo -e "  ${GREEN}stop${NC}            Stop all servers"
    echo -e "  ${GREEN}restart${NC}         Restart backend server"
    echo -e "  ${GREEN}dev${NC}             Start React dev server (for development)"
    echo -e "  ${GREEN}build${NC}           Build React and deploy to backend"
    echo -e "  ${GREEN}status${NC}          Show server status"
    echo -e "  ${GREEN}logs${NC}            Show backend logs (tail -f)"
    echo -e "  ${GREEN}help${NC}            Show this help"
    echo ""
    echo -e "${CYAN}Examples:${NC}"
    echo -e "  ./noxamusic.sh start     ${BLUE}# Start production server${NC}"
    echo -e "  ./noxamusic.sh restart   ${BLUE}# Restart server (after updates)${NC}"
    echo -e "  ./noxamusic.sh build     ${BLUE}# Build and deploy new frontend${NC}"
    echo -e "  ./noxamusic.sh dev       ${BLUE}# Start dev server for React development${NC}"
    echo ""
    echo -e "${CYAN}Ports:${NC}"
    echo -e "  Backend (production): ${GREEN}$BACKEND_PORT${NC}"
    echo -e "  React Dev Server:     ${GREEN}$DEV_PORT${NC}"
    echo ""
}

# Main
case "$1" in
    start)
        print_banner
        stop_all
        start_backend
        if [ $? -eq 0 ]; then
            show_status
        fi
        ;;
    stop)
        print_banner
        stop_all
        ;;
    restart)
        print_banner
        stop_all
        sleep 1
        start_backend
        if [ $? -eq 0 ]; then
            show_status
        fi
        ;;
    dev)
        print_banner
        start_dev
        ;;
    build)
        print_banner
        build_and_deploy
        echo ""
        print_status "Run './noxamusic.sh restart' to use new frontend"
        ;;
    status)
        print_banner
        show_status
        ;;
    logs)
        show_logs
        ;;
    help|--help|-h|"")
        print_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        print_help
        exit 1
        ;;
esac

exit 0
