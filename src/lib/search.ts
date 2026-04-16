// BM25 search implementation for the Spearhead corpus
// No external dependencies — runs in-memory on Vercel serverless

export interface Chunk {
  id: string;
  text: string;
  source: string;
  sourceFile: string;
  section: string;
  metadata: {
    connection_type: string;
    data_type: string;
    topic: string;
    size?: string;
    sizes?: string[];
    grade?: string;
  };
}

interface TokenStats {
  tf: Map<string, number>; // term frequency
  length: number; // total tokens
}

// BM25 parameters
const K1 = 1.5;
const B = 0.75;

// Synonyms / term expansion for OCTG domain
const SYNONYMS: Record<string, string[]> = {
  'torque': ['torque', 'mut', 'makeup', 'make-up', 'rotating', 'yield', 'torsion', 'torsional'],
  'spearhead': ['spearhead', 'sph'],
  'ph6': ['ph6', 'hydril', 'tenaris'],
  'connection': ['connection', 'thread', 'coupling'],
  'wear': ['wear', 'worn', 'life', 'remaining'],
  'compound': ['compound', 'dope', 'bol', 'jetlube', 'best-o-life'],
  'grade': ['grade', 'p-110', 'p110', 'material', 'ksi'],
  'dimension': ['dimension', 'od', 'id', 'diameter', 'size'],
  'gas': ['gas', 'gas-tight', 'seal', 'leak'],
  'compare': ['compare', 'comparison', 'versus', 'vs'],
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s\-\/\.]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function expandQuery(tokens: string[]): string[] {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    for (const [, synonyms] of Object.entries(SYNONYMS)) {
      if (synonyms.includes(token)) {
        for (const syn of synonyms) {
          expanded.add(syn);
        }
      }
    }
  }
  return Array.from(expanded);
}

function computeTokenStats(tokens: string[]): TokenStats {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  return { tf, length: tokens.length };
}

export class BM25Index {
  private chunks: Chunk[];
  private docStats: TokenStats[];
  private avgDl: number;
  private df: Map<string, number>; // document frequency
  private N: number;

  constructor(chunks: Chunk[]) {
    this.chunks = chunks;
    this.N = chunks.length;
    this.df = new Map();
    this.docStats = [];

    let totalLength = 0;

    for (const chunk of chunks) {
      const tokens = tokenize(chunk.text);
      const stats = computeTokenStats(tokens);
      this.docStats.push(stats);
      totalLength += stats.length;

      const seen = new Set<string>();
      for (const token of tokens) {
        if (!seen.has(token)) {
          this.df.set(token, (this.df.get(token) || 0) + 1);
          seen.add(token);
        }
      }
    }

    this.avgDl = totalLength / this.N;
  }

  search(query: string, topK: number = 8, filters?: { connection_type?: string; size?: string }): Array<Chunk & { score: number }> {
    const queryTokens = expandQuery(tokenize(query));
    const scores: Array<{ index: number; score: number }> = [];

    for (let i = 0; i < this.N; i++) {
      const chunk = this.chunks[i];

      // Apply metadata filters
      if (filters?.connection_type && chunk.metadata.connection_type !== filters.connection_type) {
        continue;
      }
      if (filters?.size) {
        const chunkSizes = chunk.metadata.sizes || (chunk.metadata.size ? [chunk.metadata.size] : []);
        if (chunkSizes.length > 0 && !chunkSizes.includes(filters.size)) {
          continue;
        }
      }

      const stats = this.docStats[i];
      let score = 0;

      for (const qt of queryTokens) {
        const n = this.df.get(qt) || 0;
        if (n === 0) continue;

        const idf = Math.log((this.N - n + 0.5) / (n + 0.5) + 1);
        const tf = stats.tf.get(qt) || 0;
        const tfNorm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * stats.length / this.avgDl));
        score += idf * tfNorm;
      }

      // Boost Spearhead chunks slightly (primary product)
      if (chunk.metadata.connection_type === 'Spearhead') {
        score *= 1.15;
      }

      // Boost spec/design chunks for factual queries
      if (['spec', 'design'].includes(chunk.metadata.data_type)) {
        score *= 1.05;
      }

      if (score > 0) {
        scores.push({ index: i, score });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK).map(s => ({
      ...this.chunks[s.index],
      score: s.score,
    }));
  }
}

// Singleton index — loaded once per cold start
let _index: BM25Index | null = null;

export function getIndex(): BM25Index {
  if (!_index) {
    // Dynamic import of chunks.json
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const chunks: Chunk[] = require('../../corpus/chunks.json');
    _index = new BM25Index(chunks);
  }
  return _index;
}
