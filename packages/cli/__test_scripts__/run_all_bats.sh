#!/usr/bin/env bash
# run_all_bats.sh
# Master script to run all Bats test files in this directory, with summary

set -e

BATS_BIN="$(command -v bats || true)"

if [ -z "$BATS_BIN" ]; then
  echo "[ERROR] 'bats' not found in PATH."
  echo "Please install bats globally using one of the following commands:"
  echo "  npm install -g bats"
  echo "  # or, if you use bun:"
  echo "  bun add -g bats"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Print system and environment information for diagnostics
echo "==================================================="
echo "ENVIRONMENT INFORMATION:"
echo "OS: $(uname -a)"
echo "Node version: $(node --version)"
echo "Bun version: $(bun --version)"
echo "Running in CI: ${CI:-false}"
echo "Current directory: $(pwd)"
echo "==================================================="

# Build the CLI if needed
if [ ! -f "../dist/index.js" ]; then
  echo "[INFO] CLI not built, building now..."
  (cd .. && bun run build)
fi

ALL_BATS=(test_*.bats)

if [ ${#ALL_BATS[@]} -eq 0 ]; then
  echo "[ERROR] No .bats test files found."
  exit 1
fi

# Check for running ElizaOS processes and warn
if pgrep -f "elizaos|eliza start" > /dev/null; then
  echo "[WARNING] Detected running ElizaOS processes that might interfere with tests."
  echo "Running processes:"
  ps aux | grep -E "elizaos|eliza start" | grep -v grep
  echo ""
  
  # In CI, we should kill these processes to avoid interference
  if [ -n "$CI" ]; then
    echo "[CI] Automatically terminating running ElizaOS processes..."
    pkill -f "elizaos|eliza start" || true
    sleep 2
  fi
fi

total=0
passed=0
failed=0
FAILED_FILES=()

# Run tests with retry logic for CI environments
MAX_ATTEMPTS=2 # Retry failed tests once in CI

for bats_file in "${ALL_BATS[@]}"; do
  echo "==================================================="
  echo "[INFO] Running $bats_file"
  # Add a small delay between tests to avoid port conflicts
  sleep 2
  
  TEST_PASSED=false
  ATTEMPTS=0
  
  while [ "$TEST_PASSED" = "false" ] && [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
    ATTEMPTS=$((ATTEMPTS+1))
    
    if [ $ATTEMPTS -gt 1 ]; then
      echo "[INFO] Retry attempt $ATTEMPTS for $bats_file"
    fi
    
    if "$BATS_BIN" "$bats_file"; then
      TEST_PASSED=true
      passed=$((passed+1))
      break
    elif [ $ATTEMPTS -lt $MAX_ATTEMPTS ] && [ -n "$CI" ]; then
      echo "[CI] Test failed, will retry after cleanup..."
      # Kill any leftover processes
      pkill -f "elizaos|eliza start" 2>/dev/null || true
      sleep 5
    else
      failed=$((failed+1))
      FAILED_FILES+=("$bats_file")
      echo "[ERROR] Test file $bats_file failed!"
      break
    fi
  done
  
  total=$((total+1))
  echo "==================================================="
  echo
done

# Summary Table
printf '\n==================== SUMMARY ====================\n'
printf "Total test files: %d\n" "$total"
printf "Passed:          %d\n" "$passed"
printf "Failed:          %d\n" "$failed"

if [ $failed -ne 0 ]; then
  printf "\nFAILED TEST FILES:\n"
  for f in "${FAILED_FILES[@]}"; do
    printf "  - %s\n" "$f"
  done
  
  # In CI, provide more diagnostics
  if [ -n "$CI" ]; then
    echo -e "\nDiagnostic information for CI:"
    echo "Network ports in use:"
    netstat -tuln || true
    echo "Running processes:"
    ps aux | grep -E "node|bun|eliza" | grep -v grep || true
    
    # Check temporary directories
    echo "Temporary test directories:"
    find /var/tmp -name "eliza-test-*" -type d 2>/dev/null || true
    
    # Clean up test directories in CI
    echo "Cleaning up leftover test directories..."
    find /var/tmp -name "eliza-test-*" -type d -exec rm -rf {} \; 2>/dev/null || true
  fi
fi

if [ $failed -eq 0 ]; then
  printf "\nALL TEST SUITES PASSED!\n"
else
  printf "\nSOME TEST SUITES FAILED.\n"
fi

if [ $failed -eq 0 ]; then
  exit 0
else
  exit 1
fi