import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';

import { Creator, CreateResult, DEFAULT_MODEL } from './creator';

export enum SearchMode {
  Keyword = 'keyword',
  Vector = 'vector'
}

export enum SortBy {
  Stars = 'stars',
  Recent = 'recent'
}

// ============================================================================
// Interfaces
// ============================================================================

export interface ClientConfig {
  apiKey?: string;
  /** SkillNet API 服务端地址，默认: http://api-skillnet.openkg.cn/v1 */
  skillnetUrl?: string;
  /** LLM API 端点（用于 create/evaluate/analyze），默认: https://api.openai.com/v1 */
  baseUrl?: string;
  githubToken?: string;
}

export interface SearchOptions {
  q: string;
  mode?: SearchMode;
  category?: string;
  limit?: number;
  page?: number;
  minStars?: number;
  sortBy?: SortBy;
  threshold?: number;
}

export interface SkillInfo {
  skillName: string;
  skillDescription: string;
  author: string;
  stars: number;
  skillUrl: string;
  category?: string;
}

export interface DownloadOptions {
  url: string;
  targetDir?: string;
}

export interface CreateOptions {
  trajectoryContent?: string;
  githubUrl?: string;
  officeFile?: string;
  prompt?: string;
  outputDir: string;
  model?: string;
}

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
}

export interface EvaluateOptions {
  target: string;
  category?: string;
  model?: string;
}

export interface AnalyzeOptions {
  skillsDir: string;
  noSave?: boolean;
  model?: string;
  local?: boolean;
}

export interface Relationship {
  source: string;
  type: string;
  target: string;
  reason?: string;
}

export interface AnalyzerConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

const DEFAULT_SKILLNET_URL = 'http://api-skillnet.openkg.cn/v1';
const DEFAULT_LLM_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_DOWNLOAD_DIR = './skillnet_downloads';

// ============================================================================
// Relationship Analysis Prompts
// ============================================================================

const RELATIONSHIP_ANALYSIS_SYSTEM_PROMPT = `You are the SkillNet Architect.`;

const RELATIONSHIP_ANALYSIS_USER_PROMPT_TEMPLATE = `Your task is to map logical relationships between the provided skills based on their names and descriptions.

You must strictly identify ONLY the following 4 types of relationships:

1. similar_to
   - A and B perform functionally equivalent tasks (e.g., "Google Search" and "Bing Search").
   - Users can replace A with B.

2. belong_to
   - A is a sub-component or specific step within B.
   - B represents a larger workflow or agent, and A is just one part of it.
   - Direction: Child -> belong_to -> Parent.

3. compose_with
   - A and B are independent but often used together in a workflow.
   - One usually produces data that the other consumes, or they are logically paired.
   - Example: "PDF Parser" compose_with "Text Summarizer".

4. depend_on
   - A CANNOT execute without B.
   - B is a hard dependency (e.g., Environment setup, API Key loader, or a core library skill).
   - Direction: Dependent -> depend_on -> Prerequisite.

Here is the list of Skills in the user's local environment. Please analyze them and generate the relationships.

Skills List:
{skills_list}

Remember:
- Be conservative. Only create a relationship if there is a logical connection based on the name and description.
- Do not hallucinate skills not in the list.

Output Format:
Return a JSON array where each element represents a relationship with the following keys:
- source: (string) The name of the source skill (the one initiating the relationship)
- target: (string) The name of the target skill (the one receiving the relationship)
- type: (string) One of the 4 relationship types: "similar_to", "belong_to", "compose_with", "depend_on"
- reason: (string) A brief explanation of why this relationship exists based on the skill descriptions.

Output Example:
[
    {
      "source": "google_search_tool",
      "target": "bing_search_tool",
      "type": "similar_to",
      "reason": "Both provide web search capabilities and are interchangeable."
    },
    ...
]

Keep your output in the format below:
<Skill_Relationships>
your generated JSON array here
</Skill_Relationships>`;

