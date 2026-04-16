#!/usr/bin/env node
// Reads wiki markdown files and produces corpus/chunks.json
// Usage: node scripts/ingest.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WIKI_ROOT = join(process.env.HOME, 'RigPal-Wiki');
const OUTPUT = join(__dirname, '..', 'corpus', 'chunks.json');

const SOURCES = [
  {
    path: 'OCTG/Connections/Spearhead.md',
    defaults: { connection_type: 'Spearhead', data_type: 'spec', topic: 'Spearhead Connection Overview' }
  },
  {
    path: 'RigPal/Specs/spearhead-connection-design.md',
    defaults: { connection_type: 'Spearhead', data_type: 'design', topic: 'Spearhead Design Knowledge' }
  },
  {
    path: 'RigPal/Specs/spearhead-2875-790-p110.md',
    defaults: { connection_type: 'Spearhead', data_type: 'spec', topic: 'Spearhead 2-7/8 Spec Sheet', size: '2-7/8' }
  },
  {
    path: 'RigPal/Specs/spearhead-2375-595-p110.md',
    defaults: { connection_type: 'Spearhead', data_type: 'spec', topic: 'Spearhead 2-3/8 Spec Sheet', size: '2-3/8' }
  },
  {
    path: 'OCTG/Torque-Reference.md',
    defaults: { connection_type: 'Spearhead', data_type: 'spec', topic: 'Torque Reference' }
  },
  {
    path: 'OCTG/Materials-and-Specifications.md',
    defaults: { connection_type: 'Spearhead', data_type: 'material', topic: 'Materials and Specifications' }
  },
  {
    path: 'OCTG/Connections/PH6-and-Competitors.md',
    defaults: { connection_type: 'PH6', data_type: 'comparison', topic: 'PH6 and Competitor Connections' }
  },
  {
    path: 'Specs/Hydril-CS-Connection.md',
    defaults: { connection_type: 'CS', data_type: 'comparison', topic: 'TenarisHydril CS Connection' }
  },
  {
    path: 'OCTG/Connections/TTS6-Black.md',
    defaults: { connection_type: 'TTS6-Black', data_type: 'spec', topic: 'TTS6-Black Connection' }
  },
  {
    path: 'OCTG/Recuts.md',
    defaults: { connection_type: 'General', data_type: 'procedure', topic: 'Recuts Reference' }
  },
  {
    path: 'RigPal/Specs/benoit-ht6-2875-790-p110.md',
    defaults: { connection_type: 'BEN-HT6', data_type: 'comparison', topic: 'Benoit BEN-HT6 Spec Comparison' }
  },
  {
    path: 'OCTG/Licensee-Program.md',
    defaults: { connection_type: 'General', data_type: 'program', topic: 'Tejas Licensee Program' }
  },
];

// Sections to exclude (internal info, not for public chatbot)
const EXCLUDED_SECTIONS = [
  'Timeline',
  'Key Documents',
  'Key People at Tejas',
  'Key Contacts at Tejas',
  'Sources',
  'See Also',
  'Patents',
  'Patent Assignment History',
];

function stripFrontmatter(content) {
  const match = content.match(/^---\n[\s\S]*?\n---\n/);
  return match ? content.slice(match[0].length) : content;
}

function stripEmails(text) {
  return text.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[email removed]');
}

function stripPhoneNumbers(text) {
  return text.replace(/\b\d{3}[.-]\d{3}[.-]\d{4}\b/g, '[phone removed]');
}

function splitIntoSections(content) {
  const sections = [];
  const lines = content.split('\n');
  let docTitle = '';
  let currentHeading = 'Introduction';
  let currentLines = [];
  let headingLevel = 0;

  for (const line of lines) {
    // Capture document title
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      docTitle = line.replace(/^# /, '').trim();
      continue;
    }

    if (line.startsWith('## ')) {
      if (currentLines.length > 0) {
        sections.push({ heading: currentHeading, text: currentLines.join('\n').trim(), docTitle });
      }
      currentHeading = line.replace(/^## /, '').trim();
      currentLines = [];
      headingLevel = 2;
    } else if (line.startsWith('### ') && headingLevel <= 2) {
      // Keep ### subsections within their ## parent
      currentLines.push(line);
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length > 0) {
    sections.push({ heading: currentHeading, text: currentLines.join('\n').trim(), docTitle });
  }
  return sections;
}

function shouldExclude(heading) {
  return EXCLUDED_SECTIONS.some(ex =>
    heading.toLowerCase().startsWith(ex.toLowerCase())
  );
}

function chunkSection(section, maxChars = 2800) {
  const fullText = section.text;
  if (fullText.length <= maxChars) {
    return [{ heading: section.heading, text: fullText, docTitle: section.docTitle }];
  }

  // Split at ### subsection boundaries first
  const subSections = fullText.split(/(?=^### )/m);
  const chunks = [];
  let current = '';

  for (const sub of subSections) {
    if (current.length + sub.length > maxChars && current.length > 200) {
      chunks.push({ heading: section.heading, text: current.trim(), docTitle: section.docTitle });
      current = '';
    }
    current += (current ? '\n\n' : '') + sub;
  }
  if (current.trim().length > 50) {
    chunks.push({ heading: section.heading, text: current.trim(), docTitle: section.docTitle });
  }
  return chunks;
}

function detectSizes(text) {
  const sizes = [];
  if (/2[-\s]?7\/8|2\.875/i.test(text)) sizes.push('2-7/8');
  if (/2[-\s]?3\/8|2\.375/i.test(text)) sizes.push('2-3/8');
  return sizes.length > 0 ? sizes : undefined;
}

function detectGrade(text) {
  if (/P-?110/i.test(text)) return 'P-110';
  if (/L-?80/i.test(text)) return 'L-80';
  return undefined;
}

// ---- Main ----

const allChunks = [];
let id = 0;

for (const source of SOURCES) {
  const fullPath = join(WIKI_ROOT, source.path);
  let content;
  try {
    content = readFileSync(fullPath, 'utf-8');
  } catch (e) {
    console.warn(`Skipping ${source.path}: ${e.message}`);
    continue;
  }

  const clean = stripFrontmatter(content);
  const sections = splitIntoSections(clean);

  for (const section of sections) {
    if (shouldExclude(section.heading)) continue;

    const chunks = chunkSection(section);
    for (const chunk of chunks) {
      let text = chunk.text;
      text = stripEmails(text);
      text = stripPhoneNumbers(text);

      if (text.length < 80) continue;

      // Build the chunk text with context
      const contextHeader = chunk.docTitle
        ? `[${chunk.docTitle} - ${chunk.heading}]`
        : `[${chunk.heading}]`;

      allChunks.push({
        id: `chunk-${id++}`,
        text: `${contextHeader}\n\n${text}`,
        source: source.defaults.topic,
        sourceFile: source.path,
        section: chunk.heading,
        metadata: {
          connection_type: source.defaults.connection_type,
          data_type: source.defaults.data_type,
          topic: source.defaults.topic,
          size: source.defaults.size || undefined,
          sizes: detectSizes(text),
          grade: detectGrade(text),
        }
      });
    }
  }
}

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(allChunks, null, 2));
console.log(`Generated ${allChunks.length} chunks from ${SOURCES.length} source files`);
console.log(`Total text: ${Math.round(allChunks.reduce((sum, c) => sum + c.text.length, 0) / 1024)} KB`);
