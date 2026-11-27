/** Classify the app's source inventory independently of config files. */
export function language(files: string[], hasTsconfig: boolean) {
  const source = files.filter((f) => !/(?:\.config\.[jt]s|\.d\.ts)$/.test(f));
  const ts = source.some((f) => /\.tsx?$/.test(f)),
    js = source.some((f) => /\.jsx?$/.test(f));
  return ts && js ? "mixed" : ts && hasTsconfig ? "typescript" : "javascript";
}
