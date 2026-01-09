#!/bin/bash

# Monitor the YouTube Music import progress

echo "YouTube Music Import Monitor"
echo "============================="
echo ""

# Check if process is running
if ps aux | grep -E "node.*youtube_music_import" | grep -v grep > /dev/null; then
    echo "✅ Import process is RUNNING"
    echo ""
else
    echo "❌ Import process is NOT running"
    echo ""
    exit 1
fi

# Get the terminal log file
LOG_FILE="/home/tokyo/.cursor/projects/home-tokyo-Desktop-music-app/terminals/2.txt"

if [ -f "$LOG_FILE" ]; then
    echo "📊 Current Progress:"
    echo ""
    
    # Extract the latest progress stats
    tail -500 "$LOG_FILE" | grep -A 5 "📊 Progress:" | tail -6
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "🎵 Latest track being processed:"
    tail -100 "$LOG_FILE" | grep -E "^\[.*\] " | tail -1
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "📋 Recent activity (last 20 lines):"
    tail -20 "$LOG_FILE"
else
    echo "❌ Log file not found: $LOG_FILE"
fi



