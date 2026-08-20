const fs = require('fs');

const batchPath = 'C:\\Users\\03hag\\Claude projects\\800+\\typo-lab\\out\\blind\\batch2\\C-03.tsv';
const verdictsPath = 'C:\\Users\\03hag\\Claude projects\\800+\\typo-lab\\out\\blind\\batch2\\work\\verdicts.psv';
const outPath = 'C:\\Users\\03hag\\Claude projects\\800+\\typo-lab\\out\\blind\\verdict2\\C-03-J2.tsv';

function splitCands(s) {
  const parts = [];
  let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && s.substr(i, 3) === ' | ') {
      parts.push(cur.trim());
      cur = '';
      i += 2;
      continue;
    }
    cur += ch;
  }
  if (cur.trim().length) parts.push(cur.trim());
  return parts;
}

// --- load batch ---
const batchRaw = fs.readFileSync(batchPath, 'utf8');
const batchLines = batchRaw.split(/\r?\n/).filter(l => l.length > 0);
const items = []; // {k, term, cands[]}
for (let i = 1; i < batchLines.length; i++) {
  const [k, term, cands] = batchLines[i].split('\t');
  items.push({ k, term, cands: splitCands(cands) });
}

// --- load verdicts ---
const vRaw = fs.readFileSync(verdictsPath, 'utf8');
const vLines = vRaw.split(/\r?\n/).filter(l => l.length > 0);
const verdicts = {}; // k -> {seq, note}
for (const line of vLines) {
  const parts = line.split('|');
  const k = parts[0];
  const seq = parts[1];
  const note = parts.slice(2).join('|');
  verdicts[k] = { seq, note };
}

// --- build output with validation ---
const outLines = [];
const errors = [];
let totalCands = 0, totalK = 0, totalL = 0;

for (const item of items) {
  const v = verdicts[item.k];
  if (!v) {
    errors.push(`MISSING verdict for ${item.k} (${item.term})`);
    continue;
  }
  if (v.seq.length !== item.cands.length) {
    errors.push(`LENGTH MISMATCH ${item.k} (${item.term}): seq=${v.seq.length} cands=${item.cands.length} [${item.cands.join(' / ')}]`);
    continue;
  }
  if (!/^[KL]+$/.test(v.seq)) {
    errors.push(`BAD CHARS ${item.k}: seq="${v.seq}"`);
    continue;
  }
  const hebSeq = v.seq.split('').map(c => c === 'K' ? '\u05DB' : '\u05DC').join(''); // כ or ל
  for (const c of v.seq) { if (c === 'K') totalK++; else totalL++; }
  totalCands += item.cands.length;
  const note = v.note.length ? v.note : '-';
  outLines.push(`${item.k}\t${hebSeq}\t${note}`);
}

console.log('items in batch:', items.length);
console.log('lines built:', outLines.length);
console.log('errors:', errors.length);
errors.forEach(e => console.log('  ' + e));
console.log('total candidates:', totalCands, ' K:', totalK, ' L:', totalL, ' L%:', (100 * totalL / totalCands).toFixed(1));

if (errors.length === 0 && outLines.length === items.length) {
  fs.writeFileSync(outPath, outLines.join('\n') + '\n', 'utf8');
  console.log('WROTE:', outPath);
} else {
  console.log('NOT WRITTEN due to errors/mismatch');
}
