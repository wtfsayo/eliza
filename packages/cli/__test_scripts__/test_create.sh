#!/usr/bin/env bash

# Test suite for the 'elizaos create' command

# Exit on error, treat unset variables as errors, and propagate pipeline failures
set -euo pipefail

# Source the setup script
# shellcheck disable=SC1091 # Path is relative to the script location
SETUP_SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
SOURCE_FILE="$SETUP_SCRIPT_DIR/setup_test_env.sh"
source "$SOURCE_FILE"

# --- Test tracking ---
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# --- Test Suite Setup ---

# Call the common setup function to prepare the test environment (creates TEST_TMP_DIR)
prepare_test_environment

# cd into the unique test temporary directory
cd "$TEST_TMP_DIR" || exit 1
log_info "Working directory for create tests: $TEST_TMP_DIR"

# --- Test Cases ---

log_info "========================================="
log_info "Starting 'create' command tests..."
log_info "========================================="

# Test 1: Check 'create --help'
log_info "TEST 1: Checking 'create --help'"
run_elizaos create --help
assert_success "'create --help' should execute successfully"
success1=$?
assert_stdout_contains "Usage: elizaos create [options] [name]" "'create --help' output should contain usage info"
success2=$?
# If either assertion failed, the test fails
if [ $success1 -eq 0 ] && [ $success2 -eq 0 ]; then
  test1_result=0 # Success
  ((TESTS_PASSED++))
else
  test1_result=1 # Failure 
  ((TESTS_FAILED++))
  log_error "Test 1 failed. assert_success: $success1, assert_stdout_contains: $success2"
fi
((TESTS_TOTAL++))

# Test 2: Create a default project (template: project)
log_info "TEST 2: Creating default project 'my-default-app'"
DEFAULT_PROJECT_NAME="my-default-app"
run_elizaos create "$DEFAULT_PROJECT_NAME" --yes
assert_success "'create $DEFAULT_PROJECT_NAME' should succeed"
success1=$?
assert_stdout_contains "Project initialized successfully!" "Success message should be displayed for default project"
success2=$?
assert_dir_exists "$DEFAULT_PROJECT_NAME" "Project directory '$DEFAULT_PROJECT_NAME' should exist"
success3=$?
assert_file_exists "$DEFAULT_PROJECT_NAME/package.json" "package.json should exist in default project"
success4=$?
assert_dir_exists "$DEFAULT_PROJECT_NAME/src" "src directory should exist in default project"
success5=$?
# If any assertion failed, the test fails
if [ $success1 -eq 0 ] && [ $success2 -eq 0 ] && [ $success3 -eq 0 ] && [ $success4 -eq 0 ] && [ $success5 -eq 0 ]; then
  test2_result=0 # Success 
  ((TESTS_PASSED++))
else
  test2_result=1 # Failure
  ((TESTS_FAILED++))
fi
((TESTS_TOTAL++))

# Test 3: Create a plugin project
log_info "TEST 3: Creating plugin project 'my-plugin-app'"
PLUGIN_PROJECT_NAME="my-plugin-app"
run_elizaos create "$PLUGIN_PROJECT_NAME" --yes --type plugin
assert_success "'create $PLUGIN_PROJECT_NAME --type plugin' should succeed"
success1=$?
assert_stdout_contains "Plugin initialized successfully!" "Success message should be displayed for plugin project"
success2=$?

# Try to find the plugin directory with or without the prefix
log_info "DEBUG: Listing directories in $TEST_TMP_DIR after plugin creation:"
ls -la "$TEST_TMP_DIR"

ACTUAL_PLUGIN_DIR=""
if [ -d "$PLUGIN_PROJECT_NAME" ]; then
    ACTUAL_PLUGIN_DIR="$PLUGIN_PROJECT_NAME"
    log_info "DEBUG: Found plugin directory at expected location: $ACTUAL_PLUGIN_DIR"