// ============================================================================
// SkillRelationshipAnalyzer Class - Local Skill Relationship Analysis
// ============================================================================

class SkillRelationshipAnalyzer {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private client: AxiosInstance;

  constructor(config: AnalyzerConfig) {
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new Error('API key is required');
    }

    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || DEFAULT_LLM_BASE_URL;
    this.model = config.model || DEFAULT_MODEL;

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async analyzeLocalSkills(skillsDir: string, saveToFile: boolean = true): Promise<Relationship[]> {
    if (!fs.existsSync(skillsDir)) {
      throw new Error(`Directory not found: ${skillsDir}`);
    }

    const skillsMetadata = this.loadSkillsMetadata(skillsDir);
    if (skillsMetadata.length < 2) {
      console.warn('Not enough skills found to analyze relationships (need at least 2).');
      return [];
    }

    console.log(`Found ${skillsMetadata.length} skills. Analyzing potential connections...`);

    const relationships = await this.generateRelationshipGraph(skillsMetadata);

    if (saveToFile && relationships.length > 0) {
      const outputPath = path.join(skillsDir, 'relationships.json');
      try {
        fs.writeFileSync(outputPath, JSON.stringify(relationships, null, 2), 'utf-8');
        console.log(`Relationships saved to: ${outputPath}`);
      } catch (error: any) {
        console.error(`Failed to save relationships file: ${error.message}`);
      }
    }

    return relationships;
  }

  private loadSkillsMetadata(rootDir: string): Array<{ name: string; description: string }> {
    const skills: Array<{ name: string; description: string }> = [];

    if (!fs.existsSync(rootDir)) {
      return skills;
    }

    const entries = fs.readdirSync(rootDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(rootDir, entry.name);
        const skillName = entry.name;
        let description = 'No description provided.';

        const skillMdPath = path.join(skillPath, 'SKILL.md');
        if (fs.existsSync(skillMdPath)) {
          try {
            const content = fs.readFileSync(skillMdPath, 'utf-8');
            description = this._extractDescription(content);
          } catch (error) {
            console.warn(`Could not read content for ${skillName}`);
          }
        }

        skills.push({
          name: skillName,
          description: description
        });
      }
    }

    return skills;
  }

  _extractDescription(content: string): string {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const fmText = frontmatterMatch[1];
      const descMatch = fmText.match(/description:\s*(.+)$/m);
      if (descMatch) {
        return descMatch[1].trim().replace(/^["']|["']$/g, '');
      }
    }

    const cleanText = content
      .replace(/^#+\s.*/gm, '')
      .replace(/```[\s\S]*?```/g, '');
    const lines = cleanText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length > 0) {
      return lines[0];
    }

    return 'No description available.';
  }

  _extractJsonFromTags(content: string, tagName: string): string {
    const startTag = `<${tagName}>`;
    const endTag = `</${tagName}>`;

    if (content.includes(startTag) && content.includes(endTag)) {
      const startIndex = content.indexOf(startTag) + startTag.length;
      const endIndex = content.indexOf(endTag);
      return content.substring(startIndex, endIndex).trim();
    }

    return content
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
  }

  private async generateRelationshipGraph(skills: Array<{ name: string; description: string }>): Promise<Relationship[]> {
    const skillsJson = JSON.stringify(skills, null, 2);

    const messages = [
      { role: 'system', content: RELATIONSHIP_ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: RELATIONSHIP_ANALYSIS_USER_PROMPT_TEMPLATE.replace('{skills_list}', skillsJson) }
    ];

    try {
      const response = await this.client.post('/chat/completions', {
        model: this.model,
        messages: messages
      });

      const content = response.data.choices[0].message.content;

      const jsonStr = this._extractJsonFromTags(content, 'Skill_Relationships');

      let parsedData: any;
      try {
        parsedData = JSON.parse(jsonStr);
      } catch (error) {
        console.error('Failed to parse JSON content');
        return [];
      }

      const edges: any[] = [];
      if (Array.isArray(parsedData)) {
        edges.push(...parsedData);
      } else if (typeof parsedData === 'object' && parsedData !== null && 'relationships' in parsedData) {
        edges.push(...parsedData.relationships);
      }

      const validNames = new Set(skills.map(s => s.name));
      const validTypes = new Set(['similar_to', 'belong_to', 'compose_with', 'depend_on']);

      const validEdges: Relationship[] = [];
      for (const edge of edges) {
        if (typeof edge !== 'object' || edge === null) {
          continue;
        }

        const sourceName = edge.source;
        const targetName = edge.target;
        const relType = edge.type;

        if (
          sourceName && targetName && relType &&
          validNames.has(sourceName) &&
          validNames.has(targetName) &&
          validTypes.has(relType) &&
          sourceName !== targetName
        ) {
          validEdges.push({
            source: sourceName,
            target: targetName,
            type: relType,
            reason: edge.reason || 'No reason provided'
          });
        }
      }

      console.log(`Identified ${validEdges.length} valid relationships.`);
      return validEdges;

    } catch (error: any) {
      console.error(`Failed to analyze relationships: ${error.message}`);
      return [];
    }
  }
}

