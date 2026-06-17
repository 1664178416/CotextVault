export function isMainWorldNetworkCaptureEnabled(): boolean {
  // The MVP ships the MAIN world patch as an inert shell. Page-context
  // postMessage control is forgeable, so a future opt-in path must provide a
  // stronger enable mechanism before this can return true.
  return false;
}

