export function run(input) {
  let text = typeof input.text === 'string' ? input.text : String(input.text);
  const header = input.header === true;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const columns = header ? [] : null;
  const rows = [];
  const errors = [];
  const length = text.length;
  let i = 0;
  let line = 1;
  let width = -1;

  while (i < length) {
    const recordLine = line;
    const fields = [];
    let onlyEmptyUnquoted = true;
    let endedByBreak = false;

    while (true) {
      let value;
      let quoted = false;
      const fieldStart = i;

      if (i < length && text.charCodeAt(i) === 34) {
        const openingLine = line;
        quoted = true;
        i++;
        const contentStart = i;
        let segmentStart = i;
        let parts = null;
        let closed = false;

        while (i < length) {
          const c = text.charCodeAt(i);
          if (c === 34) {
            if (i + 1 < length && text.charCodeAt(i + 1) === 34) {
              if (parts === null) parts = [];
              parts.push(text.slice(segmentStart, i), '"');
              i += 2;
              segmentStart = i;
              continue;
            }
            if (parts === null) value = text.slice(contentStart, i);
            else {
              parts.push(text.slice(segmentStart, i));
              value = parts.join('');
            }
            i++;
            closed = true;
            break;
          }
          if (c === 13 || c === 10) {
            if (parts === null) parts = [];
            parts.push(text.slice(segmentStart, i), '\n');
            if (c === 13 && i + 1 < length && text.charCodeAt(i + 1) === 10) i += 2;
            else i++;
            line++;
            segmentStart = i;
            continue;
          }
          i++;
        }

        if (!closed) {
          errors.push({ code: 'unterminated_quote', line: recordLine, row: header && width < 0 ? null : rows.length });
          // Re-read after the opening quote using the ordinary unquoted rules.
          let start = fieldStart + 1;
          let parts2 = ['"'];
          let segment = start;
          i = start;
          line = openingLine;
          while (i < length) {
            const c = text.charCodeAt(i);
            if (c === 44 || c === 10 || (c === 13 && i + 1 < length && text.charCodeAt(i + 1) === 10)) break;
            if (c === 13) {
              if (parts2 === null) parts2 = [];
              parts2.push(text.slice(segment, i));
              i++;
              errors.push({ code: 'stray_cr', line: recordLine, row: header && width < 0 ? null : rows.length });
              segment = i;
              continue;
            }
            i++;
          }
          parts2.push(text.slice(segment, i));
          value = parts2.join('');
        } else if (i < length) {
          const c = text.charCodeAt(i);
          if (c !== 44 && c !== 10 && !(c === 13 && i + 1 < length && text.charCodeAt(i + 1) === 10)) {
            const junkStart = i;
            let junkParts = null;
            let junkSegment = i;
            let junkLength = 0;
            while (i < length) {
              const d = text.charCodeAt(i);
              if (d === 44 || d === 10 || (d === 13 && i + 1 < length && text.charCodeAt(i + 1) === 10)) break;
              if (d === 13) {
                if (junkParts === null) junkParts = [];
                junkParts.push(text.slice(junkSegment, i));
                i++;
                errors.push({ code: 'stray_cr', line: recordLine, row: header && width < 0 ? null : rows.length });
                junkSegment = i;
              } else i++;
            }
            if (junkParts === null) value += text.slice(junkStart, i);
            else {
              junkParts.push(text.slice(junkSegment, i));
              value += junkParts.join('');
            }
            junkLength = junkParts === null ? i - junkStart : junkParts.join('').length;
            if (junkLength > 0) errors.push({ code: 'quote_junk', line: recordLine, row: header && width < 0 ? null : rows.length });
          }
        }
      } else {
        const start = i;
        let parts = null;
        let segment = i;
        while (i < length) {
          const c = text.charCodeAt(i);
          if (c === 44 || c === 10 || (c === 13 && i + 1 < length && text.charCodeAt(i + 1) === 10)) break;
          if (c === 13) {
            if (parts === null) parts = [];
            parts.push(text.slice(segment, i));
            i++;
            errors.push({ code: 'stray_cr', line: recordLine, row: header && width < 0 ? null : rows.length });
            segment = i;
          } else i++;
        }
        if (parts === null) value = text.slice(start, i);
        else {
          parts.push(text.slice(segment, i));
          value = parts.join('');
        }
      }

      fields.push(value);
      if (quoted || value.length !== 0) onlyEmptyUnquoted = false;

      if (i >= length) break;
      const c = text.charCodeAt(i);
      if (c === 44) {
        i++;
        continue;
      }
      if (c === 13 && i + 1 < length && text.charCodeAt(i + 1) === 10) i += 2;
      else i++;
      line++;
      endedByBreak = true;
      break;
    }

    if (!(fields.length === 1 && onlyEmptyUnquoted)) {
      if (width < 0) {
        width = fields.length;
        if (header) columns.push(...fields);
        else rows.push(fields);
      } else {
        const rowIndex = rows.length;
        if (fields.length < width) {
          errors.push({ code: 'short_row', line: recordLine, row: rowIndex, fields: fields.length });
          while (fields.length < width) fields.push('');
        } else if (fields.length > width) {
          const extra = fields.slice(width);
          errors.push({ code: 'long_row', line: recordLine, row: rowIndex, extra });
          fields.length = width;
        }
        rows.push(fields);
      }
    }

    // Empty physical lines are skipped, including the final empty position after a break.
    if (endedByBreak && i === length) break;
  }

  return { columns, rows, errors };
}
