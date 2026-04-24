import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface CommitInput {
  sha: string;
  message: string;
  author?: string | null;
  authoredAt: string;
  additions: number;
  deletions: number;
  filesChanged: number;
  diff: string;
}

export type Platform = 'TWITTER' | 'LINKEDIN' | 'GENERIC';

@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);

  private get baseUrl() {
    return process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  }
  private get coderModel() {
    return process.env.OLLAMA_CODER_MODEL || 'qwen2.5-coder:32b';
  }
  private get chatModel() {
    return process.env.OLLAMA_CHAT_MODEL || 'qwen3:32b';
  }

  async health(): Promise<{ ok: boolean; models: string[] }> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/api/tags`, { timeout: 5000 });
      const models: string[] = (data?.models || []).map((m: any) => m.name);
      return { ok: true, models };
    } catch (e: any) {
      this.logger.warn(`ollama health failed: ${e?.message}`);
      return { ok: false, models: [] };
    }
  }

  private async generate(model: string, prompt: string, system?: string): Promise<string> {
    const { data } = await axios.post(
      `${this.baseUrl}/api/generate`,
      {
        model,
        prompt,
        system,
        stream: false,
        options: { temperature: 0.4, num_ctx: 8192 },
      },
      { timeout: 1000 * 60 * 10 },
    );
    return String(data?.response ?? '').trim();
  }

  async summarizeCommits(commits: CommitInput[]): Promise<string> {
    const compact = commits
      .map(
        (c) =>
          `COMMIT ${c.sha.substring(0, 7)} by ${c.author ?? 'unknown'} at ${c.authoredAt}\nMessage: ${c.message}\nFiles: ${c.filesChanged} +${c.additions} -${c.deletions}\nDiff:\n${c.diff || '(no diff)'}\n`,
      )
      .join('\n----\n');
    const prompt = `You are a senior developer reviewing recent git changes.

Analyze the commits and diffs below. Produce a structured technical summary in clean Markdown with these sections:
1. What changed (bulleted, concrete)
2. Why it likely matters (user impact / engineering value)
3. Notable technical details (libraries, patterns, refactors, fixes)
4. Suggested narrative angle for a build in public update (one paragraph)

Be precise and avoid filler. Do not invent features that are not in the diffs.

COMMITS:
${compact}`;
    return this.generate(
      this.coderModel,
      prompt,
      'You are a precise senior software engineer.',
    );
  }

  async polishToPost(
    summary: string,
    platform: Platform,
    tone: string = 'engaging but not cringe',
  ): Promise<string> {
    const constraints =
      platform === 'TWITTER'
        ? 'Write a single post under 280 characters. No hashtags spam. At most one hashtag.'
        : platform === 'LINKEDIN'
        ? 'Write a LinkedIn style post, 80 to 160 words, with a strong opening line, short paragraphs, and one closing question. No hashtags spam.'
        : 'Write a short build in public update, around 100 words, platform agnostic.';
    const prompt = `You are a developer writing a "build in public" update.

Tone: ${tone}. Plain language. First person. No corporate buzzwords. Do not use emojis. Do not start with "Excited to".

${constraints}

Use the structured summary below as ground truth. Do not invent features.

STRUCTURED SUMMARY:
${summary}

Return ONLY the final post text. No preamble, no explanations, no quotes.`;
    return this.generate(
      this.chatModel,
      prompt,
      'You write concise authentic developer updates.',
    );
  }
}
