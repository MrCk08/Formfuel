function cell(value: string) {
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value
  if (/[",\r\n]/.test(guarded)) return `"${guarded.replaceAll('"', '""')}"`
  return guarded
}

export function toCsv(headers: string[], rows: string[][]) {
  const lines = [headers, ...rows].map((row) => row.map((value) => cell(value ?? "")).join(","))
  return `\uFEFF${lines.join("\r\n")}\r\n`
}
