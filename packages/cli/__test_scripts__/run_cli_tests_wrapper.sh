#!/bin/bash

# Wrapper script to ensure correct exit code propagation

# Enable debug output
set -x

# Print environment details for debugging
echo "===== DEBUG INFO ====="
echo "OS: $(uname -a)"
echo "Running in GitHub Actions: ${GITHUB_ACTIONS:-false}"
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"
echo "Bun version: $(bun -v)"
echo "Current directory: $(pwd)"
echo "===== END DEBUG INFO ====="

echo "Running CLI tests through wrapper script"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"

# Determine the correct path to run_cli_tests.sh based on current location
if [ -f "$SCRIPT_DIR/run_cli_tests.sh" ]; then
  # If we're already in the __test_scripts__ directory
  TEST_SCRIPT_PATH="$SCRIPT_DIR/run_cli_tests.sh"
elif [ -f "./packages/cli/__test_scripts__/run_cli_tests.sh" ]; then
  # If we're at the project root
  TEST_SCRIPT_PATH="./packages/cli/__test_scripts__/run_cli_tests.sh"
else
  echo "ERROR: Could not find run_cli_tests.sh in expected locations"
  echo "Searched in: $SCRIPT_DIR/run_cli_tests.sh"
  echo "Searched in: ./packages/cli/__test_scripts__/run_cli_tests.sh"
  exit 1
fi

echo "Using test script path: $TEST_SCRIPT_PATH"

# Call the original script with the correct path
bash "$TEST_SCRIPT_PATH"

# Capture and print the exit code
EXIT_CODE=$?
echo "Original script exited with code: $EXIT_CODE"

# Print more detailed status messages based on exit code
if [ $EXIT_CODE -eq 0 ]; then
  echo "SUCCESS: All tests passed successfully"
else
  echo "ERROR: Tests failed with exit code $EXIT_CODE"
  # Print any test failure logs if they exist
  if [ -d "$SCRIPT_DIR/logs" ]; then
    echo "Test logs:"
    find "$SCRIPT_DIR/logs" -type f -name "*.log" -exec cat {} \;
  fi
fi

# Ensure we exit with the same code
exit $EXIT_CODE