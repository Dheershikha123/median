import { execa } from 'execa';
import { AgyResult } from '../types/index.js';

export function classifyFailure(err: any): 'environment' | 'timeout' | 'code_bug' {
    if (err.timedOut) {
        return 'timeout';
    }

    if (err.code === 'ENOENT') {
        return 'environment';
    }

    // Handle cases where the executable was found but a "command not found" error was nested
    if (err.message && (
        err.message.toLowerCase().includes('command not found') ||
        err.message.toLowerCase().includes('is not recognized')
    )) {
        return 'environment';
    }

    // Also check stderr for Windows shell errors
    if (err.stderr && err.stderr.toLowerCase().includes('is not recognized')) {
        return 'environment';
    }

    return 'code_bug';
}

export async function runAgy(prompt: string): Promise<AgyResult> {
    try {
        const { stdout, stderr, exitCode } = await execa('agy', ['run', '--prompt', prompt], {
            timeout: 120000
        });

        return {
            stdout,
            stderr,
            exitCode: exitCode ?? 0,
            // If execa doesn't throw, it's successful execution.
            // But if there is a non-zero exit code but execa was configured NOT to throw on error,
            // we'd handle it here. By default execa throws on non-zero exit code.
        };
    } catch (err: any) {
        return {
            stdout: err.stdout || '',
            stderr: err.stderr || err.message || '',
            exitCode: err.exitCode ?? 1,
            failureClass: classifyFailure(err)
        };
    }
}
