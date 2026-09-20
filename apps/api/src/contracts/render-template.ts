export function renderTemplate(bodyMarkdown: string, variables: Record<string, string>): string {
  return bodyMarkdown.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) =>
    key in variables ? variables[key] : match,
  );
}
