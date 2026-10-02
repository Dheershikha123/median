# AGY CLI Notes

## Availability
- Executable: `agy` (`agy.exe`)
- Installed path: `C:\Users\mvs35\AppData\Local\agy\bin\agy.exe` (on PATH)
- Version: Antigravity CLI

## Invocation
- Exact command: `agy --print <prompt> --output-format json --dangerously-skip-permissions`
- Prompt flag: `--print` (aliases: `-p`, `--prompt`)
- Note: There is NO `agy run` subcommand. Invocation uses top-level flags.
- Auto-permissions flag: `--dangerously-skip-permissions` (essential for unattended execution so file write/edit tools are auto-approved without prompting).

## Non-interactive execution
- Supported: Yes, natively via `--print` / `-p` / `--prompt`.
- How confirmed: Executed live in terminal with prompt `"reply with only the word PONG"`. Exited cleanly with code 0 in 2.2 seconds.

## Working directory
- Behavior: Inherits current working directory of child process (`execa` default).

## Output
- stdout: Formatted JSON when `--output-format json` is supplied.
- stderr: Captured as string on error.
- Format (`--output-format json`):
  ```json
  {
    "conversation_id": "f94261a2-27f7-4109-90fc-b93f77c43f9f",
    "status": "SUCCESS",
    "response": "PONG\n",
    "duration_seconds": 2.258746,
    "num_turns": 1,
    "usage": {
      "input_tokens": 12100,
      "output_tokens": 90,
      "thinking_tokens": 88,
      "cache_read_tokens": 0,
      "total_tokens": 12190
    }
  }
  ```

## Exit codes
- Success: `0`
- Failure: `1` (e.g. invalid flags or execution failure).

## Timeout
- Native timeout: `--print-timeout` available (default 0s = wait until complete).
- Wrapper timeout: Handled via `execa` with `120000` ms (2 minutes).

## Real Test Execution
- Test prompt: `agy --print "reply with only the word PONG" --output-format json --dangerously-skip-permissions`
- Result: Exited 0, returned status `SUCCESS`, response `PONG\n`, took 2.2s.
- Tested live in `wrapper/agy.ts` and verified with Vitest tests.
