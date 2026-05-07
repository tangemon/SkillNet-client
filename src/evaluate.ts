import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { SkillDownloader } from './downloader';

export interface EvaluationDimension {
  level: string;
  reason: string;
}

export interface EvaluationResult {
  safety: EvaluationDimension;
  completeness: EvaluationDimension;
  executability: EvaluationDimension;
  maintainability: EvaluationDimension;
  costAwareness: EvaluationDimension;
  error?: string;
}

export interface EvaluatorConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  cacheDir?: string;
  githubToken?: string;
  maxWorkers?: number;
  temperature?: number;
}

export interface SkillMetadata {
  name: string;
  description: string;
  category?: string;
}

export interface ScriptInfo {
  path: string;
  content: string;
}

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_CACHE_DIR = './evaluate_cache_dir';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TEMPERATURE = 0.3;

const SKILL_EVALUATION_PROMPT = `You are an expert evaluator of AI Agent Skills. Evaluate the skill based on the provided metadata, SKILL.md, scripts, and references.

## Skill Metadata
- Name: {skillName}
- Description: {skillDescription}
- Category: {category}

## SKILL.md Content
{skillMdBlock}

## Scripts (if any)
{scriptsBlock}

## References (if any)
{referencesBlock}

## Evaluation Criteria

Evaluate the skill across five dimensions and provide a JSON response:

1. **Safety**: Does the skill contain any harmful, malicious, or inappropriate content? Is it safe to use?

2. **Completeness**: Does the skill have all required components? (SKILL.md, scripts, references, etc.)

3. **Executability**: Can the scripts be executed successfully? Are dependencies properly documented?

4. **Maintainability**: Is the code well-documented? Is the structure clear and maintainable?

5. **Cost Awareness**: Does the skill document API costs, rate limits, or resource requirements?

For each dimension, provide:
- level: One of "Excellent", "Good", "Fair", "Poor"
- reason: A brief explanation for the rating

Return ONLY a valid JSON object with the following structure:
{
  "safety": {"level": "Good", "reason": "..."},
  "completeness": {"level": "Good", "reason": "..."},
  "executability": {"level": "Good", "reason": "..."},
  "maintainability": {"level": "Good", "reason": "..."},
  "costAwareness": {"level": "Good", "reason": "..."}
}`;

interface InternalEvaluatorConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  cacheDir: string;
  githubToken?: string;
  maxWorkers: number;
  temperature: number;
}

export class SkillEvaluator {
  private config: InternalEvaluatorConfig;
  private client: AxiosInstance;

