// CI sets SPEEQ_TELEMETRY=0 and CI=true for the whole job. Tests must not depend on the
// ambient environment, so clear the switches that gate telemetry and the update check.
for (const key of ["SPEEQ_TELEMETRY", "SPEEQ_UPDATE_CHECK", "SPEEQ_PLATFORM_URL", "CI"]) {
  delete process.env[key];
}