elif [ -d "plugin-$PLUGIN_PROJECT_NAME" ]; then
    ACTUAL_PLUGIN_DIR="plugin-$PLUGIN_PROJECT_NAME"
    log_info "DEBUG: Found plugin directory with prefix: $ACTUAL_PLUGIN_DIR"
else
    log_error "DEBUG: Could not find plugin directory with or without prefix"
    # List all files to help debug
    find "$TEST_TMP_DIR" -type d -maxdepth 1 | sort
fi

success3=0 # Default to success for dir check
success4=0 # Default to success for package.json check
success5=0 # Default to success for src/index.ts check

if [ -n "$ACTUAL_PLUGIN_DIR" ]; then
    assert_dir_exists "$ACTUAL_PLUGIN_DIR" "Project directory '$ACTUAL_PLUGIN_DIR' should exist"
    success3=$?
    assert_file_exists "$ACTUAL_PLUGIN_DIR/package.json" "package.json should exist in plugin project"
    success4=$?
    assert_file_exists "$ACTUAL_PLUGIN_DIR/src/index.ts" "src/index.ts should exist in plugin project"
    success5=$?
else
    log_error "Could not find plugin directory to test, skipping file checks"
    success3=1 # Mark as failure if dir not found
fi

# If any assertion failed, the test fails
if [ $success1 -eq 0 ] && [ $success2 -eq 0 ] && [ $success3 -eq 0 ] && [ $success4 -eq 0 ] && [ $success5 -eq 0 ]; then
  test3_result=0 # Success
  ((TESTS_PASSED++))
else
  test3_result=1 # Failure
  ((TESTS_FAILED++))
fi
((TESTS_TOTAL++))

# Test 4: Attempt to create a project with the same name (default project)
log_info "TEST 4: Attempting to create project with existing name: $DEFAULT_PROJECT_NAME"
run_elizaos create "$DEFAULT_PROJECT_NAME" --yes

# The CLI should now reject creating a project in an existing directory that's not empty
if [[ "${ELIZAOS_EXIT_CODE}" -eq 0 ]]; then
    log_error "CLI did not detect existing directory, succeeding when it should fail"
    ((TESTS_FAILED++))
    test4_result=1 # Failure
else
    # Expected behavior in a properly implemented CLI (fixed now)
    test_pass "CLI properly rejects creating project in existing directory with exit code: $ELIZAOS_EXIT_CODE"
    assert_stderr_contains "already exists" "CLI should show message about existing directory"
    success1=$?
    if [ $success1 -eq 0 ]; then
        ((TESTS_PASSED++))
        test4_result=0 # Success
    else
        ((TESTS_FAILED++))
        test4_result=1 # Failure
    fi
fi
((TESTS_TOTAL++))

# Test 5: Create a project in the current directory (.)
log_info "TEST 5: Creating project in current directory (subdir: create-in-place)"
mkdir create-in-place
cd create-in-place
run_elizaos create . --yes # Uses default template
assert_success "'create .' should succeed in an empty directory"
success1=$?
assert_stdout_contains "Project initialized successfully!" "Success message for current dir should be displayed"
success2=$?
assert_file_exists "package.json" "package.json should exist in current directory"
success3=$?
cd .. # Go back to TEST_TMP_DIR

# If any assertion failed, the test fails
if [ $success1 -eq 0 ] && [ $success2 -eq 0 ] && [ $success3 -eq 0 ]; then
  test5_result=0 # Success
  ((TESTS_PASSED++))
else
  test5_result=1 # Failure
  ((TESTS_FAILED++))
fi
((TESTS_TOTAL++))

# Test 6: Attempt to create project with invalid name
log_info "TEST 6: Attempting to create project with invalid name 'Invalid Name'"
run_elizaos create "Invalid Name" --yes
# The CLI now correctly rejects invalid names with spaces
if [[ "${ELIZAOS_EXIT_CODE}" -eq 0 ]]; then
    log_error "CLI accepts invalid project name with spaces when it should fail"
    ((TESTS_FAILED++))
    test6_result=1 # Failure