  constructor(config: EvaluatorConfig) {
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new Error('API key is required');
    }

    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || DEFAULT_BASE_URL,
      model: config.model || DEFAULT_MODEL,
      cacheDir: config.cacheDir || DEFAULT_CACHE_DIR,
      githubToken: config.githubToken,
      maxWorkers: config.maxWorkers || 5,
      temperature: config.temperature || DEFAULT_TEMPERATURE
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: 120000,
      headers: {
        'Content-Type': 'application/json'
      },
      proxy: false  // 禁用代理，直接访问内部服务
    });

    this.client.interceptors.request.use((config) => {
      config.headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      return config;
    });
  }

  async evaluateFromPath(skillPath: string, options?: { name?: string; description?: string; category?: string }): Promise<EvaluationResult> {
    const absPath = path.resolve(skillPath);
    
    if (!fs.existsSync(absPath)) {
      return this._createErrorResult(`Invalid skill path: ${skillPath}`);
    }

    const stats = fs.statSync(absPath);
    if (!stats.isDirectory()) {
      return this._createErrorResult(`Invalid skill path: ${skillPath}`);
    }

    try {
      const skillName = options?.name || path.basename(absPath);
      const skillMd = this._loadSkillMd(absPath);
      const scripts = this._loadScripts(absPath);
      const references = this._loadReferences(absPath);

      const prompt = this._buildEvaluationPrompt(
        skillName,
        options?.description || this._extractDescription(skillMd),
        skillMd,
        scripts,
        references,
        options?.category
      );

      const response = await this._callLLM(prompt);
      return this._parseEvaluationResponse(response);
    } catch (error: any) {
      console.error(`Evaluation failed for ${skillPath}:`, error.message);
      return this._createErrorResult(error.message);
    }
  }

  async evaluateFromUrl(url: string, options?: { name?: string; description?: string; category?: string }): Promise<EvaluationResult> {
    if (!this._isValidGitHubUrl(url)) {
      return this._createErrorResult(`Invalid GitHub URL: ${url}`);
    }

    const cacheDir = path.resolve(this.config.cacheDir);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const skillName = options?.name || this._extractNameFromUrl(url);
    const cachePath = path.join(cacheDir, skillName);

    try {
      const downloadedPath = await this._downloadFromGitHub(url, cacheDir);
      return this.evaluateFromPath(downloadedPath, {
        name: skillName,
        description: options?.description,
        category: options?.category
      });
    } catch (error: any) {
      console.error(`Download failed for ${url}:`, error.message);
      return this._createErrorResult(`Download failed: ${error.message}`);
    }
  }

  loadSkillMetadata(skillPath: string): SkillMetadata {
    const absPath = path.resolve(skillPath);
    
    if (!fs.existsSync(absPath)) {
      return { name: '', description: '' };
    }

    const skillName = path.basename(absPath);
    const skillMd = this._loadSkillMd(absPath);
    const description = this._extractDescription(skillMd);

    return {
      name: skillName,
      description: description
    };
  }

  _buildEvaluationPrompt(
    skillName: string,
    skillDescription: string,
    skillMd: string,
    scripts: ScriptInfo[],
    references: ScriptInfo[] = [],
    category?: string
  ): string {
    const skillMdBlock = skillMd || '[SKILL.md not found]';
    
    const scriptsBlock = scripts.length > 0
      ? scripts.map(s => `# ${s.path}\n${s.content}`).join('\n\n')
      : '[No scripts found]';
    
    const referencesBlock = references.length > 0
      ? references.map(r => `# ${r.path}\n${r.content}`).join('\n\n')
      : '[No references found]';

    return SKILL_EVALUATION_PROMPT
      .replace('{skillName}', skillName)
      .replace('{skillDescription}', skillDescription)
      .replace('{category}', category || 'N/A')
      .replace('{skillMdBlock}', skillMdBlock)
      .replace('{scriptsBlock}', scriptsBlock)
      .replace('{referencesBlock}', referencesBlock);
  }

  _parseEvaluationResponse(rawResponse: string): EvaluationResult {
    const cleaned = (rawResponse || '').trim();
    
    if (!cleaned) {
      throw new Error('LLM returned an empty response');
    }

    let jsonStr = cleaned;
    
    const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(jsonStr);
      return {
        safety: parsed.safety || { level: 'Poor', reason: 'No safety evaluation' },
        completeness: parsed.completeness || { level: 'Poor', reason: 'No completeness evaluation' },
        executability: parsed.executability || { level: 'Poor', reason: 'No executability evaluation' },
        maintainability: parsed.maintainability || { level: 'Poor', reason: 'No maintainability evaluation' },
        costAwareness: parsed.costAwareness || { level: 'Poor', reason: 'No cost awareness evaluation' }
      };
    } catch (error) {
      throw new Error(`Failed to parse evaluation response: ${error}`);
    }
  }

  private _loadSkillMd(skillDir: string): string {
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    
    if (!fs.existsSync(skillMdPath)) {
      console.warn(`SKILL.md not found in ${skillDir}`);
      return '';
    }

    try {
      return fs.readFileSync(skillMdPath, 'utf-8');
    } catch (error) {
      console.warn(`Failed to read SKILL.md: ${error}`);
      return '';
    }
  }

  private _loadScripts(skillDir: string, maxFiles: number = 5, maxChars: number = 1200): ScriptInfo[] {
    const scriptsDir = path.join(skillDir, 'scripts');
    
    if (!fs.existsSync(scriptsDir)) {
      return [];
    }

    const scripts: ScriptInfo[] = [];
    
    try {
      const files = this._walkDir(scriptsDir, maxFiles);
      
      for (const file of files) {
        if (!file.endsWith('.py') && !file.endsWith('.js') && !file.endsWith('.ts')) {
          continue;
        }
        
        try {
          const content = fs.readFileSync(file, 'utf-8');
          const truncated = content.length > maxChars 
            ? content.substring(0, maxChars) + '\n\n...[truncated]...'
            : content;
          
          const relPath = path.relative(skillDir, file);
          scripts.push({ path: relPath, content: truncated });
        } catch (error) {
          console.warn(`Failed to read script ${file}: ${error}`);
        }
      }
    } catch (error) {
      console.warn(`Failed to load scripts: ${error}`);
    }

    return scripts;
  }

  private _loadReferences(skillDir: string, maxFiles: number = 10, maxChars: number = 4000): ScriptInfo[] {
    const references: ScriptInfo[] = [];
    const allowedExtensions = ['.md', '.txt', '.json', '.yaml', '.yml', '.ini', '.toml', '.cfg'];
    
    try {
      const files = this._walkDir(skillDir, maxFiles + 10);
      
      for (const file of files) {
        if (file.includes('/scripts/') || file.includes('\\scripts\\')) {
          continue;
        }
        
        const ext = path.extname(file).toLowerCase();
        if (!allowedExtensions.includes(ext) && ext !== '') {
          continue;
        }
        
        if (file.endsWith('SKILL.md') || file.endsWith('skill.md')) {
          continue;
        }
        
        try {
          const content = fs.readFileSync(file, 'utf-8');
          const truncated = content.length > maxChars 
            ? content.substring(0, maxChars) + '\n\n...[truncated]...'
            : content;
          
          const relPath = path.relative(skillDir, file);
          references.push({ path: relPath, content: truncated });
          
          if (references.length >= maxFiles) {
            break;
          }
        } catch (error) {
          console.warn(`Failed to read reference ${file}: ${error}`);
        }
      }
    } catch (error) {
      console.warn(`Failed to load references: ${error}`);
    }

    return references;
  }

  private _walkDir(dir: string, maxFiles: number): string[] {
    const files: string[] = [];
    
    const walk = (currentDir: string, depth: number = 0) => {
      if (files.length >= maxFiles || depth > 10) {
        return;
      }
      
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (files.length >= maxFiles) {
            break;
          }
          
          const fullPath = path.join(currentDir, entry.name);
          
          try {
            if (entry.isDirectory()) {
              walk(fullPath, depth + 1);
            } else if (entry.isFile()) {
              files.push(fullPath);
            }
          } catch (e) {
            console.warn(`Failed to stat ${fullPath}: ${e}`);
          }
        }
      } catch (error) {
        console.warn(`Failed to read directory ${currentDir}: ${error}`);
      }
    };
    
    walk(dir);
    return files;
  }

  private _extractDescription(skillMd: string): string {
    if (!skillMd) {
      return 'No description available.';
    }

    const frontmatterMatch = skillMd.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const descMatch = frontmatter.match(/description:\s*["']?([^"'\n]+)["']?/i);
      if (descMatch) {
        return descMatch[1].trim();
      }
    }

    const lines = skillMd.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
        const cleaned = trimmed.replace(/^#+\s*/, '').trim();
        if (cleaned && !cleaned.startsWith('```')) {
          return cleaned;
        }
      }
    }

    return 'No description available.';
  }

  private _isValidGitHubUrl(url: string): boolean {
    if (!url) {
      return false;
    }
    
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return false;
    }
    
    const normalizedUrl = url.replace('/blob/', '/tree/');
    
    return normalizedUrl.includes('github.com');
  }

  private _extractNameFromUrl(url: string): string {
    const normalizedUrl = url.replace('/blob/', '/tree/');
    const parts = normalizedUrl.split('/');
    const lastPart = parts[parts.length - 1];
    return lastPart.replace(/\/$/, '') || 'unknown-skill';
  }

  private async _downloadFromGitHub(url: string, targetDir: string): Promise<string> {
    // 使用 SkillDownloader 下载文件（支持代理和 CONNECT 隧道）
    const downloader = new SkillDownloader({
      apiToken: this.config.githubToken,
      timeout: 30,
      maxRetries: 3
    });

    const normalizedUrl = url.replace('/blob/', '/tree/');
    const downloadedPath = await downloader.download(normalizedUrl, targetDir);
    
    if (!downloadedPath) {
      throw new Error('Download failed');
    }
    
    return downloadedPath;
  }

  private async _downloadDirectory(apiUrl: string, targetDir: string, headers: Record<string, string>): Promise<void> {
    // 这个方法现在由 SkillDownloader 处理
  }

  private async _callLLM(prompt: string): Promise<string> {
    const messages = [
      {
        role: 'system',
        content: 'You are an expert evaluator of AI Agent Skills. Follow the JSON schema and constraints exactly. Return ONLY a valid JSON object. Do not include markdown, explanations, or extra text.'
      },
      { role: 'user', content: prompt }
    ];

    try {
      const response = await this.client.post('/chat/completions', {
        model: this.config.model,
        messages: messages,
        temperature: this.config.temperature
      });

      return response.data.choices[0].message.content;
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw error;
    }
  }

  private _createErrorResult(errorMsg: string): EvaluationResult {
    const errorItem: EvaluationDimension = { level: 'Poor', reason: `Evaluation failed: ${errorMsg}` };
    return {
      safety: errorItem,
      completeness: errorItem,
      executability: errorItem,
      maintainability: errorItem,
      costAwareness: errorItem,
      error: errorMsg
    };
  }
}

export { SkillEvaluator as default };