export { SkillRelationshipAnalyzer as Analyzer };

// ============================================================================
// SkillNetClient Class - Main API Client
// ============================================================================

export class SkillNetClient {
  private client: AxiosInstance;
  private apiKey?: string;
  private githubToken?: string;
  private llmBaseUrl: string;

  constructor(config: ClientConfig = {}) {
    const skillnetUrl = config.skillnetUrl || DEFAULT_SKILLNET_URL;
    this.llmBaseUrl = config.baseUrl || DEFAULT_LLM_BASE_URL;
    
    this.client = axios.create({
      baseURL: skillnetUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (config.apiKey) {
      this.apiKey = config.apiKey;
    }

    if (config.githubToken) {
      this.githubToken = config.githubToken;
    }

    this.client.interceptors.request.use((config) => {
      if (this.apiKey) {
        config.headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
      if (this.githubToken) {
        config.headers['X-GitHub-Token'] = this.githubToken;
      }
      return config;
    });
  }

  async search(options: SearchOptions): Promise<SkillInfo[]> {
    if (!options.q || options.q.trim() === '') {
      throw new Error('Search query is required');
    }

    const params: Record<string, any> = {
      q: options.q
    };

    if (options.mode) {
      params.mode = options.mode;
    } else {
      params.mode = SearchMode.Keyword;
    }

    if (options.category) {
      params.category = options.category;
    }

    if (options.limit !== undefined) {
      params.limit = Math.min(options.limit, 50);
    }

    if (options.mode === SearchMode.Keyword || !options.mode) {
      if (options.page !== undefined) {
        params.page = options.page;
      }
      if (options.minStars !== undefined) {
        params.min_stars = options.minStars;
      }
      if (options.sortBy) {
        params.sort_by = options.sortBy;
      }
    }

    if (options.mode === SearchMode.Vector) {
      if (options.threshold !== undefined) {
        params.threshold = options.threshold;
      }
    }

    try {
      const response = await this.client.get('/search', { params });
      const data = response.data;

      if (!data.success) {
        throw new Error('Search failed');
      }

      return (data.data || []).map((item: any) => ({
        skillName: item.skill_name,
        skillDescription: item.skill_description,
        author: item.author,
        stars: item.stars,
        skillUrl: item.skill_url,
        category: item.category
      }));
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw error;
    }
  }

  async download(options: DownloadOptions): Promise<string> {
    if (!options.url || options.url.trim() === '') {
      throw new Error('URL is required');
    }

    const params: Record<string, any> = {
      url: options.url
    };

    if (options.targetDir) {
      params.target_dir = options.targetDir;
    } else {
      params.target_dir = DEFAULT_DOWNLOAD_DIR;
    }

    try {
      const response = await this.client.get('/download', { params });
      const data = response.data;

      if (!data.success) {
        throw new Error('Download failed');
      }

      return data.path;
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw error;
    }
  }

  async create(options: CreateOptions): Promise<CreateResult> {
    if (!this.apiKey) {
      throw new Error('API key is required for create operation');
    }

    const hasSource = options.trajectoryContent || options.githubUrl || options.officeFile || options.prompt;
    if (!hasSource) {
      throw new Error('At least one source (trajectoryContent, githubUrl, officeFile, or prompt) is required');
    }

    // 使用Creator类进行本地创建
    const creator = new Creator({
      apiKey: this.apiKey,
      baseUrl: this.llmBaseUrl,
      model: options.model,
      githubToken: this.githubToken
    });

    try {
      // 根据输入源类型选择相应的创建方法
      if (options.trajectoryContent) {
        const result = await creator.createFromTrajectory({
          trajectory: options.trajectoryContent,
          outputDir: options.outputDir,
          model: options.model
        });
        return result;
      }

      if (options.prompt) {
        const result = await creator.createFromPrompt({
          prompt: options.prompt,
          outputDir: options.outputDir,
          model: options.model
        });
        return result;
      }

      if (options.officeFile) {
        const result = await creator.createFromOffice({
          filePath: options.officeFile,
          outputDir: options.outputDir,
          model: options.model
        });
        return result;
      }

      if (options.githubUrl) {
        const result = await creator.createFromGitHub({
          githubUrl: options.githubUrl,
          outputDir: options.outputDir,
          model: options.model
        });
        return result;
      }

      return {
        success: false,
        skillPaths: [],
        message: 'No valid source provided'
      };
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw error;
    }
  }

  async evaluate(options: EvaluateOptions): Promise<{ success: boolean; evaluation: EvaluationResult }> {
    if (!this.apiKey) {
      throw new Error('API key is required for evaluate operation');
    }

    if (!options.target || options.target.trim() === '') {
      throw new Error('Target is required');
    }

    const body: Record<string, any> = {
      target: options.target,
      base_url: this.llmBaseUrl
    };

    if (options.category) {
      body.category = options.category;
    }
    if (options.model) {
      body.model = options.model;
    }

    try {
      const response = await this.client.post('/evaluate', body);
      const data = response.data;

      return {
        success: data.success,
        evaluation: {
          safety: data.evaluation.safety,
          completeness: data.evaluation.completeness,
          executability: data.evaluation.executability,
          maintainability: data.evaluation.maintainability,
          costAwareness: data.evaluation.cost_awareness
        }
      };
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw error;
    }
  }

  async analyze(options: AnalyzeOptions): Promise<Relationship[]> {
    if (!options.skillsDir || options.skillsDir.trim() === '') {
      throw new Error('Skills directory is required');
    }

    if (options.local) {
      if (!this.apiKey) {
        throw new Error('API key is required for local analyze operation');
      }

      const analyzer = new SkillRelationshipAnalyzer({
        apiKey: this.apiKey,
        baseUrl: this.llmBaseUrl,
        model: options.model
      });

      const relationships = await analyzer.analyzeLocalSkills(options.skillsDir, !options.noSave);
      return relationships;
    } else {
      if (!this.apiKey) {
        throw new Error('API key is required for analyze operation');
      }

      const body: Record<string, any> = {
        skills_dir: options.skillsDir,
        base_url: this.llmBaseUrl
      };

      if (options.noSave) {
        body.no_save = true;
      }
      if (options.model) {
        body.model = options.model;
      }

      try {
        const response = await this.client.post('/analyze', body);
        const data = response.data;

        return (data.relationships || []).map((rel: any) => ({
          source: rel.source,
          type: rel.type,
          target: rel.target,
          reason: rel.reason
        }));
      } catch (error: any) {
        if (error.response?.data?.error) {
          throw new Error(error.response.data.error);
        }
        throw error;
      }
    }
  }
}

export { SkillNetClient as default };