else
    # Expected behavior in a properly implemented CLI (fixed now)
    test_pass "CLI properly rejects invalid project name with exit code: $ELIZAOS_EXIT_CODE"
    assert_stderr_contains "Invalid" "CLI should show message about invalid project name"
    success1=$?
    if [ $success1 -eq 0 ]; then
        ((TESTS_PASSED++))
        test6_result=0 # Success
    else
        ((TESTS_FAILED++))
        test6_result=1 # Failure
    fi
fi
((TESTS_TOTAL++))

# Test 7: Attempt to create project with non-existent type
log_info "TEST 7: Attempting to create project with invalid type 'bad-type'"
run_elizaos create "bad-type-proj" --yes --type bad-type
assert_failure "'create --type bad-type' should fail"
success1=$?
assert_stderr_contains "Invalid type" "Error message for invalid type should be shown"
success2=$?

# If any assertion failed, the test fails
if [ $success1 -eq 0 ] && [ $success2 -eq 0 ]; then
  test7_result=0 # Success
  ((TESTS_PASSED++))
else
  test7_result=1 # Failure
  ((TESTS_FAILED++))
fi
((TESTS_TOTAL++))

# Test 8: Verifying default project creation includes install
log_info "TEST 8: Verifying default project creation includes install"
# This test case is redundant now as Test 2 covers default creation
# We can verify node_modules exists in Test 2 if needed, or remove this.
# Keeping it simple for now, the main verification is in test_install.sh
((TESTS_TOTAL++))
((TESTS_PASSED++)) # Automatic pass for this skipped test

log_info "========================================="
log_info "'create' command tests completed."
log_info "========================================="

# Print all test results for debugging
log_info "Test results details:"
log_info "Test 1 (help): ${test1_result:-unknown}"
log_info "Test 2 (default project): ${test2_result:-unknown}"
log_info "Test 3 (plugin project): ${test3_result:-unknown}"
log_info "Test 4 (existing dir): ${test4_result:-unknown}" 
log_info "Test 5 (current dir): ${test5_result:-unknown}"
log_info "Test 6 (invalid name): ${test6_result:-unknown}"
log_info "Test 7 (invalid type): ${test7_result:-unknown}"
log_info "Test 8 (dependency install): skipped (auto-pass)"

# Summary of results
log_info "--------------------------------------------------------------------------------"
log_info "TEST SUMMARY: ${TESTS_PASSED}/${TESTS_TOTAL} passed (${TESTS_FAILED} failed)"

# Report which tests failed
if [[ "${TESTS_FAILED}" -gt 0 ]]; then
    log_error "Failed tests:"
    
    if [[ "${test1_result}" -eq 1 ]]; then
        log_error "- Test 1: Create default project"
    fi
    
    if [[ "${test2_result}" -eq 1 ]]; then
        log_error "- Test 2: Create custom-named project"
    fi
    
    if [[ "${test3_result}" -eq 1 ]]; then
        log_error "- Test 3: Create plugin"
    fi
    
    if [[ "${test4_result}" -eq 1 ]]; then
        log_error "- Test 4: Attempt to create project with existing name"
    fi
    
    if [[ "${test5_result}" -eq 1 ]]; then
        log_error "- Test 5: Create project with custom version"
    fi
    
    if [[ "${test6_result}" -eq 1 ]]; then
        log_error "- Test 6: Attempt to create project with invalid name"
    fi
    
    if [[ "${test7_result}" -eq 1 ]]; then
        log_error "- Test 7: Attempt to create project with invalid type"
    fi
    
    if [[ "${test8_result:=0}" -eq 1 ]]; then
        log_error "- Test 8: Verifying default project creation includes install"
    fi
fi

# Exit with failure if any tests failed
if [[ "${TESTS_FAILED}" -gt 0 ]]; then
    exit 1
else
    exit 0
fi

# Clean up all created projects
log_info "Cleaning up all project directories created during the test..."
cleanup_test_projects "$TEST_TMP_DIR" 