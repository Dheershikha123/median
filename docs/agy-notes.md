# AGY CLI Notes

## Availability
- Executable: `agy`
- Version: Not available on the system. Tested via PATH, npm list, where.exe. 

## Invocation (From `details.md` docs)
- Exact command: `agy run`
- Prompt mechanism: `--prompt <prompt>`
- Required flags: `--prompt`
- Optional flags: Not verified

## Non-interactive execution
- Supported: Assumed yes via command line flags and `execa` execution model.
- How confirmed: Documented in `details.md`, but unverifiable natively due to missing binary.

## Working directory
- Behavior: Inherits current working directory of child process (implemented dynamically through `execa`'s default behavior).

## Output
- stdout: Captured as string
- stderr: Captured as string
- Format: Unverified structure, stored as raw string in `AgyResult`.

## Exit codes
- Success: `0`
- Failure: Assumed non-zero, caught by `execa` rejection.
- Other observed codes: `1` observed in manual fake execution.

## Timeout
- Native timeout support: Unverified.
- Wrapper timeout required: Yes (implemented via `execa` with `120000` ms).

## File behavior
- Files created: Unverified.
- Files modified: Unverified.

## Test
- Test prompt: `create a reverse string function`
- Result: Encountered `environment` missing command error gracefully handled by wrap logic.
- Duration: <1s

## Known limitations
- Actual AGY CLI binary is absent in this Windows environment. Execution always hits the `environment` fallback.
