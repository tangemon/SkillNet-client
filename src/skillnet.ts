import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';

import { Creator, CreateResult, DEFAULT_MODEL } from './creator';
import { SkillRelationshipAnalyzer as Analyzer, AnalyzerConfig } from './analyzer';

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

const DEFAULT_SKILLNET_URL = 'http://api-skillnet.openkg.cn/v1';
const DEFAULT_LLM_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_DOWNLOAD_DIR = './skillnet_downloads';

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

      const analyzer = new Analyzer({
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
