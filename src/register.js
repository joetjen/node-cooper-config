// The ESM face of `register.cjs`: importing it runs the CJS module once,
// against the same process-wide store `cooper-config` reads from.
import './register.cjs';
